import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Send, RotateCcw } from "lucide-react";
import { GlassCard, SystemLabel } from "@/components/apple";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/lib/notify";
import { testChat } from "@/lib/agent-test.functions";
import type { CallBehavior } from "@/lib/agent-config";

const label = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";

export function CallBehaviorEditor({
  value,
  onChange,
}: {
  value: CallBehavior;
  onChange: (v: CallBehavior) => void;
}) {
  const set = <K extends keyof CallBehavior>(k: K, v: CallBehavior[K]) =>
    onChange({ ...value, [k]: v });
  return (
    <GlassCard className="space-y-4">
      <h2 className="font-semibold">Call behavior</h2>
      <p className="text-xs text-muted-foreground">
        Duration and silence limits take effect when you publish and deploy a new version.
        Unavailable controls below do not affect calls.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={label}>Longest call (minutes)</span>
          <Input
            className="mt-1.5"
            type="number"
            min={1}
            max={120}
            value={value.maxMinutes}
            onChange={(e) =>
              set("maxMinutes", Math.min(120, Math.max(1, Number(e.target.value) || 1)))
            }
          />
        </label>
        <label className="block">
          <span className={label}>End after silence (seconds)</span>
          <Input
            className="mt-1.5"
            type="number"
            min={5}
            max={120}
            value={value.silenceSeconds}
            onChange={(e) =>
              set("silenceSeconds", Math.min(120, Math.max(5, Number(e.target.value) || 5)))
            }
          />
        </label>
      </div>
      <fieldset disabled className="space-y-4 opacity-60">
        <legend className="mb-2 text-xs text-muted-foreground">
          Unavailable in the current voice service
        </legend>
        <label className="block">
          <span className={label}>Phrases that end the call</span>
          <Input
            className="mt-1.5"
            maxLength={300}
            value={value.endPhrases}
            onChange={(e) => set("endPhrases", e.target.value)}
          />
        </label>
        <label className="block">
          <span className={label}>Transfer number</span>
          <Input
            className="mt-1.5"
            maxLength={20}
            placeholder="+15551234567"
            value={value.transferNumber}
            onChange={(e) => set("transferNumber", e.target.value)}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={label}>If voicemail answers</span>
            <select
              className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={value.voicemail}
              onChange={(e) => set("voicemail", e.target.value as CallBehavior["voicemail"])}
            >
              <option value="hang_up">Hang up</option>
              <option value="leave_message">Leave a message</option>
            </select>
          </label>
          {value.voicemail === "leave_message" && (
            <label className="block">
              <span className={label}>Voicemail message</span>
              <Input
                className="mt-1.5"
                maxLength={400}
                value={value.voicemailMessage}
                onChange={(e) => set("voicemailMessage", e.target.value)}
              />
            </label>
          )}
        </div>
        <label className="block">
          <span className={label}>After-hours message</span>
          <Textarea
            className="mt-1.5"
            rows={2}
            maxLength={400}
            value={value.afterHoursMessage}
            onChange={(e) => set("afterHoursMessage", e.target.value)}
          />
        </label>
      </fieldset>
      <label className="block">
        <span className={label}>Topics to avoid</span>
        <Input
          className="mt-1.5"
          maxLength={400}
          placeholder="competitors, medical advice"
          value={value.bannedTopics}
          onChange={(e) => set("bannedTopics", e.target.value)}
        />
      </label>
      <label className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        Recording announcement (unavailable)
        <Switch disabled checked={false} />
      </label>
    </GlassCard>
  );
}

type Msg = { role: "user" | "assistant"; content: string; snippets?: string[] };

export function TestChat({ agentId, dirty }: { agentId: string; dirty: boolean }) {
  const ask = useServerFn(testChat);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState("");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    const next = [...msgs, { role: "user" as const, content: text.trim() }];
    setMsgs(next);
    setText("");
    setBusy(true);
    try {
      const r = await ask({
        data: { agentId, messages: next.map(({ role, content }) => ({ role, content })) },
      });
      setModel(r.model);
      setMsgs([...next, { role: "assistant", content: r.reply, snippets: r.snippets }]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The agent could not answer");
      setMsgs(msgs);
    } finally {
      setBusy(false);
    }
  }

  return (
    <GlassCard className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Text test</h2>
        <div className="flex items-center gap-2">
          {model && <SystemLabel>{model}</SystemLabel>}
          <Button size="sm" variant="ghost" onClick={() => setMsgs([])}>
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Type as a caller would. Uses the saved draft, its knowledge and its rules.
        {dirty && " Save first to test your latest changes."}
      </p>
      <div className="max-h-[420px] min-h-40 space-y-3 overflow-y-auto rounded-xl bg-muted p-3">
        {msgs.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No messages yet. Ask something a caller might ask.
          </p>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            <span
              className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-left text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-card"}`}
            >
              {m.content}
            </span>
            {m.snippets && m.snippets.length > 0 && (
              <details className="mt-1 text-xs text-muted-foreground">
                <summary className="cursor-pointer">Knowledge used ({m.snippets.length})</summary>
                {m.snippets.map((s, k) => (
                  <p key={k} className="mt-1 rounded-lg bg-card p-2">
                    {s}
                  </p>
                ))}
              </details>
            )}
          </div>
        ))}
        {busy && <p className="text-xs text-muted-foreground">Thinking</p>}
      </div>
      <form onSubmit={send} className="flex gap-2">
        <Input
          maxLength={4000}
          aria-label="Message"
          placeholder="Type a message"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit" className="rounded-full" disabled={busy || !text.trim()}>
          <Send className="h-4 w-4" /> Send
        </Button>
      </form>
    </GlassCard>
  );
}

const FIELD_LABELS: Record<string, string> = {
  persona: "Persona",
  instructions: "Instructions",
  greeting: "Opening line",
  language: "Language",
  guardrails: "Guardrails",
  handoff: "Handoff",
  runtime: "Voice and AI",
  callBehavior: "Call behavior",
  knowledge_base_ids: "Knowledge",
  tool_ids: "Tools",
};

export function diffConfigs(a: Record<string, unknown>, b: Record<string, unknown>) {
  const result: { field: string; before: string; after: string }[] = [];
  const flatten = (value: unknown, prefix: string, out: Record<string, unknown>) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [key, item] of Object.entries(value))
        flatten(item, prefix ? `${prefix}.${key}` : key, out);
    } else out[prefix] = value;
  };
  const left: Record<string, unknown> = {},
    right: Record<string, unknown> = {};
  flatten(a, "", left);
  flatten(b, "", right);
  for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
    if (JSON.stringify(left[key] ?? null) !== JSON.stringify(right[key] ?? null))
      result.push({
        field: key
          .split(".")
          .map((part) => FIELD_LABELS[part] ?? part.replace(/_/g, " "))
          .join(" / "),
        before:
          typeof left[key] === "object"
            ? JSON.stringify(left[key] ?? "Not set")
            : String(left[key] ?? "Not set"),
        after:
          typeof right[key] === "object"
            ? JSON.stringify(right[key] ?? "Not set")
            : String(right[key] ?? "Not set"),
      });
  }
  return result;
}
