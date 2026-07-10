import { useState, useRef, useEffect } from "react";
import { Search, ChevronDown, Check, Copy } from "lucide-react";
import { useAuth } from "../../state/auth";
import { navigate } from "../../App";

function ProjectSwitcher() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [open]);

  const activeProjectLabel = "Arbiger Local";

  async function handleCopyProjectName(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(activeProjectLabel);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      
    }
  }

  return (
    <div className="relative flex min-w-0 items-center gap-1" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex min-w-0 max-w-[136px] items-center gap-1 text-sm font-medium text-dash-text-faded transition-colors hover:text-dash-text-strong sm:max-w-[260px]"
      >
        <span className="truncate whitespace-nowrap">{activeProjectLabel}</span>
        <ChevronDown className={`size-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      <button
        type="button"
        onClick={handleCopyProjectName}
        className="flex size-6 shrink-0 items-center justify-center rounded-[4px] text-dash-text-faded transition-colors hover:bg-dash-bg-elevated hover:text-dash-text-strong"
      >
        {copied ? <Check className="size-3.5 text-brand" /> : <Copy className="size-3.5" />}
      </button>
      
      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-[200px] origin-top-left overflow-clip rounded-[4px] border-[0.5px] border-dash-border bg-dash-bg shadow-sm">
          <div className="flex flex-col gap-1 p-1">
            <button
              onClick={() => setOpen(false)}
              className="flex h-8 items-center px-2 text-left text-sm transition-colors text-dash-text-strong bg-dash-bg-elevated rounded"
            >
              {activeProjectLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function WorkspaceSwitcher() {
  const { conn, clear } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [open]);

  if (!conn) return null;

  return (
    <div className="relative flex items-center gap-1" ref={ref}>
      <button
        className="flex items-center gap-2 rounded-[4px] py-0.5 text-sm font-medium text-dash-text-strong transition-colors hover:text-dash-text-body"
      >
        <div className="size-6 rounded-full bg-brand flex items-center justify-center text-brand-ink text-xs font-bold">
          A
        </div>
        <span className="truncate max-w-[90px] sm:max-w-[180px]">Arbiger</span>
      </button>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center rounded-[4px] p-0.5 text-dash-text-strong transition-colors hover:bg-dash-bg-elevated"
      >
        <ChevronDown className={`size-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-[243px] origin-top-left overflow-clip rounded-[4px] border-[0.5px] border-dash-border bg-dash-bg shadow-sm">
           <div className="border-b-[0.5px] border-dash-border px-2 pb-4 pt-2">
            <div className="py-2">
              <span className="text-xs text-dash-text-extra-faded">Connected to</span>
            </div>
            <div className="flex w-full cursor-pointer flex-col rounded-[4px] px-2 py-2 bg-dash-bg-elevated">
              <span className="text-left text-sm text-dash-text-strong truncate">{conn.baseUrl}</span>
            </div>
          </div>
          <div className="flex flex-col bg-dash-bg-elevated">
            <button
              onClick={() => {
                setOpen(false);
                clear();
                navigate("/fingerprints");
              }}
              className="flex h-10 w-full items-center gap-2 px-3.5 text-sm text-rose transition-colors hover:bg-surface-3"
            >
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Topbar() {
  return (
    <header className="sticky top-0 z-40 flex h-[52px] shrink-0 items-center justify-between border-b-[0.5px] border-dash-border bg-dash-bg/80 px-4 backdrop-blur-md">
      <div className="flex items-center gap-2">
        <WorkspaceSwitcher />
        <span className="text-dash-text-extra-faded font-light">/</span>
        <ProjectSwitcher />
      </div>

      <div className="flex items-center gap-3">
        <button className="hidden sm:flex h-8 items-center gap-2 rounded-[4px] border-[0.5px] border-dash-border bg-dash-bg-elevated px-2.5 text-sm text-dash-text-faded transition-colors hover:text-dash-text-strong">
          <Search className="size-3.5" />
          <span className="font-medium text-[12px] opacity-70">Search...</span>
        </button>
      </div>
    </header>
  );
}
