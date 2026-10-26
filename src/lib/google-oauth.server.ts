import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret, encryptSecret } from "./crypto.server";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE = "https://oauth2.googleapis.com/revoke";
const GOOGLE_USERINFO = "https://openidconnect.googleapis.com/v1/userinfo";

// Server-side resource discovery avoids exposing an OAuth access token to the
// browser. Google classifies Drive metadata scope as restricted; public launch
// therefore requires Google's applicable verification/security review.
export const GOOGLE_SHEETS_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "https://www.googleapis.com/auth/spreadsheets",
] as const;

export type GoogleConnectionSummary = {
  connected: boolean;
  status: "active" | "reconnect_needed" | "disconnected" | "not_connected";
  accountEmail: string | null;
  scopes: string[];
  connectedAt: string | null;
  errorCode: string | null;
};

export type GoogleAccess = {
  accessToken: string;
  connectionId: string;
  accountEmail: string;
  expiresAt: string;
};

export type GoogleConnectionErrorCode =
  "reconnect_needed" | "temporarily_unavailable" | "not_connected";

export class GoogleConnectionError extends Error {
  constructor(
    public readonly code: GoogleConnectionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GoogleConnectionError";
  }
}

type ConnectionRow = {
  id: string;
  workspace_id: string;
  account_email: string;
  granted_scopes: string[];
  access_token_ciphertext: string | null;
  refresh_token_ciphertext: string | null;
  access_token_expires_at: string | null;
  refresh_token_expires_at: string | null;
  status: "active" | "reconnect_needed" | "disconnected";
  error_code: string | null;
  connected_at: string;
};

async function database() {
  return (await import("@/integrations/supabase/client.server"))
    .supabaseAdmin as unknown as SupabaseClient;
}

async function requireAdmin(db: SupabaseClient, workspaceId: string, actorId: string) {
  const { data, error } = await db.rpc("release_actor_is_admin", {
    _workspace: workspaceId,
    _actor: actorId,
  });
  if (error || !data) throw new Error("Workspace admin access is required to connect Google.");
  const { data: workspace, error: workspaceError } = await db
    .from("workspaces")
    .select("id,org_id")
    .eq("id", workspaceId)
    .single();
  if (workspaceError || !workspace) throw new Error("Workspace not found.");
  return workspace as { id: string; org_id: string };
}

export async function requireGoogleWorkspaceAdmin(workspaceId: string, actorId: string) {
  const db = await database();
  await requireAdmin(db, workspaceId, actorId);
}

function oauthConfig() {
  const clientId = process.env["GOOGLE_OAUTH_CLIENT_ID"]?.trim();
  const clientSecret = process.env["GOOGLE_OAUTH_CLIENT_SECRET"]?.trim();
  const redirectUri = process.env["GOOGLE_OAUTH_REDIRECT_URI"]?.trim();
  if (!clientId || !clientSecret || !redirectUri)
    throw new Error("Google Sheets connection is not configured by the platform operator.");
  let redirect: URL;
  try {
    redirect = new URL(redirectUri);
  } catch {
    throw new Error("Google OAuth redirect configuration is invalid.");
  }
  const local = ["localhost", "127.0.0.1"].includes(redirect.hostname);
  if (
    (redirect.protocol !== "https:" && !(local && redirect.protocol === "http:")) ||
    redirect.search ||
    redirect.hash
  )
    throw new Error("Google OAuth redirect must be an HTTPS URL (localhost may use HTTP). ");
  return { clientId, clientSecret, redirectUri: redirect.toString() };
}

function safeReturnTo(value: string) {
  if (
    !/^\/assistant-setup\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new Error("Invalid Google connection return path.");
  return value;
}

function randomUrlSafe(bytes = 32) {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString("base64url");
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Buffer.from(new Uint8Array(digest)).toString("hex");
}

async function pkceChallenge(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return Buffer.from(new Uint8Array(digest)).toString("base64url");
}

async function jsonRequest(url: string, init: RequestInit) {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(12_000) });
  } catch {
    throw new GoogleConnectionError(
      "temporarily_unavailable",
      "Google could not be reached. Try again.",
    );
  }
  const text = (await response.text()).slice(0, 32_000);
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* safe empty body */
  }
  return { response, body };
}

export async function beginGoogleSheetsOAuth(
  workspaceId: string,
  actorId: string,
  returnTo: string,
) {
  const db = await database();
  await requireAdmin(db, workspaceId, actorId);
  const config = oauthConfig();
  const state = randomUrlSafe();
  const verifier = randomUrlSafe(64);
  const { error } = await db.from("google_oauth_states").insert({
    state_hash: await sha256Hex(state),
    workspace_id: workspaceId,
    actor_id: actorId,
    pkce_verifier_ciphertext: await encryptSecret(verifier),
    return_to: safeReturnTo(returnTo),
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (error) throw new Error("Could not start Google authorization. Try again.");
  const url = new URL(GOOGLE_AUTH);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: GOOGLE_SHEETS_SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: "S256",
  }).toString();
  return { authorizationUrl: url.toString() };
}

