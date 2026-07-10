import { useCallback, useRef, useState } from "react";
import { api, type ApiConfig, type FingerprintDetail, type Insights, type EventListItem, type Paginated } from "../lib/api";
import { navigate } from "../App";
import { useAsync } from "../lib/useAsync";
import {
  Button,
  Card,
  Spinner,
  StatusBadge,
  SignalBadge,
  StatCard,
  Empty,
  ErrorBox,
} from "../components/ui";
import {
  IconArrowLeft,
  IconSparkle,
  IconBolt,
  IconDrift,
  IconLayers,
  IconCheck,
  IconX,
} from "../components/icons";
import { timeAgo, fmtDate, fmtNum, shortHash } from "../lib/format";

const STATUSES: Array<FingerprintDetail["status"]> = ["active", "acknowledged", "resolved"];

const SPIKE_TONE: Record<SpikeStateValue, "amber" | "emerald" | "faded"> = {
  spiking: "amber",
  not_spiking: "emerald",
  insufficient_data: "faded",
};
type SpikeStateValue = "spiking" | "not_spiking" | "insufficient_data";

function InsightRow({ icon, tone, label }: { icon: React.ReactNode; tone: "rose" | "amber" | "magenta" | "emerald" | "violet" | "faded"; label: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <SignalBadge tone={tone}>{label}</SignalBadge>
    </div>
  );
}

