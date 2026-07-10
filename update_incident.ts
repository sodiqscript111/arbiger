import sql from "./src/storage/postgres";

async function run() {
  const incidents = await sql`SELECT * FROM incidents`;
  if (incidents.length === 0) {
    console.log("No incidents found. Creating one...");
    const tenants = await sql`SELECT id FROM tenants LIMIT 1`;
    if (tenants.length === 0) {
        console.log("No tenant found");
        process.exit(1);
    }
    const tenantId = tenants[0].id;
    
    await sql`
      INSERT INTO incidents (tenant_id, title, root_cause_category, status, window_start, window_end, root_cause_detail)
      VALUES (
        ${tenantId}, 
        'Database connection spikes', 
        'database_timeout', 
        'open', 
        NOW() - INTERVAL '1 hour', 
        NOW(), 
        '{"ai_summary": "We detected a massive spike in connection pooling timeouts. Your database is rejecting connections because max_connections is reached. Please scale up your Postgres instance or restart your application workers."}'
      )
    `;
    console.log("Created open incident.");
  } else {
    console.log("Updating existing incident...");
    await sql`
      UPDATE incidents 
      SET status = 'open', root_cause_detail = '{"ai_summary": "We detected a massive spike in connection pooling timeouts. Your database is rejecting connections because max_connections is reached. Please scale up your Postgres instance or restart your application workers."}'
      WHERE id = ${incidents[0].id}
    `;
    console.log("Updated existing incident.");
  }
  process.exit(0);
}
run();
