// Provider Tool Schema Compiler (ENG-TOOLS-001 section 11): turns canonical tool definitions into
// each model vendor's function-calling format, and runs one model turn in that format.
import type { AgentTool } from "./readiness.server";

export type Provider = "openai" | "anthropic" | "google";
export type ToolCall = { id: string; name: string; args: Record<string, unknown> };
type Msg = { role: "user" | "assistant"; content: string };

const GOOGLE_DROP = new Set(["$schema", "additionalProperties", "$id", "$ref", "definitions", "$defs", "examples", "default", "pattern", "format"]);
function forGoogle(s: unknown): unknown {
  if (Array.isArray(s)) return s.map(forGoogle);
  if (!s || typeof s !== "object") return s;
  return Object.fromEntries(Object.entries(s).filter(([k]) => !GOOGLE_DROP.has(k)).map(([k, v]) => [k, k === "properties" ? Object.fromEntries(Object.entries(v as object).map(([pk, pv]) => [pk, forGoogle(pv)])) : forGoogle(v)]));
}
function objectSchema(s: unknown) {
  const o = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
  return { type: "object", properties: {}, ...o };
}

export function compileTools(provider: Provider, tools: AgentTool[]) {
  if (!tools.length) return undefined;
  if (provider === "openai") return tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description.slice(0, 1000), parameters: objectSchema(t.schema) } }));
  if (provider === "anthropic") return tools.map((t) => ({ name: t.name, description: t.description.slice(0, 1000), input_schema: objectSchema(t.schema) }));
  return [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description.slice(0, 1000), parameters: forGoogle(objectSchema(t.schema)) })) }];
}

/** A conversation kept in the vendor's native message shape so tool calls and results round-trip. */
export class ModelConversation {
  history: unknown[];
  constructor(private provider: Provider, private model: string, private key: string, private system: string, messages: Msg[], private tools: AgentTool[], private options: { signal?: AbortSignal; maxTokens?: number } = {}) {
    this.history = provider === "google"
      ? messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }))
      : messages.map((m) => ({ role: m.role, content: m.content }));
  }

  private request(url: string, init: RequestInit) {
    return fetch(url, { ...init, signal: this.options.signal ?? AbortSignal.timeout(45_000) });
  }

  async turn(): Promise<{ text: string; calls: ToolCall[] }> {
    const compiled = compileTools(this.provider, this.tools);
    if (this.provider === "openai") {
      const r = await this.request("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${this.key}` }, body: JSON.stringify({ model: this.model, messages: [{ role: "system", content: this.system }, ...this.history], ...(compiled ? { tools: compiled } : {}) }) });
      if (!r.ok) throw new Error(`The model could not answer (${r.status})`);
      const msg = ((await r.json()) as { choices: { message: { content: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[] }).choices[0]?.message;
      if (!msg) return { text: "", calls: [] };
      this.history.push(msg);
      return { text: msg.content ?? "", calls: (msg.tool_calls ?? []).map((c) => ({ id: c.id, name: c.function.name, args: safeParse(c.function.arguments) })) };
    }
    if (this.provider === "anthropic") {
      const r = await this.request("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": this.key, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model: this.model, max_tokens: this.options.maxTokens ?? 800, system: this.system, messages: this.history, ...(compiled ? { tools: compiled } : {}) }) });
      if (!r.ok) throw new Error(`The model could not answer (${r.status})`);
      const content = ((await r.json()) as { content: ({ type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> })[] }).content;
      this.history.push({ role: "assistant", content });
      return { text: content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join(""), calls: content.flatMap((c) => (c.type === "tool_use" ? [{ id: c.id, name: c.name, args: c.input ?? {} }] : [])) };
    }
    const r = await this.request(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": this.key }, body: JSON.stringify({ systemInstruction: { parts: [{ text: this.system }] }, contents: this.history, ...(compiled ? { tools: compiled } : {}) }) });
    if (!r.ok) throw new Error(`The model could not answer (${r.status})`);
    const parts = ((await r.json()) as { candidates: { content: { parts: ({ text?: string; functionCall?: { name: string; args?: Record<string, unknown> } })[] } }[] }).candidates[0]?.content.parts ?? [];
    this.history.push({ role: "model", parts });
    return { text: parts.map((p) => p.text ?? "").join(""), calls: parts.flatMap((p, i) => (p.functionCall ? [{ id: `g${i}`, name: p.functionCall.name, args: p.functionCall.args ?? {} }] : [])) };
  }

  addResults(results: { call: ToolCall; content: string }[]) {
    if (this.provider === "openai") for (const r of results) this.history.push({ role: "tool", tool_call_id: r.call.id, content: r.content });
    else if (this.provider === "anthropic") this.history.push({ role: "user", content: results.map((r) => ({ type: "tool_result", tool_use_id: r.call.id, content: r.content })) });
    else this.history.push({ role: "user", parts: results.map((r) => ({ functionResponse: { name: r.call.name, response: { content: r.content } } })) });
  }
}

function safeParse(s: string): Record<string, unknown> {
  try { const v = JSON.parse(s); return v && typeof v === "object" ? v : {}; } catch { return {}; }
}
