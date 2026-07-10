import sql from "../storage/postgres";
import type { EventListItem, EventDetail, PaginatedResponse } from "../types";

export async function listEventsByFingerprint(
  tenantId: string,
  fingerprintId: string,
  cursor?: string,
  limit?: number,
): Promise<PaginatedResponse<EventListItem>> {
  const pageLimit = Math.min(limit ?? 50, 100);
  const values: unknown[] = [tenantId, fingerprintId];
  let paramIdx = 3;

  let cursorClause = "";
  if (cursor) {
    cursorClause = `AND e.occurred_at < $${paramIdx++}`;
    values.push(decodeURIComponent(cursor));
  }

  const query = `
    SELECT e.id, e.error_message, e.retry_count, e.max_retries, e.occurred_at
    FROM events e
    WHERE e.tenant_id = $1 AND e.fingerprint_id = $2 ${cursorClause}
    ORDER BY e.occurred_at DESC
    LIMIT $${paramIdx}
  `;
  values.push(pageLimit + 1);

  const rows = await sql.unsafe(query, values as any[]);
  const hasMore = rows.length > pageLimit;
  const eventRows = rows.slice(0, pageLimit);

  const events: EventListItem[] = [];
  for (const r of eventRows) {
    const attempts = await sql`
      SELECT attempt_number, error_type, error_message, occurred_at
      FROM retry_attempts
      WHERE event_id = ${(r as any).id}
      ORDER BY attempt_number ASC
    `;

    events.push({
      id: (r as any).id,
      error_message: (r as any).error_message,
      retry_count: (r as any).retry_count,
      max_retries: (r as any).max_retries,
      occurred_at: (r as any).occurred_at instanceof Date
        ? (r as any).occurred_at.toISOString()
        : (r as any).occurred_at,
      retry_attempts: attempts.map((a: any) => ({
        attempt_number: a.attempt_number,
        error_type: a.error_type,
        error_message: a.error_message,
        occurred_at: a.occurred_at instanceof Date ? a.occurred_at.toISOString() : a.occurred_at,
      })),
    });
  }

  const nextCursor = hasMore
    ? encodeURIComponent(String((eventRows[eventRows.length - 1] as any).occurred_at))
    : null;

  return {
    data: events,
    pagination: { cursor: nextCursor, has_more: hasMore },
  };
}

export async function getEventDetail(
  tenantId: string,
  eventId: string,
): Promise<EventDetail | null> {
  const rows = await sql`
    SELECT id, error_message, payload, stack_trace, retry_count, max_retries, occurred_at, metadata, fingerprint_id
    FROM events
    WHERE id = ${eventId} AND tenant_id = ${tenantId}
    LIMIT 1
  `;

  if (rows.length === 0) return null;
  const r = rows[0] as any;

  const attempts = await sql`
    SELECT attempt_number, error_type, error_message, occurred_at
    FROM retry_attempts
    WHERE event_id = ${eventId}
    ORDER BY attempt_number ASC
  `;

  return {
    id: r.id,
    fingerprint_id: r.fingerprint_id,
    error_message: r.error_message,
    payload: r.payload,
    stack_trace: r.stack_trace,
    metadata: r.metadata,
    retry_count: r.retry_count,
    max_retries: r.max_retries,
    occurred_at: r.occurred_at instanceof Date ? r.occurred_at.toISOString() : r.occurred_at,
    retry_attempts: attempts.map((a: any) => ({
      attempt_number: a.attempt_number,
      error_type: a.error_type,
      error_message: a.error_message,
      occurred_at: a.occurred_at instanceof Date ? a.occurred_at.toISOString() : a.occurred_at,
    })),
  };
}
