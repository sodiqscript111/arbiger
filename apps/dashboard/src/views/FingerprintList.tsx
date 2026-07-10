import { useCallback, useEffect, useRef, useState } from "react";
import { api, type ApiConfig, type FingerprintListItem, type Paginated } from "../lib/api";
import { navigate } from "../App";
import { Button, Card, Input, Spinner, StatusBadge, SignalBadge, Empty, ErrorBox } from "../components/ui";
import { IconSearch, IconLayers, IconChevron } from "../components/icons";
import { timeAgo, fmtNum, shortHash } from "../lib/format";
import { Activity } from "lucide-react";

const DIAGNOSIS_TONE: Record<string, "amber" | "sky" | "faded" | "rose"> = {
  none: "faded",
  pending: "amber",
  completed: "sky",
  failed: "rose",
};

interface Filters {
  status: string;
  search: string;
  sort: string;
}

export function FingerprintList({ cfg }: { cfg: ApiConfig }) {
  const [stats, setStats] = useState<{ active_fingerprints: number; resolved_fingerprints: number; open_incidents: number; total_events: number } | null>(null);
  const [filters, setFilters] = useState<Filters>({ status: "", search: "", sort: "last_seen" });
  const [items, setItems] = useState<FingerprintListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  const load = useCallback(
    async (reset: boolean, cur: string | null) => {
      const id = ++reqId.current;
      setLoading(true);
      setError(null);
      try {
        const [res, statsRes, incidentsRes] = await Promise.all([
          api.listFingerprints(cfg, {
            status: filters.status || undefined,
            search: filters.search || undefined,
            sort: filters.sort,
            order: "desc",
            cursor: cur ?? undefined,
            limit: 50,
          }),
          api.getStats(cfg).catch(() => null)
        ]);

        if (id !== reqId.current) return;
        setItems((prev) => (reset ? res.data : [...prev, ...res.data]));
        if (statsRes) setStats(statsRes);
        setCursor(res.pagination.cursor);
        setHasMore(res.pagination.has_more);
      } catch (e) {
        if (id !== reqId.current) return;
        setError(e instanceof Error ? e.message : String(e));
        if (reset) setItems([]);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [cfg, filters.status, filters.search, filters.sort],
  );

  useEffect(() => {
    setItems([]);
    setCursor(null);
    load(true, null);
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 mb-2 animate-scale-in" style={{ transformOrigin: "top" }}>
        <h1 className="text-[20px] font-semibold tracking-[-0.019em] text-dash-text-strong">
          Overview
        </h1>
        {stats && (
          <p className="text-[14px] text-dash-text-faded">
            Welcome back Tobby, Arbiger currently has <strong className="text-dash-text-strong font-medium">{stats.open_incidents} incidents</strong>. <strong className="text-dash-text-strong font-medium">{stats.resolved_fingerprints} issues</strong> have been resolved and <strong className="text-dash-text-strong font-medium">{stats.active_fingerprints} are still open</strong>.
          </p>
        )}
      </div>
      
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 border-b border-dash-border-soft pb-2">
          {[
            { value: "", label: "All issues" },
            { value: "active", label: "Active" },
            { value: "acknowledged", label: "Acknowledged" },
            { value: "resolved", label: "Resolved" },
          ].map(tab => (
            <button
              key={tab.value}
              onClick={() => setFilters(f => ({ ...f, status: tab.value }))}
              className={`px-3 py-1.5 text-sm font-medium rounded-[4px] transition-colors ${filters.status === tab.value ? 'bg-dash-bg-elevated text-dash-text-strong shadow-sm ring-1 ring-dash-border' : 'text-dash-text-faded hover:text-dash-text-strong hover:bg-dash-bg-elevated/50'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[16rem] flex-1">
          <IconSearch
            width={16}
            height={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dash-text-extra-faded"
          />
          <Input
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            placeholder="Search error messages…"
            className="pl-9"
          />
        </div>

        <select
          value={filters.sort}
          onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value }))}
          className="input-base input-focus px-3 py-2 text-[14px] text-dash-text-strong"
        >
          <option value="last_seen">Last seen</option>
          <option value="event_count">Event count</option>
          <option value="first_seen">First seen</option>
        </select>
      </div>
      </div>

      {error && <ErrorBox message={error} />}

      {!loading && items.length === 0 && !error && (
        <Card className="p-6">
          <Empty>
            <IconLayers width={28} height={28} />
            <span>No issues match your filters.</span>
          </Empty>
        </Card>
      )}

      {items.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((fp) => (
            <button
              key={fp.id}
              onClick={() => navigate(`/fingerprints/${fp.id}`)}
              className="group flex min-h-[168px] cursor-pointer flex-col overflow-clip rounded-[4px] border-[0.5px] border-dash-border hover:border-dash-text-faded bg-dash-bg text-left shadow-sm transition-all hover:-translate-y-[2px] hover:shadow-md"
            >
              {}
              <div className="flex min-h-0 flex-1 flex-col gap-0.5 px-3.5 pt-3 pb-2 text-[14px] tracking-[-0.02px]">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 shrink font-mono font-medium leading-5 text-dash-text-strong truncate">
                      {fp.error_type}
                    </span>
                  </div>
                  <StatusBadge status={fp.status} />
                </div>
                <span className="mt-2 line-clamp-2 font-light leading-[22px] text-dash-text-faded">
                  {fp.sample_error_message || "—"}
                </span>
              </div>

              {}
              <div className="flex flex-wrap items-center gap-1.5 px-3.5 pb-3">
                <span className="inline-flex items-center rounded-sm bg-dash-bg-elevated px-1.5 py-0.5 text-[11px] font-medium text-dash-text-body">
                  {fp.handler}
                </span>
                <span className="inline-flex items-center rounded-sm bg-dash-bg-elevated px-1.5 py-0.5 text-[11px] font-medium text-dash-text-body">
                  {fp.error_type}
                </span>
              </div>

              {}
              <div className="relative flex shrink-0 items-center gap-2 px-3 pb-1 pt-0.5">
                <div className="absolute left-[23px] top-[-6px] h-[16px] w-px bg-dash-border" />
                <span className="text-[13px] tracking-[-0.02px] text-dash-text-strong font-medium">
                  {fmtNum(fp.event_count)} events
                </span>
              </div>

              {}
              <div className="flex h-10 shrink-0 items-center justify-end border-t-[0.5px] border-dash-border px-3.5 bg-dash-bg-elevated/30">
                <IconChevron className="size-4 text-dash-text-extra-faded transition-transform group-hover:translate-x-1" />
              </div>
            </button>
          ))}
        </div>
      )}

      {loading && items.length === 0 && (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" onClick={() => load(false, cursor)} disabled={loading}>
            {loading ? <Spinner /> : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
