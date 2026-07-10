import sql from "../storage/postgres";
import type { RootCauseCategory } from "../types";

export interface ClassificationResult {
  category: RootCauseCategory;
  confidence: 'high' | 'medium' | 'low';
  evidence: Record<string, unknown>;
  title: string;
}

function extractServicePrefix(handler: string): string | null {
  const slash = handler.indexOf('/');
  if (slash > 0) return handler.substring(0, slash);
  const dot = handler.indexOf('.');
  if (dot > 0) return handler.substring(0, dot);
  return null;
}

const INFRA_KEYWORDS = /ConnectionTimeout|ECONNREFUSED|EHOSTUNREACH|SocketException|DNSLookupFailed/i;
const HTTP_5XX = /502|503|504|Service Unavailable|Bad Gateway|Gateway Timeout/i;
const RATE_LIMIT = /rate.?limit|429|throttl|too many requests/i;
const AUTH_FAIL = /unauthori|401|403|forbidden|token.?expir/i;
const DATA_SCHEMA = /seriali[zs]|deseriali|parse|invalid.?json|schema|validation/i;

export async function classify(
  tenantId: string,
  incidentId: string,
): Promise<ClassificationResult> {
  
  const incidentRows = await sql`
    SELECT window_start, window_end, fingerprint_count, total_event_count
    FROM incidents
    WHERE id = ${incidentId} AND tenant_id = ${tenantId}
  `;
  if (incidentRows.length === 0) {
    throw new Error("Incident not found");
  }
  const incident = incidentRows[0] as any;
  const eventCount = Number(incident.total_event_count);

  
  const fpRows = await sql`
    SELECT f.id, f.handler, f.error_type, i.event_count,
           (SELECT ARRAY_AGG(error_message) FROM (
             SELECT error_message FROM events e 
             WHERE e.fingerprint_id = f.id AND e.occurred_at >= ${incident.window_start} AND e.occurred_at <= ${incident.window_end} 
             ORDER BY occurred_at DESC LIMIT 5
           ) sub) as sample_messages
    FROM incident_fingerprints i
    JOIN fingerprints f ON f.id = i.fingerprint_id
    WHERE i.incident_id = ${incidentId}
  `;

  const fpCount = fpRows.length;
  if (fpCount === 0) {
    return {
      category: 'unknown',
      confidence: 'low',
      evidence: {},
      title: `Incident ${incidentId} (No fingerprints found)`
    };
  }

  const prefixes: Record<string, number> = {};
  const errorTypes: Record<string, number> = {};
  let http5xxCount = 0;
  let rateLimitCount = 0;
  let authFailCount = 0;
  let dataSchemaCount = 0;

  for (const row of fpRows) {
    const fp = row as any;
    const prefix = extractServicePrefix(fp.handler);
    if (prefix) {
      prefixes[prefix] = (prefixes[prefix] || 0) + 1;
    }
    
    errorTypes[fp.error_type] = (errorTypes[fp.error_type] || 0) + 1;

    const msgs = fp.sample_messages || [];
    const combinedText = [...msgs, fp.error_type].join(" ");
    
    if (HTTP_5XX.test(combinedText)) http5xxCount++;
    if (RATE_LIMIT.test(combinedText)) rateLimitCount++;
    if (AUTH_FAIL.test(combinedText)) authFailCount++;
    if (DATA_SCHEMA.test(combinedText)) dataSchemaCount++;
  }

  
  let dominantPrefix: string | null = null;
  let dominantPrefixCount = 0;
  for (const [prefix, count] of Object.entries(prefixes)) {
    if (count > dominantPrefixCount) {
      dominantPrefix = prefix;
      dominantPrefixCount = count;
    }
  }

  
  let dominantErrorType: string | null = null;
  let dominantErrorTypeCount = 0;
  for (const [errType, count] of Object.entries(errorTypes)) {
    if (count > dominantErrorTypeCount) {
      dominantErrorType = errType;
      dominantErrorTypeCount = count;
    }
  }

  
  if (dominantPrefix && dominantPrefixCount / fpCount >= 0.6) {
    return {
      category: 'downstream_service',
      confidence: 'high',
      evidence: { service: dominantPrefix, handler_prefix: dominantPrefix + "/", fingerprint_count: dominantPrefixCount },
      title: `Downstream '${dominantPrefix}' — ${fpCount} error groups, ${eventCount} events`
    };
  }

  
  if (dominantErrorType && dominantErrorTypeCount / fpCount >= 0.8 && INFRA_KEYWORDS.test(dominantErrorType)) {
    return {
      category: 'infrastructure',
      confidence: 'high',
      evidence: { shared_error_type: dominantErrorType },
      title: `Infrastructure: ${dominantErrorType} across ${fpCount} handlers`
    };
  }

  
  if (http5xxCount / fpCount >= 0.6) {
    return {
      category: 'downstream_service',
      confidence: 'medium',
      evidence: { matched: 'http_5xx', match_count: http5xxCount },
      title: `Service errors (5xx) across ${fpCount} handlers`
    };
  }

  
  if (rateLimitCount / fpCount >= 0.6) {
    return {
      category: 'rate_limiting',
      confidence: 'high',
      evidence: { matched: 'rate_limiting', match_count: rateLimitCount },
      title: `Rate limiting detected — ${fpCount} handlers affected`
    };
  }

  
  if (authFailCount / fpCount >= 0.6) {
    return {
      category: 'auth_failure',
      confidence: 'high',
      evidence: { matched: 'auth_failure', match_count: authFailCount },
      title: `Auth failures across ${fpCount} handlers`
    };
  }

  
  if (dataSchemaCount / fpCount >= 0.6) {
    return {
      category: 'data_schema',
      confidence: 'high',
      evidence: { matched: 'data_schema', match_count: dataSchemaCount },
      title: `Data/schema errors across ${fpCount} handlers`
    };
  }

  
  const windowStartMs = new Date(incident.window_start).getTime();
  const windowEndMs = new Date(incident.window_end).getTime();
  const durationMin = (windowEndMs - windowStartMs) / (60 * 1000);
  
  if (durationMin > 0 && durationMin <= 15) {
    
    
    
    
    const timeSinceEndMs = Date.now() - windowEndMs;
    if (timeSinceEndMs > 10 * 60 * 1000) {
      return {
        category: 'deployment',
        confidence: 'medium',
        evidence: { duration_minutes: durationMin },
        title: `Possible deployment — ${durationMin}min burst, self-resolving`
      };
    }
  }

  
  return {
    category: 'unknown',
    confidence: 'low',
    evidence: {},
    title: `Correlated failures — ${fpCount} error groups, ${eventCount} events`
  };
}
