import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/lib/notify";
import { Mic, PhoneOff } from "lucide-react";
import type { Room } from "livekit-client";
import { GlassCard, SystemLabel } from "@/components/apple";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MODELS, REALTIME_VOICES, providerLabel, type Capability } from "@/lib/providers/catalog";
import {
  DEFAULT_COMPOSABLE,
  DEFAULT_RUNTIME,
  type ModelRef,
  type RuntimeConfig,
} from "@/lib/agent-config";
import { startTestSession } from "@/lib/platform.functions";

const sel = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </span>
  );
}

function ModelSelect({
  cap,
  value,
  onChange,
}: {
  cap: Capability;
  value: ModelRef;
  onChange: (v: ModelRef) => void;
}) {
  return (
    <select
      className={sel}
      value={`${value.provider}:${value.model}`}
      onChange={(e) => {
        const [provider, model] = e.target.value.split(":");
        onChange({ ...value, provider: provider as ModelRef["provider"], model: model ?? "" });
      }}
    >
      {MODELS[cap].map((m) => (
        <option key={`${m.provider}:${m.id}`} value={`${m.provider}:${m.id}`}>
          {providerLabel(m.provider)} · {m.label}
        </option>
      ))}
    </select>
  );
}

export function RuntimeEditor({
  value,
  onChange,
}: {
  value: RuntimeConfig;
  onChange: (v: RuntimeConfig) => void;
}) {
  return (
    <div className="space-y-4">
      <label className="block">
        <Label>Execution mode</Label>
        <select
          className={`${sel} mt-1.5`}
          value={value.mode}
          onChange={(e) =>
            onChange(e.target.value === "native" ? DEFAULT_RUNTIME : DEFAULT_COMPOSABLE)
          }
        >
          <option value="native">Native realtime (speech-to-speech)</option>
          <option value="composable">Composable: STT → LLM → TTS</option>
        </select>
      </label>
      {value.mode === "native" ? (
        <>
          <label className="block">
            <Label>Realtime model</Label>
            <div className="mt-1.5">
              <ModelSelect
                cap="realtime"
                value={value.realtime}
                onChange={(realtime) =>
                  onChange({
                    ...value,
                    realtime,
                    voice: REALTIME_VOICES[realtime.provider]?.[0] ?? "",
                  })
                }
              />
            </div>
          </label>
          <label className="block">
            <Label>Voice</Label>
            <select
              className={`${sel} mt-1.5`}
              value={value.voice}
              onChange={(e) => onChange({ ...value, voice: e.target.value })}
            >
              {(REALTIME_VOICES[value.realtime.provider] ?? []).map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        </>
      ) : (
        <>
          <label className="block">
            <Label>Speech-to-text</Label>
            <div className="mt-1.5">
              <ModelSelect
                cap="stt"
                value={value.stt}
                onChange={(stt) => onChange({ ...value, stt })}
              />
            </div>
          </label>
          <label className="block">
            <Label>Language model</Label>
            <div className="mt-1.5">
              <ModelSelect
                cap="llm"
                value={value.llm}
                onChange={(llm) => onChange({ ...value, llm })}
              />
            </div>
          </label>
          <label className="block">
            <Label>Text-to-speech</Label>
            <div className="mt-1.5">
              <ModelSelect
                cap="tts"
                value={value.tts}
                onChange={(t) => onChange({ ...value, tts: { ...t, voice: value.tts.voice } })}
              />
            </div>
          </label>
          <label className="block">
            <Label>Voice ID</Label>
            <Input
              className="mt-1.5 font-mono"
              placeholder="Provider voice ID"
              value={value.tts.voice}
              onChange={(e) => onChange({ ...value, tts: { ...value.tts, voice: e.target.value } })}
            />
          </label>
        </>
      )}
    </div>
  );
}

type Status = "idle" | "connecting" | "live" | "ending";

export type TestCallJoin = { serverUrl: string; token: string; sessionId: string };

export function TestCall({
  agentId,
  startSession,
  disabled = false,
  onSessionStarted,
  onDisconnected,
  onError,
  onStatusChange,
}: {
  agentId: string;
  startSession?: () => Promise<TestCallJoin>;
  disabled?: boolean;
  onSessionStarted?: (sessionId: string) => void;
  onDisconnected?: (sessionId: string) => void;
  onError?: (message: string) => void;
  onStatusChange?: (status: Status) => void;
}) {
  const start = useServerFn(startTestSession);
  const [status, setStatus] = useState<Status>("idle");
  const [captions, setCaptions] = useState<{ id: string; role: string; text: string }[]>([]);
  const roomRef = useRef<Room | null>(null);
  const sessionRef = useRef<string | null>(null);
  const startingRef = useRef(false);
  const mountedRef = useRef(true);
  const callbacksRef = useRef({ onSessionStarted, onDisconnected, onError, onStatusChange });
  callbacksRef.current = { onSessionStarted, onDisconnected, onError, onStatusChange };
  const audioBox = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      void roomRef.current?.disconnect();
      roomRef.current = null;
      audioBox.current?.replaceChildren();
    };
  }, []);

  function changeStatus(next: Status) {
    if (!mountedRef.current) return;
    setStatus(next);
    callbacksRef.current.onStatusChange?.(next);
  }

  async function begin() {
    if (startingRef.current || roomRef.current || disabled) return;
    startingRef.current = true;
    changeStatus("connecting");
    setCaptions([]);
    let room: Room | null = null;
    let sessionId: string | null = null;
    let disconnected = false;
    const disconnectedOnce = () => {
      if (disconnected) return;
      disconnected = true;
      if (roomRef.current === room) roomRef.current = null;
      audioBox.current?.replaceChildren();
      if (!mountedRef.current) return;
      changeStatus("idle");
      if (sessionId) callbacksRef.current.onDisconnected?.(sessionId);
    };
    try {
      const join = startSession ? await startSession() : await start({ data: { agentId } });
      sessionId = join.sessionId;
      sessionRef.current = join.sessionId;
      if (!mountedRef.current) return;
      callbacksRef.current.onSessionStarted?.(join.sessionId);
      const { Room, RoomEvent, Track } = await import("livekit-client");
      if (!mountedRef.current) return;
      room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;
      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (mountedRef.current && track.kind === Track.Kind.Audio)
          audioBox.current?.appendChild(track.attach());
      });
      room.on(RoomEvent.TranscriptionReceived, (segments, participant) => {
        if (!mountedRef.current) return;
        const role = participant?.identity === room?.localParticipant.identity ? "You" : "Agent";
        setCaptions((c) => {
          const next = [...c];
          for (const s of segments) {
            const i = next.findIndex((x) => x.id === s.id);
            if (i >= 0) next[i] = { ...next[i]!, text: s.text };
            else next.push({ id: s.id, role, text: s.text });
          }
          return next.slice(-30);
        });
      });
      room.on(RoomEvent.Disconnected, disconnectedOnce);
      await room.connect(join.serverUrl, join.token);
      if (!mountedRef.current || disconnected) {
        await room.disconnect();
        return;
      }
      await room.localParticipant.setMicrophoneEnabled(true);
      if (!mountedRef.current || disconnected) {
        await room.disconnect();
        return;
      }
      changeStatus("live");
    } catch (e) {
      if (room) await room.disconnect().catch(() => undefined);
      disconnectedOnce();
      if (mountedRef.current) {
        const message =
          e instanceof Error &&
          /NotAllowedError|permission|microphone/i.test(`${e.name} ${e.message}`)
            ? "Microphone access was denied. Allow microphone access in your browser, then try again."
            : e instanceof Error
              ? e.message
              : "Could not start the call";
        toast.error(message);
        callbacksRef.current.onError?.(message);
      }
    } finally {
      startingRef.current = false;
    }
  }

  async function end() {
    changeStatus("ending");
    try {
      await roomRef.current?.disconnect();
    } finally {
      if (!roomRef.current) changeStatus("idle");
    }
  }

  const active = status !== "idle";
  return (
    <GlassCard>
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-realtime">
          {startSession ? "Inbox-only voice preview" : "Test call"}
        </h2>
        <SystemLabel
          tone={status === "live" ? "live" : status === "connecting" ? "warn" : "muted"}
          dot={status === "live"}
        >
          {status === "live" ? "Live" : status}
        </SystemLabel>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {startSession
          ? "Use test contact details. A caller-confirmed enquiry is saved only in the callback inbox; nobody is notified."
          : "Try your saved draft in a test call. Save first after changes."}
      </p>
      <p className="mt-4 font-pixel text-realtime/70">RT · Session</p>
      <div className="my-3 flex h-12 items-end justify-center gap-1">
        {Array.from({ length: 24 }).map((_, i) => (
          <span
            key={i}
            className={`w-1.5 rounded-full bg-realtime ${status === "live" ? "animate-pulse" : "opacity-30"}`}
            style={{ height: `${20 + ((i * 37) % 80)}%`, animationDelay: `${i * 60}ms` }}
          />
        ))}
      </div>
      {active ? (
        <Button
          variant="destructive"
          className="w-full rounded-full"
          onClick={end}
          disabled={status === "ending" || status === "connecting"}
        >
          <PhoneOff className="h-4 w-4" /> End call
        </Button>
      ) : (
        <Button className="w-full rounded-full" onClick={begin} disabled={disabled}>
          <Mic className="h-4 w-4" />{" "}
          {startSession ? "Authorize and start voice preview" : "Start test call"}
        </Button>
      )}
      <div ref={audioBox} hidden />
      {captions.length > 0 && (
        <div className="mt-4 max-h-64 space-y-2 overflow-y-auto text-sm">
          {captions.map((c) => (
            <p key={c.id}>
              <span className={c.role === "You" ? "text-primary" : "text-realtime"}>{c.role}:</span>{" "}
              {c.text}
            </p>
          ))}
        </div>
      )}
    </GlassCard>
  );
}
