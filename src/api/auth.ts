import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import sql from "../storage/postgres";
import redis from "../storage/redis";

const KEY_CACHE_TTL = 3600;
const JWT_SECRET = process.env.JWT_SECRET || "arbiger_super_secret_jwt_key_for_dev";

function hashApiKey(key: string): string {
  return createHash("sha256").update(key, "utf-8").digest("hex");
}

export function parseBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

export async function resolveTenantIdFromKey(apiKey: string): Promise<string | null> {
  const keyHash = hashApiKey(apiKey);

  const cached = await redis.get(`api_key:${keyHash}`);
  if (cached) return cached;

  const rows = await sql`
    SELECT api_keys.tenant_id
    FROM api_keys
    WHERE api_keys.key_hash = ${keyHash} AND api_keys.revoked_at IS NULL
    LIMIT 1
  `;

  if (rows.length === 0) return null;

  const tenantId = rows[0].tenant_id as string;
  await redis.set(`api_key:${keyHash}`, tenantId, "EX", KEY_CACHE_TTL);

  return tenantId;
}


export async function createApiKey(tenantId: string): Promise<string> {
  const rawKey = "arb_" + randomBytes(32).toString("hex");
  const prefix = rawKey.substring(0, 8);
  const hash = hashApiKey(rawKey);

  await sql`
    INSERT INTO api_keys (tenant_id, key_prefix, key_hash)
    VALUES (${tenantId}, ${prefix}, ${hash})
  `;

  return rawKey;
}

export async function authMiddleware(req: Request): Promise<Response | null> {
  const token = parseBearerToken(req);
  if (!token) {
    return new Response(JSON.stringify({ error: "missing or invalid authorization header" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  
  if (token.startsWith("eyJ")) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; email: string };
      (req as any).userId = decoded.userId;

      
      
      const requestedTenantId = req.headers.get("X-Tenant-ID");
      if (requestedTenantId) {
        
        const mems = await sql`SELECT 1 FROM workspace_memberships WHERE user_id = ${decoded.userId} AND tenant_id = ${requestedTenantId}`;
        if (mems.length === 0) {
          return new Response(JSON.stringify({ error: "Access denied to tenant" }), { status: 403 });
        }
        (req as any).tenantId = requestedTenantId;
      }
      return null;
    } catch (err) {
      return new Response(JSON.stringify({ error: "invalid jwt" }), { status: 401 });
    }
  }

  
  const tenantId = await resolveTenantIdFromKey(token);
  if (!tenantId) {
    return new Response(JSON.stringify({ error: "invalid api key" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  (req as any).tenantId = tenantId;
  return null;
}
