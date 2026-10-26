import { pathToFileURL } from "node:url";

function required(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function projectRef(value, name) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid HTTPS Supabase URL`);
  }
  const match = /^([a-z0-9]{20})\.supabase\.co$/i.exec(url.hostname);
  if (url.protocol !== "https:" || url.pathname !== "/" || !match)
    throw new Error(`${name} must be an HTTPS project root on supabase.co`);
  return match[1].toLowerCase();
}

function secureOrigin(value, name) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid HTTPS origin`);
  }
  if (
    url.protocol !== "https:" ||
    url.pathname !== "/" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname)
  ) {
    throw new Error(
      `${name} must be a non-local HTTPS origin without a path, query, or credentials`,
    );
  }
  return url.origin;
}

function liveKitOrigin(value, name) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid secure WebSocket URL`);
  }
  if (url.protocol !== "wss:" || url.pathname !== "/" || !url.hostname)
    throw new Error(`${name} must be a wss:// origin without a path`);
  return url.origin;
}

export function checkStagingEnvironment(env = process.env) {
  if (required(env, "DEPLOYMENT_ENVIRONMENT") !== "staging")
    throw new Error("DEPLOYMENT_ENVIRONMENT must be exactly staging");

  const expectedProject = required(env, "STAGING_SUPABASE_PROJECT_ID").toLowerCase();
  if (!/^[a-z0-9]{20}$/.test(expectedProject))
    throw new Error("STAGING_SUPABASE_PROJECT_ID must be a 20-character Supabase project ref");
  for (const name of ["SUPABASE_URL", "VITE_SUPABASE_URL"]) {
    if (projectRef(required(env, name), name) !== expectedProject)
      throw new Error(`${name} does not match STAGING_SUPABASE_PROJECT_ID`);
  }

  const consoleOrigin = secureOrigin(required(env, "STAGING_CONSOLE_URL"), "STAGING_CONSOLE_URL");
  const workerOrigin = secureOrigin(
    required(env, "STAGING_RUNTIME_CONTROL_PLANE_URL"),
    "STAGING_RUNTIME_CONTROL_PLANE_URL",
  );
  if (consoleOrigin !== workerOrigin)
    throw new Error("STAGING_RUNTIME_CONTROL_PLANE_URL does not match STAGING_CONSOLE_URL");
  required(env, "GOOGLE_OAUTH_CLIENT_ID");
  required(env, "GOOGLE_OAUTH_CLIENT_SECRET");
  const oauthRedirect = required(env, "GOOGLE_OAUTH_REDIRECT_URI");
  if (oauthRedirect !== `${consoleOrigin}/api/public/oauth/google/callback`)
    throw new Error("GOOGLE_OAUTH_REDIRECT_URI must use the staging console callback URL");

  const consoleLiveKit = liveKitOrigin(required(env, "LIVEKIT_URL"), "LIVEKIT_URL");
  const workerLiveKit = liveKitOrigin(
    required(env, "STAGING_RUNTIME_LIVEKIT_URL"),
    "STAGING_RUNTIME_LIVEKIT_URL",
  );
  if (consoleLiveKit !== workerLiveKit)
    throw new Error("STAGING_RUNTIME_LIVEKIT_URL does not match LIVEKIT_URL");

  const shared = required(env, "RUNTIME_SHARED_SECRET");
  const workerShared = required(env, "STAGING_RUNTIME_SHARED_SECRET");
  if (shared.length < 32 || workerShared.length < 32 || shared !== workerShared)
    throw new Error(
      "console and runtime shared secrets must match and contain at least 32 characters",
    );

  for (const name of [
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "LIVEKIT_API_KEY",
    "LIVEKIT_API_SECRET",
    "STAGING_RUNTIME_LIVEKIT_API_KEY",
    "STAGING_RUNTIME_LIVEKIT_API_SECRET",
  ])
    required(env, name);
  if (env.SUPABASE_PUBLISHABLE_KEY !== env.VITE_SUPABASE_PUBLISHABLE_KEY)
    throw new Error("server and browser Supabase publishable keys do not match");
  if (env.LIVEKIT_API_KEY !== env.STAGING_RUNTIME_LIVEKIT_API_KEY)
    throw new Error("console and runtime LiveKit API keys do not match");
  if (env.LIVEKIT_API_SECRET !== env.STAGING_RUNTIME_LIVEKIT_API_SECRET)
    throw new Error("console and runtime LiveKit API secrets do not match");

  if (!env.OPENAI_API_KEY && !env.ANTHROPIC_API_KEY && !env.GOOGLE_API_KEY)
    throw new Error("staging needs at least one configured LLM provider key");
  if (!env.DEEPGRAM_API_KEY || !env.CARTESIA_API_KEY)
    throw new Error("the enquiry preview requires configured Deepgram and Cartesia keys");

  return {
    environment: "staging",
    supabaseProject: expectedProject,
    consoleOrigin,
    liveKitOrigin: consoleLiveKit,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = checkStagingEnvironment();
    console.log(
      `Staging preflight passed for Supabase ${result.supabaseProject}, ${result.consoleOrigin}, and ${result.liveKitOrigin}.`,
    );
  } catch (error) {
    console.error(
      `Staging preflight failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
