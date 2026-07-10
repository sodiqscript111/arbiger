import sql from "../storage/postgres";
import redis from "../storage/redis";
import { computeFingerprint } from "./fingerprint";
import { addPendingEvent } from "./pending-queue";
import type { IngestEventRequest, IngestEventResponse } from "../types";
import type { DiagnosisProvider } from "../providers/diagnosis";
import type { AlertingProvider } from "../providers/alerting";
import { NoopDiagnosisProvider } from "../providers/diagnosis";
import { NoopAlertingProvider } from "../providers/alerting";

const LOCK_TTL_SECONDS = 5;

export interface IngesterOptions {
  diagnosisProvider?: DiagnosisProvider;
  alertingProvider?: AlertingProvider;
}

interface IngestResult {
  response: IngestEventResponse;
  isDuplicate: boolean;
}

export class Ingester {
  private diagnosis: DiagnosisProvider;
  private alerting: AlertingProvider;

  constructor(opts?: IngesterOptions) {
    this.diagnosis = opts?.diagnosisProvider ?? new NoopDiagnosisProvider();
    this.alerting = opts?.alertingProvider ?? new NoopAlertingProvider();
  }

  async ingest(tenantId: string, req: IngestEventRequest): Promise<IngestResult> {
    
    if (req.idempotency_key) {
      const existing = await sql`
        SELECT e.id AS event_id, e.fingerprint_id, f.fingerprint_hash
        FROM events e
        JOIN fingerprints f ON f.id = e.fingerprint_id
        WHERE e.tenant_id = ${tenantId} AND e.idempotency_key = ${req.idempotency_key}
        LIMIT 1
      `;

      if (existing.length > 0) {
        const row = existing[0] as any;
        return {
          response: {
            event_id: row.event_id,
            fingerprint: {
              id: row.fingerprint_id,
              hash: row.fingerprint_hash,
              is_new: false,
              _links: { group: `/api/v1/fingerprints/${row.fingerprint_id}` },
            },
          },
          isDuplicate: true,
        };
      }
    }

    
    const fingerprintHash = computeFingerprint(req.handler, req.error_type);

    
    
    
    
    const fpResult = await sql`
      INSERT INTO fingerprints (tenant_id, fingerprint_hash, handler, error_type, sample_stack_trace)
      VALUES (${tenantId}, ${fingerprintHash}, ${req.handler}, ${req.error_type}, ${req.stack_trace ?? null})
      ON CONFLICT (tenant_id, fingerprint_hash) DO UPDATE
        SET last_seen  = NOW(),
            event_count = fingerprints.event_count + 1,
            status     = CASE
                           WHEN fingerprints.status = 'resolved' THEN 'active'::fingerprint_status
                           ELSE fingerprints.status
                         END,
            reopened_at = CASE
                            WHEN fingerprints.status = 'resolved' THEN NOW()
                            ELSE fingerprints.reopened_at
                          END
      RETURNING id, event_count = 1 AS is_new
    `;

    const fingerprintId = fpResult[0].id as string;
    const isNew = fpResult[0].is_new as boolean;

    
    
    
    const eventResult = await sql`
      INSERT INTO events (tenant_id, fingerprint_id, error_message, payload, stack_trace,
                          retry_count, max_retries, occurred_at, idempotency_key)
      VALUES (${tenantId}, ${fingerprintId}, ${req.error_message}, ${sql.json(req.payload as any)},
              ${req.stack_trace ?? null}, ${req.retry_count}, ${req.max_retries},
              ${req.occurred_at}, ${req.idempotency_key ?? null})
      ON CONFLICT (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL
        DO NOTHING
      RETURNING id
    `;

    let eventId: string;

    if (eventResult.length === 0) {
      
      
      const existing = await sql`
        SELECT id FROM events
        WHERE tenant_id = ${tenantId} AND idempotency_key = ${req.idempotency_key!}
        LIMIT 1
      `;
      eventId = existing[0].id as string;

      return {
        response: {
          event_id: eventId,
          fingerprint: {
            id: fingerprintId,
            hash: fingerprintHash,
            is_new: isNew,
            _links: { group: `/api/v1/fingerprints/${fingerprintId}` },
          },
        },
        isDuplicate: true,
      };
    }

    eventId = eventResult[0].id as string;

    
    if (req.retry_attempts && req.retry_attempts.length > 0) {
      for (const attempt of req.retry_attempts) {
        await sql`
          INSERT INTO retry_attempts (event_id, attempt_number, error_type, error_message, occurred_at)
          VALUES (${eventId}, ${attempt.attempt_number}, ${attempt.error_type ?? null},
                  ${attempt.error_message ?? null}, ${attempt.occurred_at})
        `;
      }
    }

    
    
    
    
    addPendingEvent(tenantId, {
      event_id: eventId,
      fingerprint_id: fingerprintId,
      handler: req.handler,
      error_type: req.error_type,
      error_message: req.error_message,
      occurred_at: req.occurred_at,
    }).catch(err => console.error("Failed to add pending event:", err));

    
    
    
    
    
    const lockKey = `fingerprint_lock:${tenantId}:${fingerprintHash}`;
    const lockAcquired = await redis.set(lockKey, "1", "EX", LOCK_TTL_SECONDS, "NX");

    if (lockAcquired === "OK") {
      this.diagnosis.analyze(fingerprintId).catch(() => {});
    }

    
    this.alerting.evaluate(
      { id: eventId, tenant_id: tenantId, fingerprint_id: fingerprintId } as any,
      { id: fingerprintId } as any,
    ).catch(() => {});

    return {
      response: {
        event_id: eventId,
        fingerprint: {
          id: fingerprintId,
          hash: fingerprintHash,
          is_new: isNew,
          _links: { group: `/api/v1/fingerprints/${fingerprintId}` },
        },
      },
      isDuplicate: false,
    };
  }
}
