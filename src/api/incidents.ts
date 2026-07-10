import sql from "../storage/postgres";
import type { PaginatedResponse, IncidentListItem, IncidentDetail, IncidentStatus } from "../types";

export interface IncidentListParams {
  tenantId: string;
  cursor?: string;
  limit?: number;
  status?: string;
  category?: string;
  since?: string;
  until?: string;
}

export async function listIncidents(
  params: IncidentListParams,
): Promise<PaginatedResponse<IncidentListItem>> {
  const limit = Math.min(params.limit ?? 50, 100);

  const conditions: string[] = ["tenant_id = $1"];
  const values: unknown[] = [params.tenantId];
  let paramIdx = 2;

  if (params.status) {
    conditions.push(`status = $${paramIdx++}`);
    values.push(params.status);
  }
  if (params.category) {
    conditions.push(`root_cause_category = $${paramIdx++}`);
    values.push(params.category);
  }
  if (params.since) {
    conditions.push(`window_start >= $${paramIdx++}`);
    values.push(params.since);
  }
  if (params.until) {
    conditions.push(`window_end <= $${paramIdx++}`);
    values.push(params.until);
  }
  
  let cursorClause = "";
  if (params.cursor) {
    cursorClause = `AND window_start < $${paramIdx++}`;
    values.push(decodeURIComponent(params.cursor));
  }

  const whereClause = conditions.join(" AND ");

  const query = `
    SELECT id, title, root_cause_category, status, window_start, window_end, fingerprint_count, total_event_count, created_at
    FROM incidents
    WHERE ${whereClause} ${cursorClause}
    ORDER BY window_start DESC
    LIMIT $${paramIdx}
  `;
  values.push(limit + 1);

  const rows = await sql.unsafe(query, values as any[]);

  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit).map((r: any) => ({
    id: r.id,
    title: r.title,
    root_cause_category: r.root_cause_category,
    status: r.status,
    window_start: r.window_start instanceof Date ? r.window_start.toISOString() : r.window_start,
    window_end: r.window_end instanceof Date ? r.window_end.toISOString() : r.window_end,
    fingerprint_count: r.fingerprint_count,
    total_event_count: r.total_event_count,
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  }));

  const nextCursor = hasMore
    ? encodeURIComponent(String((rows[limit - 1] as any).window_start))
    : null;

  return {
    data,
    pagination: { cursor: nextCursor, has_more: hasMore },
  };
}

export async function getIncidentDetail(
  tenantId: string,
  incidentId: string,
): Promise<IncidentDetail | null> {
  const rows = await sql`
    SELECT id, title, root_cause_category, root_cause_detail, status, window_start, window_end, fingerprint_count, total_event_count, created_at
    FROM incidents
    WHERE id = ${incidentId} AND tenant_id = ${tenantId}
    LIMIT 1
  `;

  if (rows.length === 0) return null;
  const r = rows[0] as any;

  const fpRows = await sql`
    SELECT f.id, f.handler, f.error_type, i.event_count
    FROM incident_fingerprints i
    JOIN fingerprints f ON f.id = i.fingerprint_id
    WHERE i.incident_id = ${incidentId}
    ORDER BY i.event_count DESC
  `;

  return {
    id: r.id,
    title: r.title,
    root_cause_category: r.root_cause_category,
    root_cause_detail: r.root_cause_detail,
    status: r.status,
    window_start: r.window_start instanceof Date ? r.window_start.toISOString() : r.window_start,
    window_end: r.window_end instanceof Date ? r.window_end.toISOString() : r.window_end,
    fingerprint_count: r.fingerprint_count,
    total_event_count: r.total_event_count,
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    fingerprints: fpRows.map((fp: any) => ({
      id: fp.id,
      handler: fp.handler,
      error_type: fp.error_type,
      event_count: fp.event_count,
    })),
  };
}

export async function updateIncidentStatus(
  tenantId: string,
  incidentId: string,
  status: string,
): Promise<boolean> {
  const validStatuses: IncidentStatus[] = ["open", "resolved"];
  if (!validStatuses.includes(status as IncidentStatus)) return false;

  const result = await sql`
    UPDATE incidents
    SET status = ${status}, updated_at = NOW()
    WHERE id = ${incidentId} AND tenant_id = ${tenantId}
    RETURNING id
  `;

  return result.length > 0;
}
