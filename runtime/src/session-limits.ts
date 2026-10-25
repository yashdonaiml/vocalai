export type CallLimits = { max_minutes: number; silence_seconds: number };
type Timer = ReturnType<typeof setTimeout>;
type Clock = { setTimeout: (fn: () => void, ms: number) => Timer; clearTimeout: (timer: Timer) => void };

export function validateCallLimits(value: unknown): CallLimits | undefined {
  if (value === undefined) return undefined; // Old pinned bundles retain their original behavior.
  const limits = value as Partial<CallLimits> | null;
  if (!limits || !Number.isFinite(limits.max_minutes) || limits.max_minutes! < 1 || limits.max_minutes! > 120 || !Number.isFinite(limits.silence_seconds) || limits.silence_seconds! < 5 || limits.silence_seconds! > 120) throw new Error("The runtime bundle has invalid call limits.");
  return { max_minutes: limits.max_minutes!, silence_seconds: limits.silence_seconds! };
}

// Each session owns both timers. Agent speech/thinking and caller speech suspend
// silence expiry; total duration remains bounded even when a provider is stuck.
export class SessionLimits {
  private total: Timer | undefined;
  private silent: Timer | undefined;
  private started = false;
  private disposed = false;
  private userSpeaking = false;
  private agentBusy = true;
  constructor(private readonly limits: CallLimits, private readonly stop: (reason: "max_duration" | "silence_timeout") => void, private readonly clock: Clock = { setTimeout, clearTimeout }) {}

  start() {
    if (this.started || this.disposed) return;
    this.started = true;
    this.total = this.clock.setTimeout(() => this.expire("max_duration"), this.limits.max_minutes * 60_000);
    this.resetSilence();
  }
  setUserSpeaking(speaking: boolean) { this.userSpeaking = speaking; this.resetSilence(); }
  setAgentBusy(busy: boolean) { this.agentBusy = busy; this.resetSilence(); }
  activity() { this.resetSilence(); }
  dispose() {
    this.disposed = true;
    if (this.total !== undefined) this.clock.clearTimeout(this.total);
    if (this.silent !== undefined) this.clock.clearTimeout(this.silent);
    this.total = undefined;
    this.silent = undefined;
  }
  private expire(reason: "max_duration" | "silence_timeout") {
    if (this.disposed) return;
    this.dispose();
    this.stop(reason);
  }
  private resetSilence() {
    if (this.silent !== undefined) this.clock.clearTimeout(this.silent);
    this.silent = undefined;
    if (!this.started || this.disposed || this.userSpeaking || this.agentBusy) return;
    this.silent = this.clock.setTimeout(() => this.expire("silence_timeout"), this.limits.silence_seconds * 1000);
  }
}
