import { Check, Circle, LockKeyhole } from "lucide-react";
import { GlassCard, SystemLabel } from "@/components/apple";

export type BuilderStageState = "complete" | "current" | "waiting" | "unavailable";

export type BuilderStage = {
  key: "business" | "behavior" | "outcome" | "test" | "activate";
  label: string;
  description: string;
  state: BuilderStageState;
  href?: string | undefined;
};

const stateCopy: Record<BuilderStageState, string> = {
  complete: "Complete",
  current: "In progress",
  waiting: "Not started",
  unavailable: "Not ready",
};

export function BuilderJourney({ stages }: { stages: BuilderStage[] }) {
  return (
    <GlassCard className="mb-5" aria-label="Assistant setup progress">
      <ol className="grid gap-3 md:grid-cols-5">
        {stages.map((stage, index) => {
          const content = (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-xs font-semibold">
                  {stage.state === "complete" ? (
                    <Check className="h-4 w-4" aria-hidden="true" />
                  ) : stage.state === "unavailable" ? (
                    <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    index + 1
                  )}
                </span>
                <SystemLabel
                  tone={
                    stage.state === "complete"
                      ? "ok"
                      : stage.state === "current"
                        ? "live"
                        : stage.state === "unavailable"
                          ? "warn"
                          : "muted"
                  }
                >
                  {stateCopy[stage.state]}
                </SystemLabel>
              </div>
              <p className="mt-3 text-sm font-semibold">{stage.label}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{stage.description}</p>
            </>
          );
          return (
            <li key={stage.key} aria-current={stage.state === "current" ? "step" : undefined}>
              {stage.href ? (
                <a
                  href={stage.href}
                  className="block min-h-full rounded-xl border border-border/70 p-3 transition-colors hover:bg-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {content}
                </a>
              ) : (
                <div className="min-h-full rounded-xl border border-border/70 p-3">{content}</div>
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-4 flex items-start gap-2 border-t border-border/70 pt-4 text-xs text-muted-foreground">
        <Circle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
        Completing setup does not make the assistant live. Activation stays locked until the
        required checks pass and a phone number is ready.
      </p>
    </GlassCard>
  );
}
