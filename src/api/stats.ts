import sql from "../storage/postgres";

export interface DashboardStats {
  active_fingerprints: number;
  resolved_fingerprints: number;
  open_incidents: number;
  total_events: number;
}

export async function getDashboardStats(tenantId: string): Promise<DashboardStats> {
  const [fpRes, resFpRes, incRes, evtRes] = await Promise.all([
    sql`SELECT count(*) as count FROM fingerprints WHERE tenant_id = ${tenantId} AND status = 'active'`,
    sql`SELECT count(*) as count FROM fingerprints WHERE tenant_id = ${tenantId} AND status = 'resolved'`,
    sql`SELECT count(*) as count FROM incidents WHERE tenant_id = ${tenantId} AND status = 'open'`,
    sql`SELECT COALESCE(sum(event_count), 0) as total FROM fingerprints WHERE tenant_id = ${tenantId}`
  ]);

  return {
    active_fingerprints: parseInt((fpRes[0] as any).count, 10) || 0,
    resolved_fingerprints: parseInt((resFpRes[0] as any).count, 10) || 0,
    open_incidents: parseInt((incRes[0] as any).count, 10) || 0,
    total_events: parseInt((evtRes[0] as any).total, 10) || 0,
  };
}
