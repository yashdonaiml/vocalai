import type { ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

/** Base surface: 8px corners, 1px border, no shadow. Name kept for compatibility. */
export function GlassCard({
  children,
  className,
  onClick,
  active,
}: {
  children: ReactNode;
  className?: string;
  delay?: number | undefined;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-2xl border border-border bg-card p-5 shadow-card transition-colors",
        onClick && "cursor-pointer hover:border-primary/40 hover:bg-accent/40",
        active && "border-primary ring-1 ring-primary",
        className,
      )}
    >
      {children}
    </div>
  );
}

export { GlassCard as Card };

export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow?: string; title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="text-xs font-medium text-subtle-foreground">{eyebrow}</p>}
        <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function SectionTitle({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function StatCard({
  label,
  value,
  delta,
  icon,
  invert,
}: {
  label: string;
  value: ReactNode;
  delta?: string;
  icon?: ReactNode;
  invert?: boolean;
  delay?: number | undefined;
}) {
  const up = delta ? !delta.startsWith("-") : true;
  const good = invert ? !up : up;
  return (
    <GlassCard className="p-4">
      <div className="flex items-start justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        {icon && <span className="grid h-8 w-8 place-items-center rounded-md bg-primary-soft text-primary [&_svg]:h-4 [&_svg]:w-4">{icon}</span>}
      </div>
      <div className="mt-1 font-mono text-2xl font-semibold tracking-tight">{value}</div>
      {delta && (
        <div className={cn("mt-1 inline-flex items-center gap-0.5 text-xs font-medium", good ? "text-success" : "text-destructive")}>
          {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
          {delta.replace(/^[-+]/, "")}
        </div>
      )}
    </GlassCard>
  );
}

export function ScoreRing({ score, size = 48 }: { score: number; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const color = score >= 80 ? "var(--success)" : score >= 60 ? "var(--warning)" : "var(--destructive)";
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={4} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={4} strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
      </svg>
      <span className="absolute font-mono text-xs font-semibold">{score}</span>
    </div>
  );
}

const badgeTones = {
  muted: "bg-muted text-muted-foreground",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  primary: "bg-primary-soft text-primary",
  destructive: "bg-danger-soft text-destructive",
  info: "bg-info-soft text-info",
} as const;

export function Pill({ children, tone = "muted", dot }: { children: ReactNode; tone?: keyof typeof badgeTones; dot?: boolean }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium", badgeTones[tone])}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export { Pill as StatusBadge };

const systemTones = {
  live: "bg-success-soft text-success",
  ok: "bg-success-soft text-success",
  warn: "bg-warning-soft text-warning",
  deployed: "bg-primary-soft text-primary",
  muted: "bg-muted text-muted-foreground",
} as const;

/** Small uppercase status label: the single place to change system-label styling. */
export function SystemLabel({ children, tone = "muted", dot, className }: { children: ReactNode; tone?: keyof typeof systemTones; dot?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-pixel", systemTones[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Readout({ label, value, tone = "muted", className }: { label: string; value: ReactNode; tone?: keyof typeof systemTones; className?: string }) {
  return (
    <div className={cn("space-y-1", className)}>
      <span className={cn("text-xs", tone === "muted" ? "text-muted-foreground" : systemTones[tone].split(" ")[1])}>{label}</span>
      <div className="font-mono text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}
