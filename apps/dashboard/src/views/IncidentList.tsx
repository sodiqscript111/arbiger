import { useEffect, useState, useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { AlertCircle, AlertTriangle, ArrowRight, Zap, RefreshCw, XCircle, FileWarning, Clock, Database, CloudRain } from "lucide-react";
import type { IncidentListItem, RootCauseCategory } from "../../../src/types";
import { navigate } from "../navigation";
import { api, type ApiConfig } from "../lib/api";

interface Props {
  cfg: ApiConfig;
}

function getCategoryIcon(category: RootCauseCategory) {
  switch (category) {
    case "downstream_service":
      return <Database className="h-4 w-4 text-blue-500" />;
    case "infrastructure":
      return <CloudRain className="h-4 w-4 text-purple-500" />;
    case "deployment":
      return <Zap className="h-4 w-4 text-orange-500" />;
    case "rate_limiting":
      return <Clock className="h-4 w-4 text-yellow-500" />;
    case "auth_failure":
      return <XCircle className="h-4 w-4 text-red-500" />;
    case "data_schema":
      return <FileWarning className="h-4 w-4 text-emerald-500" />;
    default:
      return <AlertTriangle className="h-4 w-4 text-gray-500" />;
  }
}

export function IncidentList({ cfg }: Props) {
  const [incidents, setIncidents] = useState<IncidentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const fetchIncidents = async () => {
      try {
        setLoading(true);
        const res = await api.listIncidents(cfg);
        if (active) setIncidents(res.data || []);
      } catch (err: any) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchIncidents();
    return () => { active = false; };
  }, [cfg]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-dash-border" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-center gap-3 text-red-600">
        <AlertCircle className="h-5 w-5" />
        <span className="font-medium text-sm">{error}</span>
      </div>
    );
  }

  if (incidents.length === 0) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center rounded-xl border border-dashed border-dash-border-soft">
        <div className="mb-4 rounded-full bg-dash-bg-elevated p-3">
          <AlertCircle className="h-6 w-6 text-dash-text-extra-faded" />
        </div>
        <h3 className="text-sm font-medium text-dash-text-strong">No incidents yet</h3>
        <p className="mt-1 max-w-[250px] text-center text-xs text-dash-text-faded">
          Incidents will appear here when multiple error patterns correlate together.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl tracking-tight text-dash-text-strong">Incidents</h1>
          <p className="text-sm text-dash-text-faded mt-1">
            Correlated error spikes analyzed by AI
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {incidents.map((incident, i) => (
          <div
            key={incident.id}
            onClick={() => navigate(`/incidents/${incident.id}`)}
            className="pressable group relative flex cursor-pointer items-center justify-between overflow-hidden rounded-xl border border-dash-border-soft bg-dash-bg p-4 shadow-sm hover:border-dash-border hover:shadow-md stagger-entry"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-dash-bg-elevated">
                {getCategoryIcon(incident.root_cause_category)}
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-dash-text-strong tracking-tight">
                    {incident.title}
                  </h3>
                  {incident.status === 'resolved' ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-600">
                      RESOLVED
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-amber-600">
                      OPEN
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-dash-text-faded">
                  <span className="flex items-center gap-1.5 capitalize">
                    {incident.root_cause_category.replace('_', ' ')}
                  </span>
                  <span className="h-1 w-1 rounded-full bg-dash-border" />
                  <span>{incident.total_event_count} events</span>
                  <span className="h-1 w-1 rounded-full bg-dash-border" />
                  <span>{incident.fingerprint_count} handlers</span>
                  <span className="h-1 w-1 rounded-full bg-dash-border" />
                  <span>
                    started {formatDistanceToNow(new Date(incident.window_start), { addSuffix: true })}
                  </span>
                </div>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-dash-border transition-transform group-hover:translate-x-1 group-hover:text-dash-text-strong" />
          </div>
        ))}
      </div>
    </div>
  );
}
