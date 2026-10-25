// HTTPS egress for all customer-controlled destinations. The connection uses the
// exact validated DNS address; TLS still verifies the original hostname.
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";

export class EgressError extends Error {
  constructor(public code: "EGRESS_DENIED" | "TIMEOUT" | "RESPONSE_INVALID", message: string, public sent = false) { super(message); }
}
const BLOCKED_HOSTS = /(^|\.)(localhost|local|internal|lan|home|corp|supabase\.co|lovable\.cloud|lovable\.app)$/i;
function ipv4Blocked(ip: string): boolean {
  if (isIP(ip) !== 4) return true;
  const [a, b, c] = ip.split(".").map(Number) as [number, number, number, number];
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 192 && b === 0) || (a === 192 && b === 88 && c === 99) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113);
}
function ipv6Blocked(ip: string): boolean {
  if (isIP(ip) !== 6 || ip.includes("%")) return true;
  // Global unicast only: excludes all mapped/compatible/NAT64/local forms,
  // including IPv4 addresses written as hexadecimal IPv6 tails.
  const first = parseInt(ip.split(":")[0] || "0", 16);
  if (first < 0x2000 || first > 0x3fff) return true;
  const second = parseInt(ip.split(":")[1] || "0", 16);
  return (first === 0x2001 && second < 0x0200) ||
    (first === 0x2001 && second === 0x0db8) || first === 0x2002 ||
    (first === 0x3fff && second < 0x1000);
}
function destination(rawUrl: string): URL {
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new EgressError("EGRESS_DENIED", "Invalid address"); }
  if (url.protocol !== "https:") throw new EgressError("EGRESS_DENIED", "Only HTTPS is allowed");
  if (url.port && url.port !== "443") throw new EgressError("EGRESS_DENIED", "Only port 443 is allowed");
  if (url.username || url.password) throw new EgressError("EGRESS_DENIED", "Credentials in the address are not allowed");
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host.includes(".") || isIP(host) || BLOCKED_HOSTS.test(host)) throw new EgressError("EGRESS_DENIED", "Destination is not allowed");
  url.hostname = host;
  url.hash = "";
  return url;
}
async function addresses(host: string) {
  let records;
  try { records = await lookup(host, { all: true, verbatim: true }); }
  catch { throw new EgressError("EGRESS_DENIED", "Destination could not be resolved"); }
  if (!records.length || records.some((r) => r.family === 4 ? ipv4Blocked(r.address) : r.family === 6 ? ipv6Blocked(r.address) : true))
    throw new EgressError("EGRESS_DENIED", "Destination does not resolve exclusively to public addresses");
  return records;
}
function deadline<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) { reject(signal.reason); return; }
    signal.addEventListener("abort", abort, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
export async function assertEgressAllowed(rawUrl: string): Promise<URL> {
  const url = destination(rawUrl);
  await deadline(addresses(url.hostname), AbortSignal.timeout(6000));
  return url;
}
export async function guardedFetch(rawUrl: string, init: { method: string; headers: Headers; body?: string | undefined; timeoutMs: number; maxBytes: number; signal?: AbortSignal | undefined }) {
  const url = destination(rawUrl);
  if (!Number.isFinite(init.timeoutMs) || init.timeoutMs <= 0 || !Number.isFinite(init.maxBytes) || init.maxBytes < 0)
    throw new EgressError("EGRESS_DENIED", "Invalid request limits");
  const ctrl = new AbortController();
  let sent = false;
  const timeout = setTimeout(() => ctrl.abort(new EgressError("TIMEOUT", "The destination took too long to reply", sent)), Math.min(init.timeoutMs, 60000));
  const cancelled = () => ctrl.abort(init.signal?.reason ?? new DOMException("Request cancelled", "AbortError"));
  if (init.signal?.aborted) cancelled();
  else init.signal?.addEventListener("abort", cancelled, { once: true });
  try {
    const records = await deadline(addresses(url.hostname), ctrl.signal);
    if (ctrl.signal.aborted) throw ctrl.signal.reason;
    const pinned = records[0]!;
    const headers = Object.fromEntries(init.headers.entries());
    for (const name of Object.keys(headers)) if (/^(host|connection|content-length|transfer-encoding|upgrade|proxy-.*)$/i.test(name)) delete headers[name];
    headers["host"] = url.host;
    headers["accept-encoding"] = "identity";
    return await new Promise<{ status: number; headers: Headers; text: string; host: string }>((resolve, reject) => {
      const req = request(url, {
        method: init.method, headers, agent: false, maxHeaderSize: 16384,
        family: pinned.family,
        // No pool, secondary resolver, proxy, or DNS rebinding window.
        lookup: (_host, _options, callback) => callback(null, pinned.address, pinned.family),
        servername: url.hostname, signal: ctrl.signal,
      }, (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) { res.destroy(); reject(new EgressError("RESPONSE_INVALID", "Redirects are not followed", sent)); return; }
        if (res.headers["content-encoding"] && res.headers["content-encoding"] !== "identity") { res.destroy(); reject(new EgressError("RESPONSE_INVALID", "Compressed responses are not supported", sent)); return; }
        const length = Number(res.headers["content-length"]);
        if (init.method.toUpperCase() !== "HEAD" && Number.isFinite(length) && length > init.maxBytes) { res.destroy(); reject(new EgressError("RESPONSE_INVALID", "Reply was too large", sent)); return; }
        const chunks: Buffer[] = [];
        let total = 0;
        res.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > init.maxBytes) { res.destroy(); reject(new EgressError("RESPONSE_INVALID", "Reply was too large", sent)); }
          else chunks.push(chunk);
        });
        res.on("error", reject);
        res.on("aborted", () => reject(new EgressError("RESPONSE_INVALID", "Reply ended unexpectedly", sent)));
        res.on("end", () => {
          const responseHeaders = new Headers();
          for (let i = 0; i < res.rawHeaders.length; i += 2) responseHeaders.append(res.rawHeaders[i]!, res.rawHeaders[i + 1]!);
          resolve({ status, headers: responseHeaders, text: Buffer.concat(chunks).toString("utf8"), host: url.hostname });
        });
      });
      req.on("error", reject);
      sent = true; // Conservatively treat a handed-off request as potentially sent.
      req.end(init.body);
    });
  } catch (error) {
    if (ctrl.signal.aborted) throw ctrl.signal.reason;
    throw error;
  } finally {
    clearTimeout(timeout);
    init.signal?.removeEventListener("abort", cancelled);
  }
}
