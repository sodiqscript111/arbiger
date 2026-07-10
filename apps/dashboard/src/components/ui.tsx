import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function Button({
  children,
  variant = "ghost",
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "outline" }) {
  const variants: Record<string, string> = {
    primary:
      "bg-dash-text-strong text-dash-bg shadow-sm hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
    ghost: 
      "text-dash-text-body hover:text-dash-text-strong hover:bg-dash-bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors",
    outline:
      "bg-dash-btn-outline-bg border-[0.5px] border-dash-btn-outline-border text-dash-btn-outline-text shadow-sm hover:bg-dash-bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all",
  };
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-[6px] px-3 py-1.5 text-sm font-medium disabled:opacity-50 disabled:pointer-events-none ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <div className={`rounded-xl border-[0.5px] border-dash-border bg-dash-bg shadow-sm ${className}`}>{children}</div>
  );
}

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...rest}
      className={`input-base input-focus px-3 py-2 text-[14px] text-dash-text-strong placeholder:text-dash-text-extra-faded ${className}`}
    />
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <div
      className={`spin h-4 w-4 rounded-full border-2 border-dash-border border-t-dash-text-strong ${className}`}
    />
  );
}

export function StatusBadge({ status }: { status: "active" | "acknowledged" | "resolved" }) {
  const map = {
    active: { label: "active", cls: "text-destructive border-[0.5px] border-destructive/30 bg-destructive/10" },
    acknowledged: { label: "acknowledged", cls: "text-primary border-[0.5px] border-primary/30 bg-primary/10" },
    resolved: { label: "resolved", cls: "text-emerald-500 border-[0.5px] border-emerald-500/30 bg-emerald-500/10" },
  } as const;
  const s = map[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-[4px] px-2 py-0.5 text-xs font-medium ${s.cls}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {s.label}
    </span>
  );
}

const signal = {
  rose: "text-destructive border-destructive/30 bg-destructive/10",
  amber: "text-amber-500 border-amber-500/30 bg-amber-500/10",
  magenta: "text-magenta-500 border-magenta-500/30 bg-magenta-500/10",
  emerald: "text-emerald-500 border-emerald-500/30 bg-emerald-500/10",
  sky: "text-sky-500 border-sky-500/30 bg-sky-500/10",
  violet: "text-violet-500 border-violet-500/30 bg-violet-500/10",
  faded: "text-dash-text-faded border-dash-border bg-dash-bg-elevated",
};

export function SignalBadge({
  tone,
  children,
}: {
  tone: keyof typeof signal;
  children: ReactNode;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-[4px] border-[0.5px] px-2 py-0.5 text-xs font-medium ${signal[tone]}`}>
      {tone !== "faded" && <span className="h-1 w-1 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "brand",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: keyof typeof signal | "brand";
}) {
  const toneClass = tone === "brand" ? "text-dash-text-strong" : `text-${tone}-500`;
  return (
    <Card className="p-4 flex flex-col justify-center">
      <div className="text-xs font-medium text-dash-text-faded uppercase tracking-wider">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tracking-tight ${toneClass}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-dash-text-extra-faded">{hint}</div>}
    </Card>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-dash-text-faded bg-dash-bg-elevated rounded-xl border border-dashed border-dash-border">
      {children}
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-[8px] border-[0.5px] border-destructive bg-destructive/10 p-3 text-sm text-destructive">
      {message}
    </div>
  );
}
