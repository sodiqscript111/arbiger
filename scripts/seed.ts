import sql from "../src/storage/postgres";
import { createHash, randomUUID } from "node:crypto";

const [tenant] = await sql`
  INSERT INTO tenants (id, name) VALUES ('d91c3687-6db4-4d82-b713-66ca4cac11c0', 'test-tenant') RETURNING id
`;

const keySecret = process.env.API_KEY || "";
const keyHash = createHash("sha256").update(keySecret, "utf-8").digest("hex");

await sql`
  INSERT INTO api_keys (tenant_id, key_prefix, key_hash)
  VALUES (${tenant.id}, 'arb_test_', ${keyHash})
`;

console.log("TENANT_ID:", tenant.id);
// Secret not logged

await sql.end();
