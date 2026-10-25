// MCP adapter (spec 10): Streamable HTTP, tools capability only.
import { EgressError, guardedFetch } from "../egress.server";
import { classifyStatus, type AdapterCredential, type AdapterRequest, type AdapterResult } from "./types";

const PROTOCOLS = ["2025-11-25", "2025-06-18", "2025-03-26"];

type Rpc = { jsonrpc: "2.0"; id?: number; result?: Record<string, unknown>; error?: { code: number; message: string } };

function parseRpc(text: string, contentType: string): Rpc | null {
  if (contentType.includes("text/event-stream")) {
    for (const line of text.split("\n")) {
      if (!line.startsWith("data:")) continue;
      try { const j = JSON.parse(line.slice(5).trim()) as Rpc; if (j.id !== undefined) return j; } catch { /* skip */ }
    }
    return null;
  }
  try { return JSON.parse(text) as Rpc; } catch { return null; }
}

function authHeaders(c: AdapterCredential, h: Headers) {
  if (c?.kind === "bearer") h.set("authorization", `Bearer ${c.secret}`);
  else if (c?.kind === "basic") h.set("authorization", `Basic ${btoa(c.secret)}`);
  else if (c?.kind === "header" && c.headerName) h.set(c.headerName, c.secret);
}

export class McpSession {
  private sessionId: string | null = null;
  private nextId = 1;
  protocol: string | null = null;
  constructor(private url: string, private credential: AdapterCredential, private timeoutMs: number, private maxBytes: number, private signal?: AbortSignal | undefined) {}

  async call(method: string, params: Record<string, unknown>, notify = false) {
    const headers = new Headers({ "content-type": "application/json", accept: "application/json, text/event-stream" });
    authHeaders(this.credential, headers);
    if (this.sessionId) headers.set("mcp-session-id", this.sessionId);
    if (this.protocol) headers.set("mcp-protocol-version", this.protocol);
    const body = JSON.stringify(notify ? { jsonrpc: "2.0", method, params } : { jsonrpc: "2.0", id: this.nextId++, method, params });
    const res = await guardedFetch(this.url, { method: "POST", headers, body, timeoutMs: this.timeoutMs, maxBytes: this.maxBytes, signal: this.signal });
    const sid = res.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;
    return { res, rpc: notify ? null : parseRpc(res.text, res.headers.get("content-type") ?? "") };
  }

  async initialize() {
    const { res, rpc } = await this.call("initialize", { protocolVersion: PROTOCOLS[0], capabilities: {}, clientInfo: { name: "aviroh", version: "1.0" } });
    const code = classifyStatus(res.status);
    if (code) return { ok: false as const, code, status: res.status };
    const version = String(rpc?.result?.["protocolVersion"] ?? "");
    if (!PROTOCOLS.includes(version)) return { ok: false as const, code: "PROTOCOL_UNSUPPORTED" as const, status: res.status };
    this.protocol = version;
    await this.call("notifications/initialized", {}, true).catch(() => null);
    return { ok: true as const, version, capabilities: rpc?.result?.["capabilities"] };
  }
}

export function mcpUrl(origin: string, endpointPath: string | null) {
  return `${origin}${endpointPath && endpointPath.startsWith("/") ? endpointPath : `/${endpointPath ?? "mcp"}`}`;
}

export async function invokeMcp(req: AdapterRequest): Promise<AdapterResult> {
  const host = new URL(req.origin).hostname;
  const toolName = String((req.mapping as { toolName?: string }).toolName ?? "");
  if (!toolName) return { ok: false, code: "TOOL_UNAVAILABLE", message: "Tool is not mapped", host, sent: false };
  const s = new McpSession(mcpUrl(req.origin, req.endpointPath), req.credential, req.timeoutMs, req.maxBytes, req.signal);
  try {
    const init = await s.initialize();
    if (!init.ok) return { ok: false, code: init.code, message: "Could not start a session with the server", statusCode: init.status, host, sent: false };
    const { res, rpc } = await s.call("tools/call", { name: toolName, arguments: req.args });
    const code = classifyStatus(res.status);
    if (code) return { ok: false, code, message: `Server replied with status ${res.status}`, statusCode: res.status, host, sent: true };
    if (!rpc) return { ok: false, code: "RESPONSE_INVALID", message: "Reply could not be read", host, sent: true };
    if (rpc.error) return { ok: false, code: rpc.error.code === -32602 ? "CONTRACT_DRIFT" : "REMOTE_ERROR", message: rpc.error.message.slice(0, 300), host, sent: true };
    const result = rpc.result ?? {};
    const content = (result["content"] as { type: string; text?: string }[] | undefined) ?? [];
    const output = result["structuredContent"] ?? content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
    if (result["isError"]) return { ok: false, code: "REMOTE_ERROR", message: String(output).slice(0, 300), host, sent: true };
    return { ok: true, output, statusCode: res.status, host };
  } catch (e) {
    if (e instanceof EgressError) return { ok: false, code: e.code, message: e.message, host, sent: e.sent };
    return { ok: false, code: "OUTCOME_UNKNOWN", message: "Connection dropped", host, sent: true };
  }
}

export type DiscoveredTool = { name: string; description: string; inputSchema: unknown; annotations: unknown };

export async function discoverMcp(origin: string, endpointPath: string | null, credential: AdapterCredential) {
  const s = new McpSession(mcpUrl(origin, endpointPath), credential, 15000, 2_000_000);
  const init = await s.initialize();
  if (!init.ok) return { ok: false as const, code: init.code };
  const tools: DiscoveredTool[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const { rpc } = await s.call("tools/list", cursor ? { cursor } : {});
    const list = (rpc?.result?.["tools"] as DiscoveredTool[] | undefined) ?? [];
    tools.push(...list);
    cursor = rpc?.result?.["nextCursor"] as string | undefined;
    if (!cursor) break;
  }
  return { ok: true as const, protocol: init.version, tools };
}
