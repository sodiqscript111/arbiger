export interface FingerprintListItem {
  id: string;
  fingerprint_hash: string;
  handler: string;
  error_type: string;
  sample_error_message: string;
  event_count: number;
  first_seen: string;
  last_seen: string;
  status: "active" | "acknowledged" | "resolved";
  diagnosis_status: "none" | "pending" | "completed" | "failed";
}

export interface FingerprintDetail extends FingerprintListItem {
  sample_stack_trace: string | null;
  error_message_frequencies: Record<string, number>;
  diagnosis: Record<string, unknown> | null;
  reopened_at?: string | null;
}

export interface RetryAttempt {
  attempt_number: number;
  error_type: string | null;
  error_message: string | null;
  occurred_at: string;
}

export interface EventListItem {
  id: string;
  error_message: string;
  retry_count: number;
  max_retries: number;
  occurred_at: string;
  retry_attempts: RetryAttempt[];
}

export interface EventDetail extends EventListItem {
  payload: unknown;
  stack_trace: string | null;
  metadata: Record<string, unknown> | null;
  fingerprint_id: string;
}

export interface SpikeState {
  state: "spiking" | "not_spiking" | "insufficient_data";
  current_volume: number;
  baseline_median: number;
  ratio: number | null;
}

export interface Insights {
  fingerprint_id: string;
  is_new: boolean;
  is_spiking: SpikeState;
  is_persistent: boolean;
  retry_drift_detected: boolean;
  computed_at: string;
}

export interface Paginated<T> {
  data: T[];
  pagination: { cursor: string | null; has_more: boolean };
}

export interface DashboardStats {
  active_fingerprints: number;
  resolved_fingerprints: number;
  open_incidents: number;
  total_events: number;
}

export interface ApiConfig {
  baseUrl: string;
  apiKey: string;
  tenantId?: string;
}

function headers(cfg: ApiConfig) {
  const h: Record<string, string> = {
    Authorization: `Bearer ${cfg.apiKey}`,
    "Content-Type": "application/json",
  };
  if (cfg.tenantId) {
    h["X-Tenant-ID"] = cfg.tenantId;
  }
  return h;
}

async function request<T>(cfg: ApiConfig, path: string, init?: RequestInit): Promise<T> {
  const url = `${cfg.baseUrl.replace(/\/$/, "")}${path}`;
  const res = await fetch(url, { ...init, headers: { ...headers(cfg), ...(init?.headers ?? {}) } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${res.status} on ${path}${body ? ` — ${body}` : ""}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listFingerprints(cfg: ApiConfig, params: Record<string, string | number | undefined> = {}) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "" && v !== null) qs.set(k, String(v));
    }
    const q = qs.toString();
    return request<Paginated<FingerprintListItem>>(cfg, `/api/v1/fingerprints${q ? `?${q}` : ""}`);
  },

  getFingerprint(cfg: ApiConfig, id: string) {
    return request<FingerprintDetail>(cfg, `/api/v1/fingerprints/${id}`);
  },

  patchFingerprint(cfg: ApiConfig, id: string, status: string) {
    return request<{ status: string }>(cfg, `/api/v1/fingerprints/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  },

  getInsights(cfg: ApiConfig, id: string) {
    return request<Insights>(cfg, `/api/v1/fingerprints/${id}/insights`);
  },

  listEvents(cfg: ApiConfig, id: string, params: Record<string, string | number | undefined> = {}) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "" && v !== null) qs.set(k, String(v));
    }
    const q = qs.toString();
    return request<Paginated<EventListItem>>(cfg, `/api/v1/fingerprints/${id}/events${q ? `?${q}` : ""}`);
  },

  getEvent(cfg: ApiConfig, id: string) {
    return request<EventDetail>(cfg, `/api/v1/events/${id}`);
  },

  getStats(cfg: ApiConfig) {
    return request<DashboardStats>(cfg, `/api/v1/stats`);
  },

  listIncidents(cfg: ApiConfig, params: Record<string, string | number | undefined> = {}) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "" && v !== null) qs.set(k, String(v));
    }
    const q = qs.toString();
    return request<Paginated<any>>(cfg, `/api/v1/incidents${q ? `?${q}` : ""}`);
  },

  getIncident(cfg: ApiConfig, id: string) {
    return request<any>(cfg, `/api/v1/incidents/${id}`);
  }
};
