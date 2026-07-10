import sql from "../storage/postgres";

export interface CorrelationConfig {
  bucket_minutes: number;
  scan_window_minutes: number;
  min_distinct_fingerprints: number;
  merge_gap_minutes: number;
  overlap_threshold: number;
}

export const DEFAULT_CORRELATION_CONFIG: CorrelationConfig = {
  bucket_minutes: 5,
  scan_window_minutes: 30,
  min_distinct_fingerprints: 3,
  merge_gap_minutes: 15,
  overlap_threshold: 0.5,
};

interface AnomalousWindow {
  bucket: string; 
  distinct_fps: number;
  event_count: number;
  fingerprint_ids: string[];
}

interface IncidentDraft {
  window_start: Date;
  window_end: Date;
  fingerprints: Map<string, number>; 
  total_event_count: number;
}

export async function detectAnomalousWindows(
  tenantId: string,
  config: CorrelationConfig
): Promise<AnomalousWindow[]> {
  const bucketMinutes = config.bucket_minutes;
  const scanMinutes = config.scan_window_minutes;
  const minFps = config.min_distinct_fingerprints;

  const rows = await sql`
    SELECT
      DATE_TRUNC('hour', occurred_at)
        + FLOOR(EXTRACT(MINUTE FROM occurred_at) / ${bucketMinutes}) * ${bucketMinutes} * INTERVAL '1 minute'
        AS bucket,
      COUNT(DISTINCT fingerprint_id)::int AS distinct_fps,
      COUNT(*)::int AS event_count,
      ARRAY_AGG(DISTINCT fingerprint_id) AS fingerprint_ids
    FROM events
    WHERE tenant_id = ${tenantId}
      AND occurred_at >= NOW() - (${scanMinutes} * INTERVAL '1 minute')
    GROUP BY bucket
    HAVING COUNT(DISTINCT fingerprint_id) >= ${minFps}
    ORDER BY bucket
  `;

  return rows as unknown as AnomalousWindow[];
}

