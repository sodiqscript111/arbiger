import sql from "../storage/postgres";
import { correlate } from "./correlator";
import { classify } from "./classifier";
import type { DiagnosisProvider } from "../providers/diagnosis";

const CORRELATION_INTERVAL_MS = 5 * 60 * 1000; 

let intervalTimer: Timer | null = null;

export function startCorrelationJob(diagnosisProvider?: DiagnosisProvider) {
  if (intervalTimer) return;

  intervalTimer = setInterval(async () => {
    try {
      
      const tenants = await sql`SELECT id FROM tenants`;

      for (const row of tenants) {
        const tenantId = (row as any).id as string;
        try {
          
          const affectedIncidentIds = await correlate(tenantId);
          
          
          for (const incidentId of affectedIncidentIds) {
            const result = await classify(tenantId, incidentId);
            
            
            const incRows = await sql`SELECT root_cause_detail FROM incidents WHERE id = ${incidentId}`;
            const existingDetail = (incRows[0]?.root_cause_detail as any) || {};

            await sql`
              UPDATE incidents
              SET root_cause_category = ${result.category},
                  root_cause_detail = COALESCE(root_cause_detail, '{}'::jsonb) || ${sql.json(result.evidence)},
                  title = ${result.title},
                  updated_at = NOW()
              WHERE id = ${incidentId}
            `;
            
            
            if (diagnosisProvider && !existingDetail.ai_summary) {
              await diagnosisProvider.analyzeIncident(tenantId, incidentId);
            }
          }

          
          await sql`
            UPDATE incidents
            SET status = 'resolved', updated_at = NOW()
            WHERE tenant_id = ${tenantId}
              AND status = 'open'
              AND window_end < NOW() - INTERVAL '1 hour'
          `;

        } catch (err) {
          console.error(`Correlation failed for tenant ${tenantId}:`, err);
        }
      }
    } catch (err) {
      console.error("Correlation job failed:", err);
    }
  }, CORRELATION_INTERVAL_MS);

  intervalTimer.unref();
  console.log(`Started correlation job (interval=${CORRELATION_INTERVAL_MS}ms)`);
}

export function stopCorrelationJob() {
  if (intervalTimer) {
    clearInterval(intervalTimer);
    intervalTimer = null;
  }
}
