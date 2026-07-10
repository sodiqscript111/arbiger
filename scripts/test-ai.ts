import sql from "../src/storage/postgres";
import { correlate } from "../src/analysis/correlator";
import { classify } from "../src/analysis/classifier";
import { OpenAIDiagnosisProvider } from "../src/providers/openai-diagnosis";

async function main() {
  console.log("Starting AI test...");

  // Get first tenant
  const tenants = await sql`SELECT id FROM tenants LIMIT 1`;
  if (tenants.length === 0) {
    console.log("No tenants found.");
    return;
  }
  const tenantId = tenants[0].id as string;

  // 1. Insert 3 new fingerprints to simulate a new downstream service failing
  const ts = new Date();
  
  const fp1 = await sql`INSERT INTO fingerprints (tenant_id, fingerprint_hash, handler, error_type) VALUES (${tenantId}, ${'hash1_' + ts.getTime()}, 'checkout/payment', 'ConnectionTimeout') RETURNING id`;
  const fp2 = await sql`INSERT INTO fingerprints (tenant_id, fingerprint_hash, handler, error_type) VALUES (${tenantId}, ${'hash2_' + ts.getTime()}, 'checkout/inventory', 'ConnectionTimeout') RETURNING id`;
  const fp3 = await sql`INSERT INTO fingerprints (tenant_id, fingerprint_hash, handler, error_type) VALUES (${tenantId}, ${'hash3_' + ts.getTime()}, 'checkout/shipping', 'ConnectionTimeout') RETURNING id`;
  
  const fpIds = [fp1[0].id, fp2[0].id, fp3[0].id];

  // 2. Insert events for them in the current 5-min bucket
  for (let i = 0; i < 5; i++) {
    for (const fpId of fpIds) {
      await sql`
        INSERT INTO events (tenant_id, fingerprint_id, occurred_at, error_message, stack_trace, payload, retry_count, max_retries)
        VALUES (${tenantId}, ${fpId}, ${ts}, 'Failed to connect to internal load balancer on 10.0.0.55: timeout after 5000ms', 'Error: ConnectionTimeout\\n  at makeRequest (lib/http.ts:44)\\n  at Checkout.process (checkout/index.ts:12)', ${sql.json({})}, 0, 3)
      `;
    }
  }

  console.log("Inserted test events.");

  // 3. Run correlation
  console.log("Running correlator...");
  const affectedIncidentIds = await correlate(tenantId);
  console.log("Affected incidents:", affectedIncidentIds);

  const aiProvider = new OpenAIDiagnosisProvider();

  // 4. Run classification and AI
  for (const incidentId of affectedIncidentIds) {
    const result = await classify(tenantId, incidentId);
    console.log(`Incident ${incidentId} classified as:`, result.category);
    
    await sql`
      UPDATE incidents
      SET root_cause_category = ${result.category},
          root_cause_detail = COALESCE(root_cause_detail, '{}'::jsonb) || ${sql.json(result.evidence)},
          title = ${result.title},
          updated_at = NOW()
      WHERE id = ${incidentId}
    `;

    console.log(`Calling OpenAI for ${incidentId}...`);
    await aiProvider.analyzeIncident(tenantId, incidentId);
    
    // Fetch result
    const inc = await sql`SELECT root_cause_detail FROM incidents WHERE id = ${incidentId}`;
    console.log("AI Result:");
    console.log(JSON.stringify(inc[0].root_cause_detail, null, 2));
  }

  console.log("Test complete.");
  process.exit(0);
}

main().catch(console.error);
