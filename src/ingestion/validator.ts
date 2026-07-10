import type { IngestEventRequest } from "../types";



const VALID_HANDLER_RE = /^[a-zA-Z0-9_\-./]{1,256}$/;
const VALID_ERROR_TYPE_RE = /^[a-zA-Z0-9_\-.]{1,256}$/;

const MAX_PAYLOAD_BYTES = 64 * 1024;

export interface ValidationResult {
  valid: boolean;
  statusCode?: number;
  errors?: { field: string; message: string }[];
  data?: IngestEventRequest;
}

export function validateEventBody(body: unknown): ValidationResult {
  if (!body || typeof body !== "object") {
    return { valid: false, errors: [{ field: "body", message: "Request body must be a JSON object" }] };
  }

  const r = body as Record<string, unknown>;
  const errors: { field: string; message: string }[] = [];

  const handler = validateString(r.handler, "handler", errors, VALID_HANDLER_RE);
  const error_type = validateString(r.error_type, "error_type", errors, VALID_ERROR_TYPE_RE);
  const error_message = validateString(r.error_message, "error_message", errors);
  const retry_count = validateInt(r.retry_count, "retry_count", errors);
  const max_retries = validateInt(r.max_retries, "max_retries", errors);
  const occurred_at = validateTimestamp(r.occurred_at, "occurred_at", errors);

  if (r.payload === undefined || r.payload === null) {
    errors.push({ field: "payload", message: "payload is required" });
  } else {
    const payloadBytes = new TextEncoder().encode(JSON.stringify(r.payload)).length;
    if (payloadBytes > MAX_PAYLOAD_BYTES) {
      errors.push({ field: "payload", message: `payload exceeds ${(MAX_PAYLOAD_BYTES / 1024).toFixed(0)}KB limit` });
    }
  }

  if (r.retry_attempts !== undefined) {
    if (!Array.isArray(r.retry_attempts)) {
      errors.push({ field: "retry_attempts", message: "retry_attempts must be an array" });
    } else {
      for (let i = 0; i < r.retry_attempts.length; i++) {
        const a = r.retry_attempts[i];
        if (!a || typeof a !== "object") {
          errors.push({ field: `retry_attempts[${i}]`, message: "must be an object" });
          continue;
        }
        const attemptNum = (a as Record<string, unknown>).attempt_number;
        if (typeof attemptNum !== "number" || attemptNum < 1 || !Number.isInteger(attemptNum)) {
          errors.push({ field: `retry_attempts[${i}].attempt_number`, message: "must be a positive integer" });
        }
        if ((a as Record<string, unknown>).occurred_at) {
          validateTimestamp((a as Record<string, unknown>).occurred_at, `retry_attempts[${i}].occurred_at`, errors);
        }
      }
    }
  }

  if (errors.length > 0) {
    const isPayloadTooLarge = errors.some(
      (e) => e.field === "payload" && e.message.includes("KB limit"),
    );
    return { valid: false, statusCode: isPayloadTooLarge ? 413 : undefined, errors };
  }

  return {
    valid: true,
    data: {
      handler: handler!,
      error_type: error_type!,
      error_message: error_message!,
      payload: r.payload,
      retry_count: retry_count!,
      max_retries: max_retries!,
      occurred_at: occurred_at!,
      stack_trace: typeof r.stack_trace === "string" ? r.stack_trace : undefined,
      idempotency_key: typeof r.idempotency_key === "string" && r.idempotency_key.length > 0
        ? r.idempotency_key
        : undefined,
      retry_attempts: r.retry_attempts as IngestEventRequest["retry_attempts"],
    },
  };
}

function validateString(
  val: unknown,
  field: string,
  errors: { field: string; message: string }[],
  pattern?: RegExp,
): string | undefined {
  if (typeof val !== "string" || val.trim().length === 0) {
    errors.push({ field, message: `${field} must be a non-empty string` });
    return undefined;
  }
  if (pattern && !pattern.test(val)) {
    errors.push({ field, message: `${field} contains invalid characters` });
    return undefined;
  }
  return val.trim();
}

function validateInt(
  val: unknown,
  field: string,
  errors: { field: string; message: string }[],
): number | undefined {
  if (typeof val !== "number" || !Number.isInteger(val) || val < 0) {
    errors.push({ field, message: `${field} must be a non-negative integer` });
    return undefined;
  }
  return val;
}

function validateTimestamp(
  val: unknown,
  field: string,
  errors: { field: string; message: string }[],
): string | undefined {
  if (typeof val !== "string") {
    errors.push({ field, message: `${field} must be an ISO 8601 string` });
    return undefined;
  }
  const d = new Date(val);
  if (isNaN(d.getTime())) {
    errors.push({ field, message: `${field} is not a valid date` });
    return undefined;
  }
  if (d.getTime() > Date.now() + 60_000) {
    errors.push({ field, message: `${field} cannot be more than 1 minute in the future` });
    return undefined;
  }
  return val;
}
