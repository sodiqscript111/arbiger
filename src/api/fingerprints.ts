import sql from "../storage/postgres";
import type { FingerprintDetail, FingerprintListItem, PaginatedResponse } from "../types";

export interface FingerprintListParams {
  tenantId: string;
  cursor?: string;
  limit?: number;
  status?: string;
  handler?: string;
  errorType?: string;
  since?: string;
  until?: string;
  search?: string;
  sort?: string;
  order?: string;
}

export async function listFingerprints(
  params: FingerprintListParams,
): Promise<PaginatedResponse<FingerprintListItem>> {
  const limit = Math.min(params.limit ?? 50, 100);
  const sort = params.sort ?? "last_seen";
  const order = params.order ?? "desc";
  const validSorts = ["last_seen", "event_count", "first_seen"];
  const sortColumn = validSorts.includes(sort) ? sort : "last_seen";
  const orderDir = order === "asc" ? "ASC" : "DESC";

  const conditions: string[] = ["f.tenant_id = $1"];
  const values: unknown[] = [params.tenantId];
  let paramIdx = 2;

  if (params.status) {
    conditions.push(`f.status = $${paramIdx++}`);
    values.push(params.status);
  }
  if (params.handler) {
    conditions.push(`f.handler = $${paramIdx++}`);
    values.push(params.handler);
  }
  if (params.errorType) {
    conditions.push(`f.error_type = $${paramIdx++}`);
    values.push(params.errorType);
  }
  if (params.since) {
    conditions.push(`f.last_seen >= $${paramIdx++}`);
    values.push(params.since);
  }
  if (params.until) {
    conditions.push(`f.last_seen <= $${paramIdx++}`);
    values.push(params.until);
  }
  if (params.search) {
    conditions.push(`e.error_message ILIKE $${paramIdx++}`);
    values.push(`%${params.search}%`);
  }

  const whereClause = conditions.join(" AND ");
  const cursorClause = params.cursor
    ? `AND f.${sortColumn} ${orderDir === "DESC" ? "<" : ">"} $${paramIdx++}`
    : "";
  if (params.cursor) {
    values.push(decodeURIComponent(params.cursor));
  }

  const query = `
    SELECT f.id, f.fingerprint_hash, f.handler, f.error_type,
           (SELECT e2.error_message FROM events e2 WHERE e2.fingerprint_id = f.id ORDER BY e2.occurred_at DESC LIMIT 1) AS sample_error_message,
           f.event_count, f.first_seen, f.last_seen, f.status, f.diagnosis_status
    FROM fingerprints f
    LEFT JOIN LATERAL (
      SELECT error_message FROM events WHERE fingerprint_id = f.id ORDER BY occurred_at DESC LIMIT 1
    ) e ON true
    WHERE ${whereClause} ${cursorClause}
    ORDER BY f.${sortColumn} ${orderDir}
    LIMIT $${paramIdx}
  `;
  values.push(limit + 1);

  const rows = await sql.unsafe(query, values as any[]);

  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit).map((r: any) => ({
    id: r.id,
    fingerprint_hash: r.fingerprint_hash,
    handler: r.handler,
    error_type: r.error_type,
    sample_error_message: r.sample_error_message ?? "",
    event_count: r.event_count,
    first_seen: r.first_seen instanceof Date ? r.first_seen.toISOString() : r.first_seen,
    last_seen: r.last_seen instanceof Date ? r.last_seen.toISOString() : r.last_seen,
    status: r.status,
    diagnosis_status: r.diagnosis_status,
  }));

  const nextCursor = hasMore
    ? encodeURIComponent(String((rows[limit - 1] as any)[sortColumn]))
    : null;

  return {
    data,
    pagination: { cursor: nextCursor, has_more: hasMore },
  };
}

export async function getFingerprintDetail(
  tenantId: string,
  fingerprintId: string,
): Promise<FingerprintDetail | null> {
  const fp = await sql`
    SELECT * FROM fingerprints
    WHERE id = ${fingerprintId} AND tenant_id = ${tenantId}
    LIMIT 1
  `;

  if (fp.length === 0) return null;
  const r = fp[0] as any;

  const messageRows = await sql`
    SELECT error_message, COUNT(*) as cnt
    FROM events
    WHERE fingerprint_id = ${fingerprintId}
    GROUP BY error_message
    ORDER BY cnt DESC
    LIMIT 20
  `;

  const frequencies: Record<string, number> = {};
  for (const row of messageRows) {
    frequencies[(row as any).error_message] = Number((row as any).cnt);
  }

  return {
    id: r.id,
    fingerprint_hash: r.fingerprint_hash,
    handler: r.handler,
    error_type: r.error_type,
    sample_error_message: "",
    sample_stack_trace: r.sample_stack_trace,
    event_count: r.event_count,
    first_seen: r.first_seen instanceof Date ? r.first_seen.toISOString() : r.first_seen,
    last_seen: r.last_seen instanceof Date ? r.last_seen.toISOString() : r.last_seen,
    status: r.status,
    diagnosis_status: r.diagnosis_status,
    error_message_frequencies: frequencies,
    diagnosis: r.diagnosis,
  };
}

export async function updateFingerprintStatus(
  tenantId: string,
  fingerprintId: string,
  status: string,
): Promise<boolean> {
  const validStatuses = ["active", "acknowledged", "resolved"];
  if (!validStatuses.includes(status)) return false;

  const result = await sql`
    UPDATE fingerprints
    SET status = ${status}, updated_at = NOW()
    WHERE id = ${fingerprintId} AND tenant_id = ${tenantId}
    RETURNING id
  `;

  return result.length > 0;
}
