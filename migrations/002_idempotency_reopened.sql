ALTER TABLE events ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX idx_events_idempotency ON events(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

ALTER TABLE fingerprints ADD COLUMN reopened_at TIMESTAMPTZ;
