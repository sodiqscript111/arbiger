import sql from "../src/storage/postgres";

const tenants = await sql`SELECT id, name FROM tenants`;
for (const t of tenants) {
  console.log("Tenant:", (t as any).id, (t as any).name);
  const keys = await sql`SELECT id, key_prefix, revoked_at FROM api_keys WHERE tenant_id = ${(t as any).id}`;
  for (const k of keys) {
    console.log("  Key:", (k as any).id, (k as any).key_prefix, (k as any).revoked_at);
  }
}
await sql.end();