export function FingerprintDetail({ cfg, id }: { cfg: ApiConfig; id: string }) {
  const detail = useAsync<FingerprintDetail>(() => api.getFingerprint(cfg, id), [id]);
  const insights = useAsync<Insights>(() => api.getInsights(cfg, id), [id]);

  const [events, setEvents] = useState<EventListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const reqId = useRef(0);

  const loadEvents = useCallback(
    async (reset: boolean, cur: string | null) => {
      const rid = ++reqId.current;
      setLoadingEvents(true);
      setEventsError(null);
      try {
        const res: Paginated<EventListItem> = await api.listEvents(cfg, id, {
          cursor: cur ?? undefined,
          limit: 25,
        });
        if (rid !== reqId.current) return;
        setEvents((prev) => (reset ? res.data : [...prev, ...res.data]));
        setCursor(res.pagination.cursor);
        setHasMore(res.pagination.has_more);
      } catch (e) {
        if (rid !== reqId.current) return;
        setEventsError(e instanceof Error ? e.message : String(e));
      } finally {
        if (rid === reqId.current) setLoadingEvents(false);
      }
    },
    [cfg, id],
  );

  useAsync(() => loadEvents(true, null), [id]);

  async function setStatus(status: FingerprintDetail["status"]) {
    await api.patchFingerprint(cfg, id, status);
    detail.reload();
  }

  if (detail.loading && !detail.data) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }
  if (detail.error) return <ErrorBox message={detail.error} />;
  if (!detail.data) return null;

  const fp = detail.data;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-6">
        <button
          onClick={() => navigate("/fingerprints")}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-dash-text-faded hover:text-dash-text-strong"
        >
          <IconArrowLeft width={16} height={16} /> all issues
        </button>

        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="font-mono text-[14px] text-dash-text-faded">{shortHash(fp.fingerprint_hash)}</h1>
              <StatusBadge status={fp.status} />
            </div>
            <p className="mt-2 text-xl font-medium tracking-[-0.019em] text-dash-text-strong">{fp.sample_error_message || "—"}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-dash-text-body">
              <span className="rounded-md border-[0.5px] border-dash-border bg-dash-bg-elevated px-1.5 py-0.5">{fp.handler}</span>
              <span className="text-dash-text-extra-faded">·</span>
              <span>{fp.error_type}</span>
              <span className="text-dash-text-extra-faded">·</span>
              <span>first seen {fmtDate(fp.first_seen)}</span>
              <span className="text-dash-text-extra-faded">·</span>
              <span>last seen {timeAgo(fp.last_seen)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {STATUSES.map((s) => (
              <Button
                key={s}
                variant={fp.status === s ? "primary" : "outline"}
                onClick={() => setStatus(s)}
              >
                {s === "resolved" && <IconCheck width={14} height={14} />}
                {s === "acknowledged" && <IconCheck width={14} height={14} />}
                {s === "active" && <IconX width={14} height={14} />}
                {s}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Events" value={fmtNum(fp.event_count)} tone="rose" />
        <StatCard label="Diagnosis" value={fp.diagnosis_status} tone="violet" />
        {insights.data && (
          <>
            <StatCard
              label="Spike"
              value={insights.data.is_spiking.state === "spiking" ? "yes" : "no"}
              tone={SPIKE_TONE[insights.data.is_spiking.state as SpikeStateValue]}
            />
            <StatCard label="Persistent" value={insights.data.is_persistent ? "yes" : "no"} tone="magenta" />
          </>
        )}
      </div>

      {fp.diagnosis && (
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2 text-[14px] font-medium text-dash-text-strong">
            <IconSparkle width={16} height={16} className="text-violet-500" />
            AI diagnosis
          </div>
          <pre className="overflow-auto whitespace-pre-wrap text-[13px] leading-[20px] text-dash-text-body">
            {JSON.stringify(fp.diagnosis, null, 2)}
          </pre>
        </Card>
      )}

      {insights.data && (
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2 text-[14px] font-medium text-dash-text-strong">
            <IconLayers width={16} height={16} className="text-cyan-500" />
            Insights
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <InsightRow
              icon={<IconBolt width={14} height={14} />}
              tone={insights.data.is_new ? "rose" : "faded"}
              label={insights.data.is_new ? "new" : "known"}
            />
            <InsightRow
              icon={<IconDrift width={14} height={14} />}
              tone={insights.data.is_spiking.state === "spiking" ? "amber" : "faded"}
              label={
                insights.data.is_spiking.state === "spiking"
                  ? `spiking (${(insights.data.is_spiking.ratio ?? 0).toFixed(1)}× baseline)`
                  : "not spiking"
              }
            />
            <InsightRow
              icon={<IconLayers width={14} height={14} />}
              tone={insights.data.is_persistent ? "magenta" : "faded"}
              label={insights.data.is_persistent ? "persistent" : "intermittent"}
            />
            <InsightRow
              icon={<IconDrift width={14} height={14} />}
              tone={insights.data.retry_drift_detected ? "violet" : "faded"}
              label={insights.data.retry_drift_detected ? "retry drift" : "stable retries"}
            />
          </div>
        </Card>
      )}

      {Object.keys(fp.error_message_frequencies).length > 0 && (
        <Card className="p-5">
          <div className="mb-4 text-[14px] font-medium text-dash-text-strong">Top error messages</div>
          <div className="flex flex-col gap-3">
            {Object.entries(fp.error_message_frequencies).map(([msg, count]) => (
              <div key={msg} className="flex items-center gap-3 text-[13px]">
                <span className="w-10 shrink-0 text-right text-xs text-dash-text-extra-faded">{fmtNum(count)}</span>
                <span className="min-w-0 flex-1 truncate text-dash-text-body">{msg}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="flex flex-col gap-4">
        <h2 className="text-[16px] font-semibold text-dash-text-strong">Events</h2>
        {eventsError && <ErrorBox message={eventsError} />}
        {!loadingEvents && events.length === 0 && !eventsError && (
          <Card className="p-6">
            <Empty>
              <IconLayers width={24} height={24} />
              <span>No events captured yet.</span>
            </Empty>
          </Card>
        )}
        {events.length > 0 && (
          <Card className="overflow-hidden">
            <div className="flex flex-col">
              {events.map((ev, i) => (
                <button
                  key={ev.id}
                  onClick={() => navigate(`/fingerprints/${id}/events/${ev.id}`)}
                  className={`flex items-center gap-4 p-4 text-left transition hover:bg-dash-bg-elevated ${
                    i !== events.length - 1 ? "border-b-[0.5px] border-dash-border" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] text-dash-text-strong font-medium">{ev.error_message}</div>
                    <div className="mt-1 text-[13px] text-dash-text-faded">
                      {timeAgo(ev.occurred_at)} <span className="text-dash-text-extra-faded">·</span> retry {ev.retry_count}/{ev.max_retries}
                    </div>
                  </div>
                  {ev.retry_attempts.length > 0 && (
                    <SignalBadge tone="violet">{ev.retry_attempts.length} retries</SignalBadge>
                  )}
                </button>
              ))}
            </div>
          </Card>
        )}
        {loadingEvents && events.length === 0 && (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        )}
        {hasMore && (
          <div className="flex justify-center pt-2">
            <Button variant="outline" onClick={() => loadEvents(false, cursor)} disabled={loadingEvents}>
              {loadingEvents ? <Spinner /> : "Load more events"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