async function consumeState(state: string) {
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(state))
    throw new Error("Google authorization state is invalid.");
  const db = await database();
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("google_oauth_states")
    .update({ consumed_at: now })
    .eq("state_hash", await sha256Hex(state))
    .is("consumed_at", null)
    .gt("expires_at", now)
    .select("workspace_id,actor_id,pkce_verifier_ciphertext,return_to")
    .maybeSingle();
  if (error || !data)
    throw new Error("Google authorization expired or was already used. Start again.");
  return {
    db,
    state: data as {
      workspace_id: string;
      actor_id: string;
      pkce_verifier_ciphertext: string;
      return_to: string;
    },
  };
}

export async function completeGoogleSheetsOAuth(code: string, stateToken: string) {
  if (!code || code.length > 4096)
    throw new Error("Google did not return a valid authorization code.");
  const { db, state } = await consumeState(stateToken);
  const workspace = await requireAdmin(db, state.workspace_id, state.actor_id);
  const config = oauthConfig();
  const verifier = await decryptSecret(state.pkce_verifier_ciphertext);
  const token = await jsonRequest(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });
  const accessToken =
    typeof token.body["access_token"] === "string" ? token.body["access_token"] : "";
  const refreshToken =
    typeof token.body["refresh_token"] === "string" ? token.body["refresh_token"] : "";
  if (!token.response.ok || !accessToken || !refreshToken)
    throw new Error("Google authorization could not be completed. Start the connection again.");
  const granted = new Set(
    String(token.body["scope"] ?? "")
      .split(/\s+/)
      .filter(Boolean),
  );
  if (!GOOGLE_SHEETS_SCOPES.every((scope) => granted.has(scope))) {
    await fetch(GOOGLE_REVOKE, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken }),
      signal: AbortSignal.timeout(8_000),
    }).catch(() => undefined);
    throw new Error("Google did not grant the permissions required to save enquiries.");
  }
  const user = await jsonRequest(GOOGLE_USERINFO, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const subject = typeof user.body["sub"] === "string" ? user.body["sub"] : "";
  const email = typeof user.body["email"] === "string" ? user.body["email"] : "";
  if (!user.response.ok || !subject || !email || user.body["email_verified"] !== true)
    throw new Error("Google account identity could not be verified.");
  const expiresIn = Number(token.body["expires_in"]);
  const refreshExpiresIn = Number(token.body["refresh_token_expires_in"]);
  const row = {
    id: crypto.randomUUID(),
    org_id: workspace.org_id,
    workspace_id: state.workspace_id,
    account_subject: subject,
    account_email: email,
    granted_scopes: [...granted],
    access_token_ciphertext: await encryptSecret(accessToken),
    refresh_token_ciphertext: await encryptSecret(refreshToken),
    access_token_expires_at: new Date(
      Date.now() + (Number.isFinite(expiresIn) ? expiresIn : 3600) * 1000,
    ).toISOString(),
    refresh_token_expires_at: Number.isFinite(refreshExpiresIn)
      ? new Date(Date.now() + refreshExpiresIn * 1000).toISOString()
      : null,
    status: "active",
    error_code: null,
    connected_by: state.actor_id,
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    disconnected_at: null,
  };
  const { error } = await db.from("google_connections").upsert(row, { onConflict: "workspace_id" });
  if (error) throw new Error("Google was authorized, but the connection could not be saved.");
  return { returnTo: safeReturnTo(state.return_to), accountEmail: email };
}

export async function cancelGoogleSheetsOAuth(stateToken: string) {
  const { state } = await consumeState(stateToken);
  return { returnTo: safeReturnTo(state.return_to) };
}

export async function getGoogleConnectionStatus(
  workspaceId: string,
  actorId: string,
): Promise<GoogleConnectionSummary> {
  const db = await database();
  await requireAdmin(db, workspaceId, actorId);
  const { data, error } = await db
    .from("google_connections")
    .select("status,account_email,granted_scopes,connected_at,error_code")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw new Error("Could not load Google connection status.");
  if (!data)
    return {
      connected: false,
      status: "not_connected",
      accountEmail: null,
      scopes: [],
      connectedAt: null,
      errorCode: null,
    };
  const row = data as Pick<
    ConnectionRow,
    "status" | "account_email" | "granted_scopes" | "connected_at" | "error_code"
  >;
  return {
    connected: row.status === "active",
    status: row.status,
    accountEmail: row.account_email,
    scopes: row.granted_scopes,
    connectedAt: row.connected_at,
    errorCode: row.error_code,
  };
}

