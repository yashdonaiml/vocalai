import type { ProviderId } from "./providers/catalog";

export type ModelRef = { provider: ProviderId; model: string; language?: string };

export type RuntimeConfig =
  | { mode: "native"; realtime: ModelRef; voice: string }
  | { mode: "composable"; stt: ModelRef; llm: ModelRef; tts: ModelRef & { voice: string } };

export type AgentConfig = {
  persona: string;
  instructions: string;
  greeting: string;
  language: string;
  speechStyle?: "default" | "te-en";
  guardrails: string;
  handoff: string;
  runtime: RuntimeConfig;
  callBehavior: CallBehavior;
  flow?: ConversationFlow;
};

// Visual conversation flow: stages the agent moves through, compiled into its instructions.
export type FlowNode = { id: string; type: "start" | "step" | "end"; title: string; say: string; x: number; y: number };
export type FlowEdge = { id: string; source: string; target: string; when: string };
export type ConversationFlow = { enabled: boolean; nodes: FlowNode[]; edges: FlowEdge[] };

export function newFlow(): ConversationFlow {
  return { enabled: true, nodes: [
    { id: "start", type: "start", title: "Greeting", say: "Greet the caller and ask how you can help.", x: 40, y: 120 },
    { id: "end", type: "end", title: "Wrap up", say: "Confirm next steps and say goodbye.", x: 520, y: 120 },
  ], edges: [{ id: "e1", source: "start", target: "end", when: "" }] };
}

export function flowErrors(flow: ConversationFlow): string[] {
  const errs: string[] = [];
  const starts = flow.nodes.filter((n) => n.type === "start");
  if (starts.length !== 1) errs.push("The flow needs exactly one start step.");
  if (!flow.nodes.some((n) => n.type === "end")) errs.push("Add at least one end step.");
  for (const n of flow.nodes) {
    if (!n.title.trim()) errs.push("Every step needs a name.");
    if (n.type !== "end" && !flow.edges.some((e) => e.source === n.id)) errs.push(`"${n.title || "Untitled"}" does not lead anywhere.`);
    if (n.type !== "start" && !flow.edges.some((e) => e.target === n.id)) errs.push(`Nothing leads to "${n.title || "Untitled"}".`);
    const outs = flow.edges.filter((e) => e.source === n.id);
    if (outs.length > 1 && outs.some((e) => !e.when.trim())) errs.push(`"${n.title || "Untitled"}" has several paths, so each needs a condition.`);
  }
  return [...new Set(errs)];
}

// Turns the drawn flow into plain step-by-step instructions the voice model follows.
export function compileFlow(flow: ConversationFlow | undefined): string {
  if (!flow?.enabled || flowErrors(flow).length) return "";
  const start = flow.nodes.find((n) => n.type === "start")!;
  const order: FlowNode[] = [];
  const queue = [start];
  while (queue.length) {
    const n = queue.shift()!;
    if (order.includes(n)) continue;
    order.push(n);
    for (const e of flow.edges.filter((x) => x.source === n.id)) { const t = flow.nodes.find((x) => x.id === e.target); if (t) queue.push(t); }
  }
  const num = (id: string) => order.findIndex((n) => n.id === id) + 1;
  const lines = order.map((n, i) => {
    const outs = flow.edges.filter((e) => e.source === n.id);
    const next = outs.map((e) => e.when.trim() ? `If ${e.when.trim()}, go to step ${num(e.target)}.` : `Then go to step ${num(e.target)}.`).join(" ");
    return `Step ${i + 1}, ${n.title}: ${n.say}${n.type === "end" ? " This ends the conversation." : ""} ${next}`.trim();
  });
  return `Follow this conversation flow, one step at a time, starting at step 1:\n${lines.join("\n")}`;
}

export function effectiveInstructions(cfg: AgentConfig): string {
  const flow = compileFlow(cfg.flow);
  return [cfg.instructions, cfg.speechStyle === "te-en" ? TELUGU_ENGLISH_INSTRUCTIONS : "", flow].filter(Boolean).join("\n\n");
}

