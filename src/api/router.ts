import { authMiddleware } from "./auth";
import { handleSignup, handleLogin } from "./auth_routes";
import { handleCreateWorkspace, handleListWorkspaces } from "./workspace_routes";
import { handleIngest } from "../ingestion/handler";
import { listFingerprints, getFingerprintDetail, updateFingerprintStatus } from "./fingerprints";
import { listEventsByFingerprint, getEventDetail } from "./events";
import { getFingerprintInsights } from "./insights";
import { handleGetPendingEvents, handleReportEvent, handlePendingStats } from "./pending";
import { listIncidents, getIncidentDetail, updateIncidentStatus } from "./incidents";
import { getDashboardStats } from "./stats";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function parseUrl(req: Request): { pathname: string; searchParams: URLSearchParams } {
  const url = new URL(req.url);
  return { pathname: url.pathname, searchParams: url.searchParams };
}

export async function route(req: Request): Promise<Response> {
  const { pathname, searchParams } = parseUrl(req);
  const method = req.method;

  
  if (method === "POST" && pathname === "/api/v1/auth/signup") {
    return handleSignup(req);
  }
  if (method === "POST" && pathname === "/api/v1/auth/login") {
    return handleLogin(req);
  }

  const authResult = await authMiddleware(req);
  if (authResult) return authResult;

  
  if (method === "POST" && pathname === "/api/v1/workspaces") {
    return handleCreateWorkspace(req);
  }
  if (method === "GET" && pathname === "/api/v1/workspaces") {
    return handleListWorkspaces(req);
  }

  const tenantId = (req as any).tenantId as string;
  if (!tenantId) {
    return new Response(JSON.stringify({ error: "tenant id required" }), { status: 400 });
  }

  if (method === "POST" && pathname === "/api/v1/events") {
    return handleIngest(req);
  }

  if (method === "GET" && pathname === "/api/v1/stats") {
    const stats = await getDashboardStats(tenantId);
    return json(stats);
  }

  if (method === "GET" && pathname === "/api/v1/fingerprints") {
    const result = await listFingerprints({
      tenantId,
      cursor: searchParams.get("cursor") ?? undefined,
      limit: searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : undefined,
      status: searchParams.get("status") ?? undefined,
      handler: searchParams.get("handler") ?? undefined,
      errorType: searchParams.get("error_type") ?? undefined,
      since: searchParams.get("since") ?? undefined,
      until: searchParams.get("until") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      sort: searchParams.get("sort") ?? undefined,
      order: searchParams.get("order") ?? undefined,
    });
    return json(result);
  }

  const fingerprintMatch = pathname.match(/^\/api\/v1\/fingerprints\/([0-9a-f-]+)$/);
  if (fingerprintMatch) {
    const fingerprintId = fingerprintMatch[1];

    if (method === "GET") {
      const detail = await getFingerprintDetail(tenantId, fingerprintId);
      if (!detail) return json({ error: "not found" }, 404);
      return json(detail);
    }

    if (method === "PATCH") {
      let body: { status?: string };
      try {
        body = await req.json();
      } catch {
        return json({ error: "invalid JSON" }, 400);
      }
      if (!body.status) {
        return json({ error: "status is required" }, 422);
      }
      const ok = await updateFingerprintStatus(tenantId, fingerprintId, body.status);
      if (!ok) return json({ error: "not found or invalid status" }, 404);
      return json({ status: body.status });
    }
  }

  const eventsMatch = pathname.match(/^\/api\/v1\/fingerprints\/([0-9a-f-]+)\/events$/);
  if (eventsMatch && method === "GET") {
    const fingerprintId = eventsMatch[1];
    const result = await listEventsByFingerprint(
      tenantId,
      fingerprintId,
      searchParams.get("cursor") ?? undefined,
      searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : undefined,
    );
    return json(result);
  }

  const singleEventMatch = pathname.match(/^\/api\/v1\/events\/([0-9a-f-]+)$/);
  if (singleEventMatch && method === "GET") {
    const eventId = singleEventMatch[1];
    const detail = await getEventDetail(tenantId, eventId);
    if (!detail) return json({ error: "not found" }, 404);
    return json(detail);
  }

  const insightsMatch = pathname.match(/^\/api\/v1\/fingerprints\/([0-9a-f-]+)\/insights$/);
  if (insightsMatch && method === "GET") {
    const fingerprintId = insightsMatch[1];
    const insight = await getFingerprintInsights(tenantId, fingerprintId, searchParams);
    if (!insight) return json({ error: "not found" }, 404);
    return json(insight);
  }

  

  if (method === "GET" && pathname === "/api/v1/events/pending") {
    const result = await handleGetPendingEvents(tenantId, req, searchParams);
    return json(result);
  }

  

  if (method === "GET" && pathname === "/api/v1/incidents") {
    const result = await listIncidents({
      tenantId,
      cursor: searchParams.get("cursor") ?? undefined,
      limit: searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : undefined,
      status: searchParams.get("status") ?? undefined,
      category: searchParams.get("category") ?? undefined,
      since: searchParams.get("since") ?? undefined,
      until: searchParams.get("until") ?? undefined,
    });
    return json(result);
  }

  const incidentMatch = pathname.match(/^\/api\/v1\/incidents\/([0-9a-f-]+)$/);
  if (incidentMatch) {
    const incidentId = incidentMatch[1];
    
    if (method === "GET") {
      const detail = await getIncidentDetail(tenantId, incidentId);
      if (!detail) return json({ error: "not found" }, 404);
      return json(detail);
    }
    
    if (method === "PATCH") {
      let body: { status?: string };
      try {
        body = await req.json();
      } catch {
        return json({ error: "invalid JSON" }, 400);
      }
      if (!body.status) return json({ error: "status is required" }, 422);
      
      const ok = await updateIncidentStatus(tenantId, incidentId, body.status);
      if (!ok) return json({ error: "not found or invalid status" }, 404);
      return json({ status: body.status });
    }
  }

  const reportMatch = pathname.match(/^\/api\/v1\/events\/([^/]+)\/report$/);
  if (method === "POST" && reportMatch) {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid JSON body" }, 400);
    }
    const result = await handleReportEvent(tenantId, reportMatch[1], body);
    if (!result.success) return json(result, 422);
    return json(result);
  }

  if (method === "GET" && pathname === "/api/v1/pending/stats") {
    const result = await handlePendingStats(tenantId, searchParams);
    return json(result);
  }

  return json({ error: "not found" }, 404);
}
