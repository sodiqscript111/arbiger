import { useEffect, useState } from "react";
import { formatDistanceToNow, format } from "date-fns";
import {
  ArrowLeft,
  AlertTriangle,
  Bot,
  Database,
  CloudRain,
  Zap,
  Clock,
  XCircle,
  FileWarning,
  Loader2,
  ListFilter
} from "lucide-react";
import type { IncidentDetail, RootCauseCategory } from "../../../src/types";
import { navigate } from "../navigation";
import { api, type ApiConfig } from "../lib/api";

interface Props {
  cfg: ApiConfig;
  id: string;
}

function getCategoryIcon(category: RootCauseCategory) {
  switch (category) {
    case "downstream_service": return <Database className="h-5 w-5 text-blue-500" />;
    case "infrastructure": return <CloudRain className="h-5 w-5 text-purple-500" />;
    case "deployment": return <Zap className="h-5 w-5 text-orange-500" />;
    case "rate_limiting": return <Clock className="h-5 w-5 text-yellow-500" />;
    case "auth_failure": return <XCircle className="h-5 w-5 text-red-500" />;
    case "data_schema": return <FileWarning className="h-5 w-5 text-emerald-500" />;
    default: return <AlertTriangle className="h-5 w-5 text-gray-500" />;
  }
}

export function IncidentDetailView({ cfg, id }: Props) {
  const [incident, setIncident] = useState<IncidentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const fetchDetail = async () => {
      try {
        setLoading(true);
        const res = await api.getIncident(cfg, id);
        if (active) setIncident(res);
      } catch (err: any) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchDetail();
    return () => { active = false; };
  }, [cfg, id]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-dash-border" />
      </div>
    );
  }

  if (error || !incident) {
    return (
      <div className="flex flex-col gap-4">
        <button
          onClick={() => navigate("/incidents")}
          className="pressable flex w-max items-center gap-2 text-sm text-dash-text-faded hover:text-dash-text-strong"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Incidents
        </button>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-600">
          {error || "Incident not found"}
        </div>
      </div>
    );
  }

  const aiSummary = incident.root_cause_detail?.ai_summary;
  const suggestedAction = incident.root_cause_detail?.suggested_action;

  return (
    <div className="flex flex-col gap-6 animate-scale-in" style={{ transformOrigin: "top center" }}>
      <button
        onClick={() => navigate("/incidents")}
        className="pressable flex w-max items-center gap-2 text-sm text-dash-text-faded hover:text-dash-text-strong"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="flex items-start gap-4 border-b border-dash-border-soft pb-6">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-dash-bg-elevated border border-dash-border-soft">
          {getCategoryIcon(incident.root_cause_category)}
        </div>
        <div className="flex flex-col gap-1.5 flex-1">
          <div className="flex items-center justify-between">
            <h1 className="font-heading text-2xl tracking-tight text-dash-text-strong">
              {incident.title}
            </h1>
            {incident.status === 'resolved' ? (
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold tracking-wide text-emerald-600">
                RESOLVED
              </span>
            ) : (
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold tracking-wide text-amber-600">
                OPEN
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm text-dash-text-faded">
            <span className="capitalize">{incident.root_cause_category.replace('_', ' ')}</span>
            <span className="h-1 w-1 rounded-full bg-dash-border" />
            <span>{incident.total_event_count} total events</span>
            <span className="h-1 w-1 rounded-full bg-dash-border" />
            <span>
              {format(new Date(incident.window_start), "MMM d, h:mm a")} —{" "}
              {format(new Date(incident.window_end), "h:mm a")}
            </span>
          </div>
        </div>
      </div>

      {aiSummary ? (
        <div className="stagger-entry flex flex-col overflow-hidden rounded-xl border border-dash-border shadow-sm" style={{ animationDelay: '100ms' }}>
          <div className="flex items-center gap-2 border-b border-dash-border bg-dash-bg-elevated px-4 py-3">
            <Bot className="h-5 w-5 text-indigo-500" />
            <h3 className="font-medium text-dash-text-strong">AI Diagnosis</h3>
          </div>
          <div className="flex flex-col gap-4 bg-dash-bg p-5">
            <div>
              <h4 className="mb-1 text-xs font-semibold tracking-wider text-dash-text-extra-faded uppercase">Summary</h4>
              <p className="text-sm leading-relaxed text-dash-text-body">
                {aiSummary}
              </p>
            </div>
            {suggestedAction && (
              <div>
                <h4 className="mb-1 text-xs font-semibold tracking-wider text-dash-text-extra-faded uppercase">Suggested Action</h4>
                <div className="rounded-lg bg-indigo-50/50 p-3 text-sm leading-relaxed text-indigo-900 border border-indigo-100">
                  {suggestedAction}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="stagger-entry flex flex-col items-center justify-center rounded-xl border border-dashed border-dash-border-soft p-8 bg-dash-bg-elevated" style={{ animationDelay: '100ms' }}>
          <Bot className="h-8 w-8 text-dash-text-extra-faded mb-3 opacity-50" />
          <p className="text-sm text-dash-text-faded">No AI diagnosis available for this incident.</p>
        </div>
      )}

      <div className="stagger-entry" style={{ animationDelay: '200ms' }}>
        <div className="mb-3 flex items-center gap-2">
          <ListFilter className="h-4 w-4 text-dash-text-faded" />
          <h2 className="text-sm font-medium text-dash-text-strong">Affected Handlers ({incident.fingerprints.length})</h2>
        </div>
        
        <div className="flex flex-col gap-2">
          {incident.fingerprints.map((fp) => (
            <div
              key={fp.id}
              onClick={() => navigate(`/fingerprints/${fp.id}`)}
              className="pressable flex cursor-pointer items-center justify-between rounded-lg border border-dash-border-soft bg-dash-bg p-3 hover:border-dash-border hover:bg-dash-bg-elevated"
            >
              <div className="flex flex-col gap-1">
                <span className="font-mono text-sm text-dash-text-strong">{fp.handler}</span>
                <span className="text-xs text-dash-text-faded">{fp.error_type}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-dash-border-soft px-2 py-1 text-xs font-medium text-dash-text-strong">
                  {fp.event_count} events
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


export const IncidentDetail = IncidentDetailView;
