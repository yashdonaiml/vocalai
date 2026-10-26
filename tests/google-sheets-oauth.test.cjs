const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");
const { loader, database } = require("./helpers.cjs");
const serverFn = {
  createServerFn: () => {
    let validate = (value) => value;
    const chain = {
      middleware: () => chain,
      validator: (fn) => {
        validate = fn;
        return chain;
      },
      handler: (fn) => (args) => fn({ ...args, data: validate(args.data) }),
    };
    return chain;
  },
};

function withGoogleEnv(fn) {
  const previous = Object.fromEntries(
    ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_OAUTH_REDIRECT_URI"].map(
      (key) => [key, process.env[key]],
    ),
  );
  Object.assign(process.env, {
    GOOGLE_OAUTH_CLIENT_ID: "client.apps.googleusercontent.com",
    GOOGLE_OAUTH_CLIENT_SECRET: "server-secret",
    GOOGLE_OAUTH_REDIRECT_URI: "https://staging.example.com/api/public/oauth/google/callback",
  });
  return Promise.resolve(fn()).finally(() => {
    for (const [key, value] of Object.entries(previous))
      value === undefined ? delete process.env[key] : (process.env[key] = value);
  });
}

test("Google OAuth start is admin-scoped, one-time-state based, PKCE protected, and never stores raw browser state", async () => {
  const workspaceId = crypto.randomUUID();
  const actorId = crypto.randomUUID();
  const orgId = crypto.randomUUID();
  const tables = { workspaces: [{ id: workspaceId, org_id: orgId }], google_oauth_states: [] };
  const db = database(tables);
  db.rpc = async (name, args) => ({
    data:
      name === "release_actor_is_admin" &&
      args._workspace === workspaceId &&
      args._actor === actorId,
    error: null,
  });
  const api = loader({
    "@/integrations/supabase/client.server": { supabaseAdmin: db },
    "./crypto.server": {
      encryptSecret: async (value) => `encrypted:${value}`,
      decryptSecret: async (value) => value.slice(10),
    },
  })("src/lib/google-oauth.server.ts");
  await withGoogleEnv(async () => {
    const result = await api.beginGoogleSheetsOAuth(
      workspaceId,
      actorId,
      `/assistant-setup/${crypto.randomUUID()}`,
    );
    const url = new URL(result.authorizationUrl);
    assert.equal(url.hostname, "accounts.google.com");
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    assert.equal(url.searchParams.get("access_type"), "offline");
    assert.match(url.searchParams.get("scope"), /spreadsheets/);
    const saved = tables.google_oauth_states[0];
    assert.match(saved.state_hash, /^[0-9a-f]{64}$/);
    assert.notEqual(saved.state_hash, url.searchParams.get("state"));
    assert.match(saved.pkce_verifier_ciphertext, /^encrypted:/);
    assert.equal(JSON.stringify(saved).includes("server-secret"), false);
  });
});

