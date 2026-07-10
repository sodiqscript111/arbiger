import sql from "../storage/postgres";
import { reclaimPendingEvents } from "./pending-queue";

const RECLAIM_INTERVAL_MS = 60 * 1000; 
const MAX_IDLE_TIME_MS = 5 * 60 * 1000; 

let intervalTimer: Timer | null = null;

export function startReclaimJob() {
  if (intervalTimer) return;

  intervalTimer = setInterval(async () => {
    try {
      
      
      const tenants = await sql`SELECT id FROM tenants`;

      for (const row of tenants) {
        const tenantId = (row as any).id as string;
        try {
          
          await reclaimPendingEvents(tenantId, MAX_IDLE_TIME_MS);
        } catch (err) {
          console.error(`Reclaim failed for tenant ${tenantId}:`, err);
        }
      }
    } catch (err) {
      console.error("Reclaim job failed:", err);
    }
  }, RECLAIM_INTERVAL_MS);

  
  intervalTimer.unref();
  console.log(`Started pending-events reclaim job (interval=${RECLAIM_INTERVAL_MS}ms, timeout=${MAX_IDLE_TIME_MS}ms)`);
}

export function stopReclaimJob() {
  if (intervalTimer) {
    clearInterval(intervalTimer);
    intervalTimer = null;
  }
}
