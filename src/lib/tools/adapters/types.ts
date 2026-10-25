export type ErrorCode = "EGRESS_DENIED" | "AUTH_INVALID" | "AUTH_FORBIDDEN" | "PROTOCOL_UNSUPPORTED" | "CONTRACT_DRIFT" | "TOOL_UNAVAILABLE"
  | "CONNECTOR_REVOKED" | "CONNECTOR_PAUSED" | "CONFIRM_REQUIRED" | "CONFIRM_INVALID" | "TIMEOUT" | "OUTCOME_UNKNOWN"
  | "SCHEMA_INVALID" | "RATE_LIMITED" | "POLICY_DENIED" | "RESTRICTED" | "REMOTE_ERROR" | "RESPONSE_INVALID";

export type AdapterCredential = { kind: "bearer" | "basic" | "header" | "query"; headerName?: string | null; secret: string } | null;

export type AdapterRequest = {
  origin: string;
  endpointPath: string | null;
  mapping: Record<string, unknown>;
  args: Record<string, unknown>;
  credential: AdapterCredential;
  timeoutMs: number;
  maxBytes: number;
  idempotencyKey?: string | undefined;
  signal?: AbortSignal | undefined;
};

export type AdapterResult =
  | { ok: true; output: unknown; statusCode?: number; host: string }
  | { ok: false; code: ErrorCode; message: string; statusCode?: number; host: string; sent: boolean };

export function classifyStatus(status: number): ErrorCode | null {
  if (status === 401) return "AUTH_INVALID";
  if (status === 403) return "AUTH_FORBIDDEN";
  if (status === 404) return "TOOL_UNAVAILABLE";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 400) return "REMOTE_ERROR";
  return null;
}
