CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE tenants (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settings   JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE api_keys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key_prefix  TEXT NOT NULL,
  key_hash    TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at  TIMESTAMPTZ
);

CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_tenant_id ON api_keys(tenant_id);

CREATE TYPE fingerprint_status AS ENUM ('active', 'acknowledged', 'resolved');
CREATE TYPE diagnosis_status AS ENUM ('none', 'pending', 'completed', 'failed');

CREATE TABLE fingerprints (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  fingerprint_hash   TEXT NOT NULL,
  handler            TEXT NOT NULL,
  error_type         TEXT NOT NULL,
  sample_stack_trace TEXT,
  status             fingerprint_status NOT NULL DEFAULT 'active',
  first_seen         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_count        INTEGER NOT NULL DEFAULT 1,
  diagnosis          JSONB,
  diagnosis_status   diagnosis_status NOT NULL DEFAULT 'none',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (tenant_id, fingerprint_hash)
);

CREATE INDEX idx_fingerprints_tenant_id ON fingerprints(tenant_id);
CREATE INDEX idx_fingerprints_last_seen ON fingerprints(tenant_id, last_seen DESC);
CREATE INDEX idx_fingerprints_event_count ON fingerprints(tenant_id, event_count DESC);
CREATE INDEX idx_fingerprints_status ON fingerprints(tenant_id, status);
CREATE INDEX idx_fingerprints_handler ON fingerprints(tenant_id, handler);
CREATE INDEX idx_fingerprints_error_type ON fingerprints(tenant_id, error_type);

CREATE TABLE events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  fingerprint_id UUID NOT NULL REFERENCES fingerprints(id) ON DELETE CASCADE,
  error_message TEXT NOT NULL,
  payload      JSONB NOT NULL,
  stack_trace  TEXT,
  retry_count  INTEGER NOT NULL,
  max_retries  INTEGER NOT NULL,
  occurred_at  TIMESTAMPTZ NOT NULL,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata     JSONB
);

CREATE INDEX idx_events_tenant_id ON events(tenant_id);
CREATE INDEX idx_events_fingerprint_id ON events(fingerprint_id);
CREATE INDEX idx_events_occurred_at ON events(tenant_id, occurred_at DESC);

CREATE TABLE retry_attempts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  attempt_number  INTEGER NOT NULL,
  error_type      TEXT,
  error_message   TEXT,
  occurred_at     TIMESTAMPTZ NOT NULL,

  UNIQUE (event_id, attempt_number)
);

CREATE INDEX idx_retry_attempts_event_id ON retry_attempts(event_id);