async function connection(workspaceId: string) {
  const db = await database();
  const { data, error } = await db
    .from("google_connections")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error)
    throw new GoogleConnectionError(
      "temporarily_unavailable",
      "Google connection could not be loaded.",
    );
  return { db, row: data as ConnectionRow | null };
}

// API adapters must pin the connection ID they used. A late 401 from a replaced
// grant must never revoke the workspace's newly connected account.
export async function markGoogleConnectionReconnectNeeded(
  workspaceId: string,
  connectionId: string,
  errorCode = "api_unauthorized",
) {
  const { db, row } = await connection(workspaceId);
  if (!row || row.id !== connectionId) return { changed: false };
  const { error } = await db
    .from("google_connections")
    .update({
      status: "reconnect_needed",
      error_code: errorCode,
      access_token_ciphertext: null,
      access_token_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connectionId)
    .eq("workspace_id", workspaceId)
    .eq("status", "active");
  if (error)
    throw new GoogleConnectionError(
      "temporarily_unavailable",
      "Google connection state could not be updated.",
    );
  return { changed: true };
}

export async function getGoogleAccessToken(workspaceId: string): Promise<GoogleAccess> {
  const { db, row } = await connection(workspaceId);
  if (!row || row.status === "disconnected")
    throw new GoogleConnectionError(
      "not_connected",
      "Connect Google before choosing a spreadsheet.",
    );
  if (row.status !== "active" || !row.refresh_token_ciphertext)
    throw new GoogleConnectionError(
      "reconnect_needed",
      "Reconnect Google to continue saving enquiries.",
    );
  if (
    row.refresh_token_expires_at &&
    new Date(row.refresh_token_expires_at).getTime() <= Date.now()
  ) {
    await markGoogleConnectionReconnectNeeded(workspaceId, row.id, "refresh_expired");
    throw new GoogleConnectionError(
      "reconnect_needed",
      "Google access expired. Reconnect to continue.",
    );
  }
  if (
    row.access_token_ciphertext &&
    row.access_token_expires_at &&
    new Date(row.access_token_expires_at).getTime() > Date.now() + 60_000
  )
    return {
      accessToken: await decryptSecret(row.access_token_ciphertext),
      connectionId: row.id,
      accountEmail: row.account_email,
      expiresAt: row.access_token_expires_at,
    };
  const config = oauthConfig();
  const refreshed = await jsonRequest(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: await decryptSecret(row.refresh_token_ciphertext),
      grant_type: "refresh_token",
    }),
  });
  const providerError = typeof refreshed.body["error"] === "string" ? refreshed.body["error"] : "";
  if (!refreshed.response.ok || typeof refreshed.body["access_token"] !== "string") {
    if (providerError === "invalid_grant") {
      await markGoogleConnectionReconnectNeeded(workspaceId, row.id, "invalid_grant");
      throw new GoogleConnectionError(
        "reconnect_needed",
        "Google access was revoked or expired. Reconnect to continue.",
      );
    }
    throw new GoogleConnectionError(
      "temporarily_unavailable",
      "Google is temporarily unavailable. Try again.",
    );
  }
  const expiresIn = Number(refreshed.body["expires_in"]);
  const expiresAt = new Date(
    Date.now() + (Number.isFinite(expiresIn) ? expiresIn : 3600) * 1000,
  ).toISOString();
  const encrypted = await encryptSecret(refreshed.body["access_token"]);
  const { data: saved, error } = await db
    .from("google_connections")
    .update({
      access_token_ciphertext: encrypted,
      access_token_expires_at: expiresAt,
      error_code: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .select("id")
    .maybeSingle();
  if (error || !saved)
    throw new GoogleConnectionError(
      "temporarily_unavailable",
      "The Google connection changed while access was refreshing. Try again.",
    );
  return {
    accessToken: refreshed.body["access_token"],
    connectionId: row.id,
    accountEmail: row.account_email,
    expiresAt,
  };
}

export async function disconnectGoogle(workspaceId: string, actorId: string) {
  const db = await database();
  await requireAdmin(db, workspaceId, actorId);
  const { data } = await db
    .from("google_connections")
    .select("id,refresh_token_ciphertext")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!data) return { disconnected: true };
  if (data.refresh_token_ciphertext) {
    const token = await decryptSecret(data.refresh_token_ciphertext);
    await fetch(GOOGLE_REVOKE, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(8_000),
    }).catch(() => undefined);
  }
  const { error } = await db
    .from("google_connections")
    .update({
      status: "disconnected",
      access_token_ciphertext: null,
      refresh_token_ciphertext: null,
      access_token_expires_at: null,
      refresh_token_expires_at: null,
      error_code: null,
      disconnected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", data.id)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error("Google connection could not be disconnected.");
  return { disconnected: true };
}
