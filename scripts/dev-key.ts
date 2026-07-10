import sql from "../src/storage/postgres";
import { createHash } from "node:crypto";

const tenantId = "05c404de-8999-4ce5-ad2f-821c184ddfb0";
const keySecret = "sk_test_demo0000000000000000data0000feed";
const keyHash = createHash("sha256").update(keySecret, "utf-8").digest("hex");

await sql`
  INSERT INTO api_keys (tenant_id, key_prefix, key_hash)
  VALUES (${tenantId}, 'arb_test_', ${keyHash})
  ON CONFLICT DO NOTHING
`;

console.log("API_KEY=" + keySecret);
console.log("TENANT_ID=" + tenantId);
await sql.end();
