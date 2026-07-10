import { Ingester } from "./ingester";
import { validateEventBody } from "./validator";

const ingester = new Ingester();

export async function handleIngest(req: Request): Promise<Response> {
  const tenantId = (req as any).tenantId as string | undefined;
  if (!tenantId) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const validation = validateEventBody(body);
  if (!validation.valid) {
    return new Response(JSON.stringify({ error: "validation failed", detail: validation.errors }), {
      status: validation.statusCode ?? 422,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const { response, isDuplicate } = await ingester.ingest(tenantId, validation.data!);
    return new Response(JSON.stringify(response), {
      status: isDuplicate ? 200 : 201,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    console.error("Ingest failed:", err);
    return new Response(JSON.stringify({ error: "internal server error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
