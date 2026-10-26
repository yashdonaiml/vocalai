// Signed client for the aviroh control plane (/api/public/runtime/*).
import { createHmac } from "node:crypto";

const BASE = process.env.AVIROH_CONTROL_PLANE_URL?.replace(/\/$/, "")!; // e.g. https://app.example.com
const SECRET = process.env.RUNTIME_SHARED_SECRET!;

async function call<T>(path: string, body: unknown): Promise<T> {
  const raw = JSON.stringify(body);
  const ts = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomUUID();
  const sig = createHmac("sha256", SECRET).update(`${ts}.${nonce}.${raw}`).digest("hex");
  const res = await fetch(`${BASE}/api/public/runtime/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-aviroh-timestamp": ts,
      "x-aviroh-signature": sig,
      "x-aviroh-nonce": nonce,
    },
    body: raw,
    signal: AbortSignal.timeout(20000),
  });
  const json = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `control plane ${path} ${res.status}`);
  return json;
}

export type ModelRef = { provider: string; model: string; language?: string };
export type Bundle = {
  schema: "aviroh.bundle/v1" | "aviroh.bundle/v2";
  purpose?: "setup_preview";
  capabilities?: { version: 1; confirmation: "exact_readback" | "unsupported" };
  call_behavior?: { max_minutes: number; silence_seconds: number };
  prompt: {
    persona: string;
    instructions: string;
    greeting: string;
    language: string;
    speechStyle?: "default" | "te-en";
    guardrails: string;
    handoff: string;
  };
  runtime:
    | { mode: "native"; realtime: ModelRef; voice: string }
    | { mode: "composable"; stt: ModelRef; llm: ModelRef; tts: ModelRef & { voice: string } };
  knowledge: { knowledge_base_ids: string[]; top_k: number };
  tools: (
    | {
        tool_id: string;
        tool_revision_id: string;
        alias: string;
        description: string;
        input_schema: Record<string, unknown>;
        invocation_hash: string;
        requirement: string;
        needs_confirmation: boolean;
      }
    | {
        id: string;
        name: string;
        description: string;
        parameters: Record<string, unknown>;
        timeout_ms?: number;
      }
  )[];
};

export type ToolResult = {
  invocationId: string;
  status: string;
  forModel: string;
  confirmation?: { id: string; summary: string; expiresAt: string; language?: string };
};
export type ConfirmationInput = {
  session_id: string;
  pending_action_id: string;
  turn_id: string;
  transcript: string;
  interrupted: boolean;
  summary_finished_at: number;
  received_at: number;
};
export type OpenSession = {
  session_id: string;
  checksum: string;
  bundle: Bundle;
  credentials: Record<string, string>;
};

export const controlPlane = {
  openSession: (b: {
    session_id?: string;
    phone_number_id?: string;
    caller?: string;
    session_ref?: string;
  }) => call<OpenSession>("session", b),
  retrieve: (session_id: string, query: string) =>
    call<{ results: { content: string; score: number }[] }>("retrieve", { session_id, query }),
  tool: (session_id: string, turn_id: string, alias: string, args: unknown) =>
    call<ToolResult>("tool", {
      session_id,
      turn_id,
      invocation_id: crypto.randomUUID(),
      alias,
      arguments: args,
    }),
  confirm: (input: ConfirmationInput) =>
    call<{ status: string; result?: ToolResult }>("confirm", input),
  cancel: (session_id: string, invocation_id: string) =>
    call<{ status: string }>("cancel", { session_id, invocation_id }),
  events: (session_id: string, batch_id: string, events: unknown[]) =>
    call<{ ok: true }>("events", { session_id, batch_id, events }),
};
