import { RoomEvent, ParticipantKind, type RemoteParticipant } from "@livekit/rtc-node";
import type { JobContext } from "@livekit/agents";
// Execution engines. The only file that maps aviroh provider refs onto LiveKit plugins.
import * as openai from "@livekit/agents-plugin-openai";
import * as google from "@livekit/agents-plugin-google";
import * as deepgram from "@livekit/agents-plugin-deepgram";
import * as elevenlabs from "@livekit/agents-plugin-elevenlabs";
import * as cartesia from "@livekit/agents-plugin-cartesia";
import * as silero from "@livekit/agents-plugin-silero";
import type { Bundle, ModelRef } from "./control-plane.js";

type Creds = Record<string, string>;
const key = (c: Creds, p: string) => {
  if (!c[p]) throw new Error(`missing credential for ${p}`);
  return c[p];
};

function realtime(ref: ModelRef, voice: string, c: Creds) {
  switch (ref.provider) {
    case "openai":
      return new openai.realtime.RealtimeModel({ model: ref.model, voice, apiKey: key(c, "openai") });
    case "google":
      return new google.beta.realtime.RealtimeModel({ model: ref.model, voice, apiKey: key(c, "google") });
    default:
      throw new Error(`no realtime adapter for ${ref.provider}`);
  }
}

function stt(ref: ModelRef, c: Creds) {
  switch (ref.provider) {
    case "deepgram": return new deepgram.STT({ model: ref.model as never, language: ref.language ?? "en", apiKey: key(c, "deepgram") });
    case "openai": return new openai.STT({ model: ref.model, apiKey: key(c, "openai") });
    default: throw new Error(`no STT adapter for ${ref.provider}`);
  }
}

function llm(ref: ModelRef, c: Creds) {
  switch (ref.provider) {
    case "openai": return new openai.LLM({ model: ref.model, apiKey: key(c, "openai") });
    case "google": return new google.LLM({ model: ref.model, apiKey: key(c, "google") });
    // Anthropic via its OpenAI-compatible endpoint keeps one adapter shape.
    case "anthropic": return new openai.LLM({ model: ref.model, apiKey: key(c, "anthropic"), baseURL: "https://api.anthropic.com/v1/" });
    default: throw new Error(`no LLM adapter for ${ref.provider}`);
  }
}

function tts(ref: ModelRef & { voice: string }, c: Creds) {
  switch (ref.provider) {
    case "elevenlabs": return new elevenlabs.TTS({ model: ref.model, voiceId: ref.voice || undefined, apiKey: key(c, "elevenlabs") } as never);
    case "cartesia": return new cartesia.TTS({ model: ref.model, voice: ref.voice || undefined, language: ref.language ?? "en", apiKey: key(c, "cartesia") });
    case "deepgram": return new deepgram.TTS({ model: ref.voice || ref.model, apiKey: key(c, "deepgram") } as never);
    case "openai": return new openai.TTS({ model: ref.model, voice: (ref.voice || "alloy") as never, apiKey: key(c, "openai") });
    default: throw new Error(`no TTS adapter for ${ref.provider}`);
  }
}

export const prewarmVoice = () => silero.VAD.load();

export async function buildSessionOptions(bundle: Bundle, creds: Creds, vad?: Awaited<ReturnType<typeof silero.VAD.load>>) {
  const r = bundle.runtime;
  if (r.mode === "native") return { llm: realtime(r.realtime, r.voice, creds) };
  return { vad: vad ?? await silero.VAD.load(), stt: stt(r.stt, creds), llm: llm(r.llm, creds), tts: tts(r.tts, creds) };
}

// Transport-specific caller selection and lifecycle events stay in this adapter.
export function waitForCaller(ctx: JobContext, telephone: boolean, timeoutMs = 30_000): Promise<RemoteParticipant> {
  return new Promise((resolve, reject) => {
    const matches = (p: RemoteParticipant) => telephone ? p.kind === ParticipantKind.SIP : p.kind !== ParticipantKind.AGENT;
    const cleanup = () => { clearTimeout(timer); ctx.room.off(RoomEvent.ParticipantConnected, joined); ctx.room.off(RoomEvent.Disconnected, disconnected); };
    const joined = (p: RemoteParticipant) => { if (matches(p)) { cleanup(); resolve(p); } };
    const disconnected = () => { cleanup(); reject(new Error("Room disconnected before caller joined")); };
    const timer = setTimeout(() => { cleanup(); reject(new Error("Caller did not join before the timeout")); }, timeoutMs);
    ctx.room.on(RoomEvent.ParticipantConnected, joined);
    ctx.room.on(RoomEvent.Disconnected, disconnected);
    const existing = [...ctx.room.remoteParticipants.values()].find(matches);
    if (existing) { cleanup(); resolve(existing); }
  });
}

export function callerNumber(participant: Pick<RemoteParticipant, "attributes">): string | undefined {
  const value = participant.attributes["sip.phoneNumber"];
  return value && /^\+[1-9][0-9]{6,14}$/.test(value) ? value : undefined;
}

export function watchCaller(ctx: JobContext, identity: string, onLeave: () => void) {
  const left = (p: RemoteParticipant) => { if (p.identity === identity) onLeave(); };
  ctx.room.on(RoomEvent.ParticipantDisconnected, left);
  ctx.room.on(RoomEvent.Disconnected, onLeave);
  if (!ctx.room.remoteParticipants.has(identity)) queueMicrotask(onLeave);
  return () => { ctx.room.off(RoomEvent.ParticipantDisconnected, left); ctx.room.off(RoomEvent.Disconnected, onLeave); };
}