export async function correlate(
  tenantId: string,
  config: CorrelationConfig = DEFAULT_CORRELATION_CONFIG
): Promise<string[]> { 
  const anomalousWindows = await detectAnomalousWindows(tenantId, config);
  if (anomalousWindows.length === 0) return [];

  const incidentDrafts: IncidentDraft[] = [];

  
  for (const win of anomalousWindows) {
    const bucketTime = new Date(win.bucket);
    const winFpSet = new Set(win.fingerprint_ids);

    let merged = false;
    for (const draft of incidentDrafts) {
      
      const gapMs = bucketTime.getTime() - draft.window_end.getTime();
      const gapMinutes = gapMs / (60 * 1000);
      
      
      if (gapMinutes <= config.merge_gap_minutes) {
        
        const draftFpKeys = Array.from(draft.fingerprints.keys());
        const overlap = draftFpKeys.filter(fp => winFpSet.has(fp)).length;
        const requiredOverlapCount = Math.max(1, Math.ceil(Math.min(draftFpKeys.length, winFpSet.size) * config.overlap_threshold));
        
        if (overlap >= requiredOverlapCount) {
          
          if (bucketTime < draft.window_start) draft.window_start = bucketTime;
          
          const bucketEndTime = new Date(bucketTime.getTime() + config.bucket_minutes * 60000);
          if (bucketEndTime > draft.window_end) draft.window_end = bucketEndTime;
          
          draft.total_event_count += win.event_count;
          for (const fp of win.fingerprint_ids) {
            draft.fingerprints.set(fp, (draft.fingerprints.get(fp) || 0) + 1); 
          }
          merged = true;
          break;
        }
      }
    }

    if (!merged) {
      const draftFps = new Map<string, number>();
      for (const fp of win.fingerprint_ids) {
        draftFps.set(fp, 1);
      }
      incidentDrafts.push({
        window_start: bucketTime,
        window_end: new Date(bucketTime.getTime() + config.bucket_minutes * 60000),
        fingerprints: draftFps,
        total_event_count: win.event_count,
      });
    }
  }

  const affectedIncidentIds: string[] = [];

  
  for (const draft of incidentDrafts) {
    
    const draftFpKeys = Array.from(draft.fingerprints.keys());
    
    
    const openIncidents = await sql`
      SELECT id, window_end
      FROM incidents
      WHERE tenant_id = ${tenantId} AND status = 'open'
        AND window_end >= NOW() - (${config.merge_gap_minutes} * INTERVAL '1 minute')
    `;

    let matchedIncidentId: string | null = null;
    let matchedIncidentEnd: Date | null = null;

    for (const openInc of openIncidents) {
      const openIncId = openInc.id as string;
      
      const openFps = await sql`SELECT fingerprint_id FROM incident_fingerprints WHERE incident_id = ${openIncId}`;
      const openFpIds = openFps.map((r: any) => r.fingerprint_id as string);
      
      const overlap = draftFpKeys.filter(fp => openFpIds.includes(fp)).length;
      const requiredOverlap = Math.max(1, Math.ceil(Math.min(openFpIds.length, draftFpKeys.length) * config.overlap_threshold));
      
      if (overlap >= requiredOverlap) {
        matchedIncidentId = openIncId;
        matchedIncidentEnd = openInc.window_end as Date;
        break;
      }
    }

    if (matchedIncidentId) {
      
      const newEnd = draft.window_end > (matchedIncidentEnd as Date) ? draft.window_end : matchedIncidentEnd;
      await sql`
        UPDATE incidents
        SET window_end = ${newEnd},
            updated_at = NOW()
        WHERE id = ${matchedIncidentId}
      `;
      affectedIncidentIds.push(matchedIncidentId);
    } else {
      
      const inserted = await sql`
        INSERT INTO incidents (tenant_id, title, window_start, window_end, total_event_count)
        VALUES (${tenantId}, 'New Incident', ${draft.window_start}, ${draft.window_end}, ${draft.total_event_count})
        RETURNING id
      `;
      matchedIncidentId = inserted[0].id as string;
      affectedIncidentIds.push(matchedIncidentId);
    }

    
    
    
    const incRow = await sql`SELECT window_start, window_end FROM incidents WHERE id = ${matchedIncidentId}`;
    const incWindowStart = incRow[0].window_start;
    const incWindowEnd = incRow[0].window_end;
    
    
    const existingFpsRows = await sql`SELECT fingerprint_id FROM incident_fingerprints WHERE incident_id = ${matchedIncidentId}`;
    const allFpIds = Array.from(new Set([...draftFpKeys, ...existingFpsRows.map((r: any) => r.fingerprint_id)]));

    if (allFpIds.length > 0) {
      const fpCounts = await sql`
        SELECT fingerprint_id, COUNT(*)::int AS cnt
        FROM events
        WHERE tenant_id = ${tenantId}
          AND occurred_at >= ${incWindowStart}
          AND occurred_at <= ${incWindowEnd}
          AND fingerprint_id IN ${sql(allFpIds)}
        GROUP BY fingerprint_id
      `;
      
      let totalEvents = 0;
      for (const r of fpCounts) {
        const fpId = (r as any).fingerprint_id;
        const cnt = (r as any).cnt;
        totalEvents += cnt;
        
        await sql`
          INSERT INTO incident_fingerprints (incident_id, fingerprint_id, event_count)
          VALUES (${matchedIncidentId}, ${fpId}, ${cnt})
          ON CONFLICT (incident_id, fingerprint_id) DO UPDATE
            SET event_count = EXCLUDED.event_count
        `;
      }
      
      
      await sql`
        UPDATE incidents
        SET fingerprint_count = (SELECT COUNT(*) FROM incident_fingerprints WHERE incident_id = ${matchedIncidentId}),
            total_event_count = ${totalEvents}
        WHERE id = ${matchedIncidentId}
      `;
    }
  }

  return affectedIncidentIds;
}
