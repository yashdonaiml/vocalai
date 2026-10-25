// HTTP / webhook adapter (spec 9). Host, port and credentials come from the connector only.
import { EgressError, guardedFetch } from "../egress.server";
import { classifyStatus, type AdapterRequest, type AdapterResult } from "./types";

const BLOCKED_HEADER = /^(host|authorization|cookie|proxy-.*|forwarded|x-forwarded-.*|traceparent|x-aviroh-.*|connection|keep-alive|te|trailer|transfer-encoding|upgrade|content-length)$/i;
const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

function select(value: unknown, path?: string): unknown {
  if (!path) return value;
  return path.split(".").reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined), value);
}

export async function invokeHttp(req: AdapterRequest, opts: { form?: boolean } = {}): Promise<AdapterResult> {
  const m = req.mapping as { method?: string; path?: string; params?: Record<string, "path" | "query" | "header" | "body">; select?: string };
  const method = (m.method ?? "POST").toUpperCase();
  const host = new URL(req.origin).hostname;
  if (!METHODS.has(method)) return { ok: false, code: "PROTOCOL_UNSUPPORTED", message: "Unsupported method", host, sent: false };

  let path = m.path ?? req.endpointPath ?? "/";
  const query = new URLSearchParams();
  const headers = new Headers({ accept: "application/json" });
  const body: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(req.args)) {
    const loc = m.params?.[name] ?? (method === "GET" || method === "DELETE" ? "query" : "body");
    if (loc === "path") path = path.replace(`{${name}}`, encodeURIComponent(String(value)));
    else if (loc === "query") query.set(name, String(value));
    else if (loc === "header") { if (BLOCKED_HEADER.test(name)) return { ok: false, code: "SCHEMA_INVALID", message: `Header ${name} cannot be set`, host, sent: false }; headers.set(name, String(value)); }
    else body[name] = value;
  }
  if (/\{[^}]+\}/.test(path)) return { ok: false, code: "SCHEMA_INVALID", message: "Missing path value", host, sent: false };

  const c = req.credential;
  if (c?.kind === "bearer") headers.set("authorization", `Bearer ${c.secret}`);
  else if (c?.kind === "basic") headers.set("authorization", `Basic ${btoa(c.secret)}`);
  else if (c?.kind === "header" && c.headerName && !BLOCKED_HEADER.test(c.headerName)) headers.set(c.headerName, c.secret);
  else if (c?.kind === "query") query.set(c.headerName || "api_key", c.secret);
  if (req.idempotencyKey && method !== "GET") headers.set("Idempotency-Key", req.idempotencyKey);

  let payload: string | undefined;
  if (method !== "GET" && method !== "DELETE") {
    if (opts.form) { headers.set("content-type", "application/x-www-form-urlencoded"); payload = new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v)])).toString(); }
    else { headers.set("content-type", "application/json"); payload = JSON.stringify(body); }
  }
  const qs = query.toString();
  const url = `${req.origin}${path.startsWith("/") ? path : `/${path}`}${qs ? `?${qs}` : ""}`;
  try {
    const res = await guardedFetch(url, { method, headers, body: payload, timeoutMs: req.timeoutMs, maxBytes: req.maxBytes, signal: req.signal });
    const code = classifyStatus(res.status);
    if (code) return { ok: false, code, message: `Tool replied with status ${res.status}`, statusCode: res.status, host: res.host, sent: true };
    let parsed: unknown = res.text;
    if ((res.headers.get("content-type") ?? "").includes("json")) {
      try { parsed = JSON.parse(res.text); } catch { return { ok: false, code: "RESPONSE_INVALID", message: "Reply was not valid JSON", statusCode: res.status, host: res.host, sent: true }; }
    }
    return { ok: true, output: select(parsed, m.select), statusCode: res.status, host: res.host };
  } catch (e) {
    if (e instanceof EgressError) return { ok: false, code: e.code, message: e.message, host, sent: e.sent };
    return { ok: false, code: "OUTCOME_UNKNOWN", message: "Connection dropped", host, sent: true };
  }
}
