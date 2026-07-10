import sql from "../storage/postgres";

export type SpikeStateName = "spiking" | "not_spiking" | "insufficient_data";

export interface SpikeState {
  state: SpikeStateName;
  current_volume: number;
  baseline_median: number;
  ratio: number | null;
}

export interface InsightsConfig {
  
  spike_threshold: number; 
  baseline_days: number; 
  min_baseline_samples: number; 
  min_spike_volume: number; 
  
  persistence_window_days: number; 
  persistence_floor: number; 
  
  drift_recent_events: number; 
}

export const DEFAULT_INSIGHTS_CONFIG: InsightsConfig = {
  spike_threshold: 3,
  baseline_days: 14,
  min_baseline_samples: 3,
  min_spike_volume: 5,
  persistence_window_days: 7,
  persistence_floor: 50,
  drift_recent_events: 50,
};

export interface FingerprintInsights {
  fingerprint_id: string;
  is_new: boolean;
  is_spiking: SpikeState;
  is_persistent: boolean;
  retry_drift_detected: boolean;
  computed_at: string;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}


export async function spikeAnalysis(
  tenantId: string,
  fingerprintId: string,
  config: InsightsConfig,
): Promise<SpikeState> {
  const now = new Date();
  const hourOfDay = now.getUTCHours();

  
  const currentRows = await sql`
    SELECT COUNT(*)::int AS cnt
    FROM events
    WHERE tenant_id = ${tenantId}
      AND fingerprint_id = ${fingerprintId}
      AND occurred_at >= DATE_TRUNC('hour', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
      AND occurred_at <= NOW()
  `;
  const currentVolume = (currentRows[0] as any).cnt as number;

  
  const baselineStart = new Date(now.getTime() - (config.baseline_days + 1) * DAY_MS);
  const baselineRows = await sql`
    SELECT COUNT(*)::int AS cnt
    FROM events
    WHERE tenant_id = ${tenantId}
      AND fingerprint_id = ${fingerprintId}
      AND EXTRACT(HOUR FROM occurred_at AT TIME ZONE 'UTC') = ${hourOfDay}
      AND occurred_at >= ${baselineStart.toISOString()}
      AND occurred_at < DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
    GROUP BY DATE_TRUNC('day', occurred_at AT TIME ZONE 'UTC')
  `;
  const baselineSamples = (baselineRows as any[]).map((r) => r.cnt as number);

  if (baselineSamples.length < config.min_baseline_samples) {
    return {
      state: "insufficient_data",
      current_volume: currentVolume,
      baseline_median: median(baselineSamples),
      ratio: null,
    };
  }

  const baselineMedian = median(baselineSamples);

  if (baselineMedian === 0) {
    
    
    
    const spiking = currentVolume >= config.min_spike_volume;
    return {
      state: spiking ? "spiking" : "not_spiking",
      current_volume: currentVolume,
      baseline_median: 0,
      ratio: null,
    };
  }

  const ratio = currentVolume / baselineMedian;
  const spiking =
    currentVolume >= config.min_spike_volume && ratio >= config.spike_threshold;
  return {
    state: spiking ? "spiking" : "not_spiking",
    current_volume: currentVolume,
    baseline_median: baselineMedian,
    ratio,
  };
}


export async function persistenceAnalysis(
  tenantId: string,
  fingerprintId: string,
  config: InsightsConfig,
): Promise<boolean> {
  const windowStart = new Date(Date.now() - config.persistence_window_days * DAY_MS);
  const rows = await sql`
    SELECT COUNT(*)::int AS cnt
    FROM events
    WHERE tenant_id = ${tenantId}
      AND fingerprint_id = ${fingerprintId}
      AND occurred_at >= ${windowStart.toISOString()}
  `;
  const volume = (rows[0] as any).cnt as number;
  return volume >= config.persistence_floor;
}


export async function retryDriftDetected(
  tenantId: string,
  fingerprintId: string,
  config: InsightsConfig,
): Promise<boolean> {
  const attemptsRows = await sql`
    SELECT ra.event_id, ra.attempt_number, ra.error_type, ra.error_message
    FROM retry_attempts ra
    JOIN (
      SELECT e.id
      FROM events e
      WHERE e.tenant_id = ${tenantId}
        AND e.fingerprint_id = ${fingerprintId}
        AND EXISTS (SELECT 1 FROM retry_attempts ra2 WHERE ra2.event_id = e.id)
      ORDER BY e.occurred_at DESC
      LIMIT ${config.drift_recent_events}
    ) sub ON sub.id = ra.event_id
    ORDER BY ra.event_id, ra.attempt_number ASC
  `;

  if (attemptsRows.length === 0) return false;

  const eventAttempts = new Map<string, any[]>();
  for (const row of attemptsRows) {
    const evId = (row as any).event_id as string;
    if (!eventAttempts.has(evId)) eventAttempts.set(evId, []);
    eventAttempts.get(evId)!.push(row);
  }

  for (const attempts of eventAttempts.values()) {
    if (attempts.length < 2) continue;

    const first = attempts[0];
    const last = attempts[attempts.length - 1];
    const firstErr = first.error_type ?? first.error_message;
    const lastErr = last.error_type ?? last.error_message;
    if (firstErr !== lastErr) return true;
  }

  return false;
}

export async function getInsights(
  tenantId: string,
  fingerprintId: string,
  firstSeen: Date,
  config: InsightsConfig = DEFAULT_INSIGHTS_CONFIG,
): Promise<FingerprintInsights> {
  const isNew = Date.now() - firstSeen.getTime() <= 24 * HOUR_MS;

  const isSpiking = await spikeAnalysis(tenantId, fingerprintId, config);
  const isPersistentRaw = await persistenceAnalysis(tenantId, fingerprintId, config);
  const retryDrift = await retryDriftDetected(tenantId, fingerprintId, config);

  
  
  const isPersistent = isPersistentRaw && isSpiking.state !== "spiking";

  return {
    fingerprint_id: fingerprintId,
    is_new: isNew,
    is_spiking: isSpiking,
    is_persistent: isPersistent,
    retry_drift_detected: retryDrift,
    computed_at: new Date().toISOString(),
  };
}
