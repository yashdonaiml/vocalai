import { cn } from "@/lib/utils";

/** Aviroh logo: an upward "A" peak (growth) with an orbiting AI spark, inside an app-icon tile. */
export function AvirohMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("h-7 w-7", className)} aria-hidden="true">
      <rect width="40" height="40" rx="9" fill="var(--primary)" />
      <path
        d="M11 29 L20 11 L29 29"
        fill="none"
        stroke="var(--primary-foreground)"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M15.5 23.5 Q20 20.5 24.5 23.5" fill="none" stroke="var(--primary-foreground)" strokeWidth="2.6" strokeLinecap="round" opacity="0.85" />
      <path d="M30 8.5 l1 2.4 2.4 1 -2.4 1 -1 2.4 -1 -2.4 -2.4 -1 2.4 -1z" fill="var(--primary-foreground)" />
    </svg>
  );
}

export function AvirohLogo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <AvirohMark />
      <span className="text-[17px] font-semibold tracking-tight">VocollAI</span>
    </span>
  );
}
