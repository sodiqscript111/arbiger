import sql from "../storage/postgres";
import {
  getInsights,
  DEFAULT_INSIGHTS_CONFIG,
  type InsightsConfig,
  type FingerprintInsights,
} from "../analysis/insights";

export async function getFingerprintInsights(
  tenantId: string,
  fingerprintId: string,
  searchParams: URLSearchParams,
): Promise<FingerprintInsights | null> {
  const fp = await sql`
    SELECT id, first_seen FROM fingerprints
    WHERE id = ${fingerprintId} AND tenant_id = ${tenantId}
    LIMIT 1
  `;
  if (fp.length === 0) return null;

  const firstSeen = (fp[0] as any).first_seen as Date;

  const config: InsightsConfig = { ...DEFAULT_INSIGHTS_CONFIG };
  const num = (key: string, fallback: number): number => {
    const v = searchParams.get(key);
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  config.spike_threshold = num("spike_threshold", config.spike_threshold);
  config.baseline_days = num("baseline_days", config.baseline_days);
  config.min_baseline_samples = num("min_baseline_samples", config.min_baseline_samples);
  config.min_spike_volume = num("min_spike_volume", config.min_spike_volume);
  config.persistence_window_days = num("persistence_window_days", config.persistence_window_days);
  config.persistence_floor = num("persistence_floor", config.persistence_floor);
  config.drift_recent_events = num("drift_recent_events", config.drift_recent_events);

  return getInsights(tenantId, fingerprintId, firstSeen, config);
}
