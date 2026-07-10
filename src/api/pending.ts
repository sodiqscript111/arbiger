import sql from "../storage/postgres";
import {
  readPendingEvents,
  ackPendingEvents,
  getPendingStats,
  type PendingEntry,
  type PendingStats,
} from "../ingestion/pending-queue";
import { getEventDetail } from "./events";
import type { EventDetail } from "../types";

export interface PendingEventResponse {
  stream_entry_id: string;
  event: EventDetail;
}




export async function handleGetPendingEvents(
  tenantId: string,
  req: Request,
  searchParams: URLSearchParams,
): Promise<{ data: PendingEventResponse[]; count: number }> {
  const consumer = req.headers.get("x-consumer-id") || "default-worker";
  const limit = Math.min(
    parseInt(searchParams.get("limit") || "50", 10) || 50,
    200,
  );
  const handlerFilter = searchParams.get("handler");

  
  const entries: PendingEntry[] = await readPendingEvents(
    tenantId,
    "retry-workers",
    consumer,
    limit,
    0, 
  );

  const results: PendingEventResponse[] = [];

  for (const entry of entries) {
    if (handlerFilter && entry.fields.handler !== handlerFilter) {
      
      
      
      
      
      
      
      
      
      
      
      
      
      continue;
    }

    const eventId = entry.fields.event_id;
    const eventDetail = await getEventDetail(tenantId, eventId);
    
    if (eventDetail) {
      results.push({
        stream_entry_id: entry.id,
        event: eventDetail,
      });
    }
  }

  return { data: results, count: results.length };
}




export async function handleReportEvent(
  tenantId: string,
  eventId: string,
  body: unknown,
): Promise<{ success: boolean; error?: string }> {
  if (!body || typeof body !== "object") {
    return { success: false, error: "request body must be a JSON object" };
  }

  const { outcome, stream_entry_id } = body as { outcome?: string; stream_entry_id?: string };

  if (!stream_entry_id || typeof stream_entry_id !== "string") {
    return { success: false, error: "stream_entry_id is required" };
  }

  if (outcome === "resolved") {
    
    const updated = await sql`
      UPDATE events
      SET resolved_at = NOW()
      WHERE id = ${eventId} AND tenant_id = ${tenantId}
      RETURNING fingerprint_id
    `;

    if (updated.length > 0) {
      const fingerprintId = (updated[0] as any).fingerprint_id;
      
      
      const unresolved = await sql`
        SELECT id FROM events
        WHERE fingerprint_id = ${fingerprintId} AND tenant_id = ${tenantId} AND resolved_at IS NULL
        LIMIT 1
      `;
      
      
      if (unresolved.length === 0) {
        await sql`
          UPDATE fingerprints
          SET status = 'resolved', updated_at = NOW()
          WHERE id = ${fingerprintId} AND tenant_id = ${tenantId}
        `;
      }
    }

    
    await ackPendingEvents(tenantId, [stream_entry_id], "retry-workers");
    return { success: true };

  } else if (outcome === "failed_again") {
    
    await sql`
      UPDATE events
      SET retry_count = retry_count + 1
      WHERE id = ${eventId} AND tenant_id = ${tenantId}
    `;

    
    return { success: true };
  }

  return { success: false, error: "outcome must be 'resolved' or 'failed_again'" };
}




export async function handlePendingStats(
  tenantId: string,
  searchParams: URLSearchParams,
): Promise<PendingStats> {
  const group = searchParams.get("group") || "retry-workers";
  return getPendingStats(tenantId, group);
}
