export interface Tenant {
  id: string;
  name: string;
  created_at: Date;
  settings: Record<string, unknown>;
}

export interface ApiKey {
  id: string;
  tenant_id: string;
  key_prefix: string;
  key_hash: string;
  created_at: Date;
  revoked_at: Date | null;
}

export type FingerprintStatus = "active" | "acknowledged" | "resolved";
export type DiagnosisStatus = "none" | "pending" | "completed" | "failed";

export interface Fingerprint {
  id: string;
  tenant_id: string;
  fingerprint_hash: string;
  handler: string;
  error_type: string;
  sample_stack_trace: string | null;
  status: FingerprintStatus;
  first_seen: Date;
  last_seen: Date;
  event_count: number;
  diagnosis: Record<string, unknown> | null;
  diagnosis_status: DiagnosisStatus;
  created_at: Date;
  updated_at: Date;
  reopened_at: Date | null;
}

export interface DeadEvent {
  id: string;
  tenant_id: string;
  fingerprint_id: string;
  error_message: string;
  payload: unknown;
  stack_trace: string | null;
  retry_count: number;
  max_retries: number;
  occurred_at: string;
  received_at: string;
  metadata: Record<string, unknown> | null;
  idempotency_key: string | null;
}

export interface RetryAttempt {
  id: string;
  event_id: string;
  attempt_number: number;
  error_type: string | null;
  error_message: string | null;
  occurred_at: string;
}

export interface IngestEventRequest {
  handler: string;
  error_type: string;
  error_message: string;
  payload: unknown;
  retry_count: number;
  max_retries: number;
  occurred_at: string;
  stack_trace?: string;
  idempotency_key?: string;
  retry_attempts?: {
    attempt_number: number;
    error_type?: string;
    error_message?: string;
    occurred_at: string;
  }[];
}

export interface IngestEventResponse {
  event_id: string;
  fingerprint: {
    id: string;
    hash: string;
    is_new: boolean;
    _links: {
      group: string;
    };
  };
}

export interface FingerprintListQuery {
  cursor?: string;
  limit?: number;
  status?: FingerprintStatus;
  handler?: string;
  error_type?: string;
  since?: string;
  until?: string;
  search?: string;
  sort?: "last_seen" | "event_count" | "first_seen";
  order?: "asc" | "desc";
}

export interface FingerprintListItem {
  id: string;
  fingerprint_hash: string;
  handler: string;
  error_type: string;
  sample_error_message: string;
  event_count: number;
  first_seen: string;
  last_seen: string;
  status: FingerprintStatus;
  diagnosis_status: DiagnosisStatus;
}

export interface FingerprintDetail extends FingerprintListItem {
  sample_stack_trace: string | null;
  error_message_frequencies: Record<string, number>;
  diagnosis: Record<string, unknown> | null;
}

export interface EventListItem {
  id: string;
  error_message: string;
  retry_count: number;
  max_retries: number;
  occurred_at: string;
  retry_attempts: {
    attempt_number: number;
    error_type: string | null;
    error_message: string | null;
    occurred_at: string;
  }[];
}

export interface EventDetail extends EventListItem {
  fingerprint_id: string;
  payload: unknown;
  stack_trace: string | null;
  metadata: Record<string, unknown> | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    cursor: string | null;
    has_more: boolean;
  };
}

export interface ApiError {
  error: string;
  detail?: unknown;
}

export type RootCauseCategory =
  | 'downstream_service'
  | 'infrastructure'
  | 'deployment'
  | 'third_party'
  | 'rate_limiting'
  | 'auth_failure'
  | 'data_schema'
  | 'unknown';

export type IncidentStatus = 'open' | 'resolved';

export interface IncidentListItem {
  id: string;
  title: string;
  root_cause_category: RootCauseCategory;
  status: IncidentStatus;
  window_start: string;
  window_end: string;
  fingerprint_count: number;
  total_event_count: number;
  created_at: string;
}

export interface IncidentDetail extends IncidentListItem {
  root_cause_detail: {
    ai_summary?: string;
    suggested_action?: string;
    [key: string]: unknown;
  } | null;
  fingerprints: {
    id: string;
    handler: string;
    error_type: string;
    event_count: number;
  }[];
}
