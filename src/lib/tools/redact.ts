// Masking and output shaping shared by the Tool Gateway (spec 14.4, 14.5).
const CARD = /\b(?:\d[ -]?){13,19}\b/g;
const IBAN = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;
const SECRET_KEYS = /^(authorization|cookie|password|passwd|secret|token|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret)$/i;

export function maskString(s: string): string {
  return s.replace(CARD, "[card]").replace(IBAN, "[iban]").replace(SSN, "[ssn]");
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 12) return "[truncated]";
  if (typeof value === "string") return maskString(value);
  if (Array.isArray(value)) return value.slice(0, 200).map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEYS.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

/** Cap a JSON-serialisable value to a byte budget. Returns the value or a truncated string. */
export function capOutput(value: unknown, maxBytes: number): { value: unknown; truncated: boolean } {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? null);
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= maxBytes) return { value, truncated: false };
  const cut = new TextDecoder().decode(bytes.slice(0, Math.max(0, maxBytes - 16)));
  return { value: `${cut}…[truncated]`, truncated: true };
}

export function sanitizeDescription(s: string | null | undefined): string {
  // eslint-disable-next-line no-control-regex
  return (s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 2000);
}

export function wrapForModel(alias: string, value: unknown): string {
  const safeAlias = alias.replace(/[^a-z0-9_]/gi, "_");
  const body = typeof value === "string" ? value : JSON.stringify(value ?? null);
  return `<tool_result tool="${safeAlias}" trusted="false">${body.replace(/<\/tool_result>/gi, "")}</tool_result>`;
}
