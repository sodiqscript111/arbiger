import sql from "../storage/postgres";
import { createApiKey } from "./auth";

export async function handleCreateWorkspace(req: Request): Promise<Response> {
  const userId = (req as any).userId;
  if (!userId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  try {
    const { name } = await req.json();
    if (!name) return new Response(JSON.stringify({ error: "Name is required" }), { status: 400 });

    const tenantRows = await sql`
      INSERT INTO tenants (name) VALUES (${name}) RETURNING id, name
    `;
    const tenant = tenantRows[0];

    await sql`
      INSERT INTO workspace_memberships (user_id, tenant_id, role)
      VALUES (${userId}, ${tenant.id}, 'owner')
    `;

    const rawKey = await createApiKey(tenant.id);

    return new Response(JSON.stringify({ tenant, apiKey: rawKey }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}

export async function handleListWorkspaces(req: Request): Promise<Response> {
  const userId = (req as any).userId;
  if (!userId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  try {
    const rows = await sql`
      SELECT t.id, t.name, m.role
      FROM tenants t
      JOIN workspace_memberships m ON t.id = m.tenant_id
      WHERE m.user_id = ${userId}
      ORDER BY t.created_at ASC
    `;

    return new Response(JSON.stringify(rows), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
