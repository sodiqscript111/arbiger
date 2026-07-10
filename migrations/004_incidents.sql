CREATE TABLE incidents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  root_cause_category TEXT NOT NULL DEFAULT 'unknown',
  root_cause_detail   JSONB,
  status              TEXT NOT NULL DEFAULT 'open',
  window_start        TIMESTAMPTZ NOT NULL,
  window_end          TIMESTAMPTZ NOT NULL,
  fingerprint_count   INT NOT NULL DEFAULT 0,
  total_event_count   INT NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE incident_fingerprints (
  incident_id    UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  fingerprint_id UUID NOT NULL REFERENCES fingerprints(id) ON DELETE CASCADE,
  event_count    INT NOT NULL DEFAULT 0,
  PRIMARY KEY (incident_id, fingerprint_id)
);

CREATE INDEX idx_incidents_tenant_id_status ON incidents(tenant_id, status);
CREATE INDEX idx_incidents_tenant_id_window_start ON incidents(tenant_id, window_start DESC);