export const TELUGU_ENGLISH_INSTRUCTIONS = `Speech style: conversational Telugu-English (Tenglish), like a helpful receptionist in Hyderabad. Start in Telugu-English. Use short, everyday Telugu sentence structure and naturally keep familiar English business words such as demo, callback, booking, appointment, team and platform. Do not translate every English noun into formal Telugu, force a fixed English percentage, or repeat every sentence in both languages.
Write Telugu words in Telugu script and English words in Latin script for speech synthesis. Example: "మీకు demo గురించి తెలుసుకోవాలా, లేక callback request save చేయాలా?" Example: "మీకు ఏ time convenient అండి?" Use అండి sparingly and naturally, not in every sentence. These examples show speaking style, not actions you have performed.
Mirror the caller: if they ask for English, respond fully in English; if they ask for Telugu only, use simple Telugu with English only for names or terms that need it. Recognize Telugu written in Latin letters too. Do not switch TTS language for individual English words in a mixed sentence: use te for the whole Telugu-English turn and en for a fully English turn. Call select_spoken_language only when changing between those turn styles, retaining the same voice. Do not discuss this internal control with callers.
Keep ordinary replies to one or two short sentences (about 30 words), then at most one question. Ask one question at a time. Preserve names, phone numbers, dates and amounts exactly; ask for clarification instead of guessing. Language mixing never changes action permissions: saved, booked, sent or notified must still be backed by a successful tool receipt.`;

export type CallBehavior = {
  maxMinutes: number;
  silenceSeconds: number;
  endPhrases: string;
  voicemail: "hang_up" | "leave_message";
  voicemailMessage: string;
  transferNumber: string;
  afterHoursMessage: string;
  bannedTopics: string;
  announceRecording: boolean;
};

export const DEFAULT_CALL_BEHAVIOR: CallBehavior = {
  maxMinutes: 15,
  silenceSeconds: 20,
  endPhrases: "goodbye, that's all, thank you bye",
  voicemail: "hang_up",
  voicemailMessage: "",
  transferNumber: "",
  afterHoursMessage: "",
  bannedTopics: "",
  announceRecording: true,
};

export const DEFAULT_RUNTIME: RuntimeConfig = {
  mode: "native",
  realtime: { provider: "openai", model: "gpt-realtime" },
  voice: "marin",
};

export const DEFAULT_COMPOSABLE: RuntimeConfig = {
  mode: "composable",
  stt: { provider: "deepgram", model: "nova-3" },
  llm: { provider: "openai", model: "gpt-4.1-mini" },
  tts: { provider: "cartesia", model: "sonic-3.6", voice: "" },
};

export const DEFAULT_CONFIG: AgentConfig = {
  persona: "A clear, capable voice representative for the organization.",
  instructions: "Help callers using approved knowledge and connected tools. Keep replies concise, natural, and easy to follow.",
  greeting: "Greet the caller, introduce the organization, and ask how you can help.",
  language: "English",
  guardrails: "Never invent prices, policies or availability. If unsure, say so and offer a human.",
  handoff: "Offer to take a message for a human when the caller asks or is frustrated.",
  runtime: DEFAULT_RUNTIME,
  callBehavior: DEFAULT_CALL_BEHAVIOR,
};

// Normalizes stored drafts (including pre-runtime ones) into the current shape.
export function normalizeConfig(raw: unknown): AgentConfig {
  const c = (raw ?? {}) as Partial<AgentConfig> & { voice?: string };
  const runtime = c.runtime && (c.runtime.mode === "native" || c.runtime.mode === "composable")
    ? c.runtime
    : { ...DEFAULT_RUNTIME, voice: c.voice ?? "marin" } as RuntimeConfig;
  return { ...DEFAULT_CONFIG, ...c, runtime, callBehavior: { ...DEFAULT_CALL_BEHAVIOR, ...(c.callBehavior ?? {}) } };
}

export function normalizeDraftSnapshot(input: {
  name?: string | null;
  description?: string | null;
  cfg?: unknown;
  kbIds?: Array<string | null | undefined>;
  toolIds?: Array<string | null | undefined>;
}) {
  const cfg = normalizeConfig(input.cfg ?? {});
  const kbIds = [...new Set((input.kbIds ?? []).filter(Boolean).map(String).sort())];
  const toolIds = [...new Set((input.toolIds ?? []).filter(Boolean).map(String).sort())];
  return {
    name: (input.name ?? "").trim(),
    description: (input.description ?? "").trim(),
    cfg,
    kbIds,
    toolIds,
  };
}

export function serializeDraftSnapshot(input: Parameters<typeof normalizeDraftSnapshot>[0]) {
  return JSON.stringify(normalizeDraftSnapshot(input));
}

export async function agentDraftChecksum(input: Parameters<typeof normalizeDraftSnapshot>[0]) {
  return checksum(normalizeDraftSnapshot(input));
}

export async function checksum(config: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(config));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