test("definitive invalid_grant marks only that workspace connection reconnect-needed", async () => {
  const workspaceId = crypto.randomUUID();
  const otherWorkspace = crypto.randomUUID();
  const rows = [workspaceId, otherWorkspace].map((workspace_id) => ({
    id: crypto.randomUUID(),
    workspace_id,
    account_email: "owner@example.com",
    granted_scopes: [],
    access_token_ciphertext: null,
    refresh_token_ciphertext: "encrypted:refresh",
    access_token_expires_at: null,
    status: "active",
    error_code: null,
    connected_at: new Date().toISOString(),
  }));
  const db = database({ google_connections: rows });
  const oldFetch = global.fetch;
  global.fetch = async () =>
    new Response(JSON.stringify({ error: "invalid_grant" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  const api = loader({
    "@/integrations/supabase/client.server": { supabaseAdmin: db },
    "./crypto.server": {
      encryptSecret: async (v) => `encrypted:${v}`,
      decryptSecret: async (v) => v.slice(10),
    },
  })("src/lib/google-oauth.server.ts");
  try {
    await withGoogleEnv(() =>
      assert.rejects(
        api.getGoogleAccessToken(workspaceId),
        (error) => error.code === "reconnect_needed",
      ),
    );
    assert.equal(rows[0].status, "reconnect_needed");
    assert.equal(rows[0].access_token_ciphertext, null);
    assert.equal(rows[1].status, "active");
  } finally {
    global.fetch = oldFetch;
  }
});

test("a late provider 401 cannot revoke a replacement Google connection", async () => {
  const workspaceId = crypto.randomUUID();
  const current = {
    id: crypto.randomUUID(),
    workspace_id: workspaceId,
    account_email: "new@example.com",
    granted_scopes: [],
    access_token_ciphertext: "encrypted:new",
    refresh_token_ciphertext: "encrypted:refresh",
    access_token_expires_at: new Date(Date.now() + 3600000).toISOString(),
    status: "active",
    error_code: null,
    connected_at: new Date().toISOString(),
  };
  const db = database({ google_connections: [current] });
  const api = loader({
    "@/integrations/supabase/client.server": { supabaseAdmin: db },
    "./crypto.server": {
      encryptSecret: async (v) => `encrypted:${v}`,
      decryptSecret: async (v) => v.slice(10),
    },
  })("src/lib/google-oauth.server.ts");
  const result = await api.markGoogleConnectionReconnectNeeded(workspaceId, crypto.randomUUID());
  assert.deepEqual(result, { changed: false });
  assert.equal(current.status, "active");
});

test("an invalid_grant arriving after reconnect cannot mark the replacement grant", async () => {
  const workspaceId = crypto.randomUUID();
  const old = {
    id: crypto.randomUUID(),
    workspace_id: workspaceId,
    account_email: "old@example.com",
    granted_scopes: [],
    access_token_ciphertext: null,
    refresh_token_ciphertext: "encrypted:old-refresh",
    access_token_expires_at: null,
    refresh_token_expires_at: null,
    status: "active",
    error_code: null,
    connected_at: new Date().toISOString(),
  };
  const tables = { google_connections: [old] };
  const db = database(tables);
  const replacementId = crypto.randomUUID();
  const oldFetch = global.fetch;
  global.fetch = async () => {
    tables.google_connections[0] = {
      ...old,
      id: replacementId,
      account_email: "new@example.com",
      refresh_token_ciphertext: "encrypted:new-refresh",
    };
    return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
  };
  const api = loader({
    "@/integrations/supabase/client.server": { supabaseAdmin: db },
    "./crypto.server": {
      encryptSecret: async (v) => `encrypted:${v}`,
      decryptSecret: async (v) => v.slice(10),
    },
  })("src/lib/google-oauth.server.ts");
  try {
    await withGoogleEnv(() =>
      assert.rejects(
        api.getGoogleAccessToken(workspaceId),
        (error) => error.code === "reconnect_needed",
      ),
    );
    assert.equal(tables.google_connections[0].id, replacementId);
    assert.equal(tables.google_connections[0].status, "active");
  } finally {
    global.fetch = oldFetch;
  }
});

test("Google credential tables are service-only with RLS enabled", async () => {
  const db = new PGlite();
  const org = crypto.randomUUID(),
    workspace = crypto.randomUUID(),
    actor = crypto.randomUUID();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
      create table auth.users(id uuid primary key); create table public.organizations(id uuid primary key);
      create table public.workspaces(id uuid primary key, org_id uuid not null references public.organizations(id));`);
    await db.query("insert into auth.users values($1)", [actor]);
    await db.query("insert into organizations values($1)", [org]);
    await db.query("insert into workspaces values($1,$2)", [workspace, org]);
    await db.exec(
      fs.readFileSync("supabase/migrations/20261026020000_google_sheets_oauth.sql", "utf8"),
    );
    await db.exec(
      "create table public.agent_setup_runs(id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id)); grant all on public.agent_setup_runs to service_role",
    );
    await db.exec(
      fs.readFileSync("supabase/migrations/20261026030000_enquiry_google_destination.sql", "utf8"),
    );
    const flags = await db.query(
      "select relname,relrowsecurity from pg_class where relname in ('google_connections','google_oauth_states') order by relname",
    );
    assert.deepEqual(
      flags.rows.map((r) => r.relrowsecurity),
      [true, true],
    );
    await assert.rejects(
      db.exec("set role authenticated; select * from google_connections"),
      /permission denied/,
    );
    await db.exec("reset role; set role service_role");
    const connection = crypto.randomUUID();
    await db.query(
      "insert into google_connections(id,org_id,workspace_id,account_subject,account_email) values($1,$2,$3,'sub','owner@example.com')",
      [connection, org, workspace],
    );
    const count = await db.query("select count(*)::int n from google_connections");
    assert.equal(count.rows[0].n, 1);
    await assert.rejects(
      db.query(
        "insert into agent_setup_runs(workspace_id,destination_kind,google_sheet_destination) values($1,'google_sheets','{}')",
        [workspace],
      ),
      /agent_setup_google_destination_shape/,
    );
    await db.query(
      "insert into agent_setup_runs(workspace_id,destination_kind,google_connection_id,google_sheet_destination) values($1,'google_sheets',$2,$3)",
      [
        workspace,
        connection,
        JSON.stringify({ spreadsheetId: "sheet", worksheetId: 1, mapping: {} }),
      ],
    );
  } finally {
    await db.close();
  }
});

test("resource discovery wrappers authorize the workspace and reject browser tokens", async () => {
  const workspaceId = crypto.randomUUID(),
    actorId = crypto.randomUUID();
  const checks = [],
    calls = [];
  const api = loader({
    "@tanstack/react-start": serverFn,
    "@/integrations/supabase/auth-middleware": { requireSupabaseAuth: {} },
    "./google-oauth.server": { requireGoogleWorkspaceAdmin: async (...args) => checks.push(args) },
    "./google-sheets.server": {
      listGoogleSpreadsheets: async (...args) => {
        calls.push(args);
        return { items: [], nextPageToken: null };
      },
    },
  })("src/lib/google-sheets.functions.ts");
  await api.listGoogleSheetsSpreadsheets({ data: { workspaceId }, context: { userId: actorId } });
  assert.deepEqual(checks, [[workspaceId, actorId]]);
  assert.deepEqual(calls, [[workspaceId, undefined]]);
  assert.throws(
    () =>
      api.listGoogleSheetsSpreadsheets({
        data: { workspaceId, accessToken: "browser-secret" },
        context: { userId: actorId },
      }),
    /unrecognized/i,
  );
});
