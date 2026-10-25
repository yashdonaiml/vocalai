export type RuntimeEvent =
  | { type: "turn"; role: "user" | "assistant"; content: string }
  | { type: "usage"; kind: string; model: string; quantity: number; unit: string }
  | { type: "end"; reason: string };

type Batch = { id: string; events: RuntimeEvent[]; frozen: boolean };

// One ordered sender per session. A failed send retains its original batch ID
// and payload so the control plane can deduplicate an acknowledged-but-lost reply.
export class SessionEvents {
  private batches: Batch[] = [];
  private flushing: Promise<void> | undefined;
  private ended = false;
  private finishing: Promise<void> | undefined;

  constructor(private send: (batchId: string, events: RuntimeEvent[]) => Promise<unknown>) {}

  append(event: RuntimeEvent) {
    if (this.ended) return;
    let batch = this.batches.at(-1);
    if (!batch || batch.frozen || batch.events.length >= 200) {
      batch = { id: crypto.randomUUID(), events: [], frozen: false };
      this.batches.push(batch);
    }
    batch.events.push(event);
    if (event.type === "end") this.ended = true;
  }

  flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    this.flushing = Promise.resolve().then(async () => {
      while (this.batches.length) {
        const batch = this.batches[0]!;
        batch.frozen = true;
        await this.send(batch.id, batch.events);
        this.batches.shift();
      }
    }).finally(() => { this.flushing = undefined; });
    return this.flushing;
  }

  finish(reason: string, retryDelayMs = 250): Promise<void> {
    if (!this.finishing) {
      this.append({ type: "end", reason });
      this.finishing = (async () => {
        for (let attempt = 0; ; attempt++) {
          try { await this.flush(); return; }
          catch (error) {
            if (attempt >= 2) throw error;
            await new Promise((resolve) => setTimeout(resolve, retryDelayMs * (attempt + 1)));
          }
        }
      })();
    }
    return this.finishing;
  }
}
