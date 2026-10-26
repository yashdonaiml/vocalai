import test from "node:test";
import assert from "node:assert/strict";
import { checkStagingEnvironment } from "../scripts/staging-preflight.mjs";

const valid = {
  DEPLOYMENT_ENVIRONMENT: "staging",
  STAGING_SUPABASE_PROJECT_ID: "abcdefghijklmnopqrst",
  SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  VITE_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "publishable",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  VITE_SUPABASE_PUBLISHABLE_KEY: "publishable",
  STAGING_CONSOLE_URL: "https://staging.example.com",
  STAGING_RUNTIME_CONTROL_PLANE_URL: "https://staging.example.com",
  LIVEKIT_URL: "wss://staging.livekit.cloud",
  STAGING_RUNTIME_LIVEKIT_URL: "wss://staging.livekit.cloud",
  LIVEKIT_API_KEY: "key",
  LIVEKIT_API_SECRET: "secret",
  STAGING_RUNTIME_LIVEKIT_API_KEY: "key",
  STAGING_RUNTIME_LIVEKIT_API_SECRET: "secret",
  RUNTIME_SHARED_SECRET: "a".repeat(32),
  STAGING_RUNTIME_SHARED_SECRET: "a".repeat(32),
  OPENAI_API_KEY: "llm",
  DEEPGRAM_API_KEY: "stt",
  CARTESIA_API_KEY: "tts",
  GOOGLE_OAUTH_CLIENT_ID: "client.apps.googleusercontent.com",
  GOOGLE_OAUTH_CLIENT_SECRET: "oauth-secret",
  GOOGLE_OAUTH_REDIRECT_URI: "https://staging.example.com/api/public/oauth/google/callback",
};

test("staging preflight accepts one explicit consistent target", () => {
  assert.deepEqual(checkStagingEnvironment(valid), {
    environment: "staging",
    supabaseProject: "abcdefghijklmnopqrst",
    consoleOrigin: "https://staging.example.com",
    liveKitOrigin: "wss://staging.livekit.cloud",
  });
});

test("staging preflight rejects production ambiguity, project drift, localhost, and worker drift", () => {
  assert.throws(
    () => checkStagingEnvironment({ ...valid, DEPLOYMENT_ENVIRONMENT: "production" }),
    /exactly staging/,
  );
  assert.throws(
    () =>
      checkStagingEnvironment({
        ...valid,
        SUPABASE_URL: "https://zzzzzzzzzzzzzzzzzzzz.supabase.co",
      }),
    /does not match/,
  );
  assert.throws(
    () => checkStagingEnvironment({ ...valid, STAGING_CONSOLE_URL: "http://127.0.0.1:3000" }),
    /non-local HTTPS/,
  );
  assert.throws(
    () => checkStagingEnvironment({ ...valid, STAGING_RUNTIME_SHARED_SECRET: "b".repeat(32) }),
    /shared secrets/,
  );
  assert.throws(
    () =>
      checkStagingEnvironment({
        ...valid,
        STAGING_RUNTIME_LIVEKIT_URL: "wss://other.livekit.cloud",
      }),
    /does not match/,
  );
  assert.throws(
    () =>
      checkStagingEnvironment({
        ...valid,
        GOOGLE_OAUTH_REDIRECT_URI: "https://other.example.com/callback",
      }),
    /staging console callback/,
  );
});

test("staging preflight requires the preview speech providers", () => {
  const withoutTts = { ...valid };
  delete withoutTts.CARTESIA_API_KEY;
  assert.throws(() => checkStagingEnvironment(withoutTts), /Deepgram and Cartesia/);
});
