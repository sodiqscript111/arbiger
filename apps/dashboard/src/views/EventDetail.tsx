import { api, type ApiConfig, type EventDetail } from "../lib/api";
import { navigate } from "../navigation";
import { useAsync } from "../lib/useAsync";
import { Card, Spinner, SignalBadge, Empty, ErrorBox } from "../components/ui";
import { IconArrowLeft, IconBolt } from "../components/icons";
import { fmtDate } from "../lib/format";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-3 text-[14px] font-medium text-dash-text-strong">{title}</div>
      {children}
    </Card>
  );
}

export function EventDetail({ cfg, id }: { cfg: ApiConfig; id: string }) {
  const ev = useAsync<EventDetail>(() => api.getEvent(cfg, id), [id]);

  if (ev.loading && !ev.data) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }
  if (ev.error) return <ErrorBox message={ev.error} />;
  if (!ev.data) return null;

  const e = ev.data;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => navigate(`/fingerprints/${e.fingerprint_id}`)}
          className="inline-flex items-center gap-1.5 text-sm text-dash-text-faded hover:text-dash-text-strong"
        >
          <IconArrowLeft width={16} height={16} /> issue
        </button>
        <h1 className="font-mono text-[14px] text-dash-text-faded">{e.id}</h1>
        <SignalBadge tone="rose">retry {e.retry_count}/{e.max_retries}</SignalBadge>
      </div>

      <Section title="Error">
        <p className="text-[14px] text-dash-text-strong leading-[20px]">{e.error_message}</p>
        <div className="mt-1 text-[13px] text-dash-text-extra-faded">occurred {fmtDate(e.occurred_at)}</div>
      </Section>

      {e.stack_trace && (
        <Section title="Stack trace">
          <pre className="overflow-auto whitespace-pre-wrap text-[13px] leading-[20px] text-dash-text-faded font-mono">
            {e.stack_trace}
          </pre>
        </Section>
      )}

      {e.retry_attempts.length > 0 && (
        <Section title={`Retry attempts (${e.retry_attempts.length})`}>
          <div className="flex flex-col gap-3">
            {e.retry_attempts.map((a) => (
              <div key={a.attempt_number} className="flex items-start gap-3 rounded-[6px] bg-dash-bg-elevated border-[0.5px] border-dash-border p-3 text-[14px]">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[4px] border-[0.5px] border-dash-border bg-dash-bg text-xs text-dash-text-faded shadow-sm">
                  {a.attempt_number}
                </span>
                <div className="min-w-0">
                  <div className="text-dash-text-strong">{a.error_message ?? "—"}</div>
                  <div className="mt-1 text-[13px] text-dash-text-extra-faded">
                    {a.error_type ?? "retry"} <span className="text-dash-text-extra-faded">·</span> {fmtDate(a.occurred_at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {e.payload !== undefined && e.payload !== null && (
        <Section title="Payload">
          <pre className="overflow-auto whitespace-pre-wrap text-[13px] leading-[20px] text-dash-text-faded font-mono">
            {JSON.stringify(e.payload, null, 2)}
          </pre>
        </Section>
      )}

      {e.metadata !== undefined && e.metadata !== null && (
        <Section title="Metadata">
          <pre className="overflow-auto whitespace-pre-wrap text-[13px] leading-[20px] text-dash-text-faded font-mono">
            {JSON.stringify(e.metadata, null, 2)}
          </pre>
        </Section>
      )}

      {!e.stack_trace && e.retry_attempts.length === 0 && !e.payload && !e.metadata && (
        <Section title="Details">
          <Empty>
            <IconBolt width={24} height={24} />
            <span>No additional event details were captured.</span>
          </Empty>
        </Section>
      )}
    </div>
  );
}
