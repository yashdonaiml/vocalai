const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");
const { loader, database } = require("./helpers.cjs");

test("enquiry pack supports English confirmation without modifying the existing default or inventing a preferred time", () => {
  const load = loader({});
  const cfg = load("src/lib/agent-config.ts");
  const original = structuredClone(cfg.DEFAULT_CONFIG);
  const pack = load("src/lib/enquiry-pack.ts");
  const c = pack.buildEnquiryPack({
    name: "Fixture Repairs",
    brief: "Repair appliances. Prices are unknown.",
  });
  assert.equal(c.runtime.mode, "composable");
  assert.equal(c.language, "English");
  assert.match(c.greeting, /Fixture Repairs/);
  assert.doesNotMatch(c.instructions, /Represent VocollAI/);
  assert.deepEqual(cfg.DEFAULT_CONFIG, original);
  assert.equal(pack.ENQUIRY_CALLBACK_SCHEMA.required.includes("preferred_time"), false);
  const args = load("src/lib/callbacks.server.ts").callbackDetails.parse({
    name: "Test",
    phone: "+13125550199",
    reason: "Repair request",
  });
  assert.equal(args.preferred_time, "Not specified");
  assert.equal(args.language, "en");
  const cap = load("src/lib/runtime/capabilities.ts");
  assert.equal(cap.evaluateEnquiryCapabilities(c).supported, true);
  assert.equal(cap.evaluateEnquiryCapabilities(original).supported, false);
});

test("per-session limits stop once, suspend silence while speaking, and clear on disposal", () => {
  const { SessionLimits, validateCallLimits } = loader({})("runtime/src/session-limits.ts");
  let id = 0;
  const tasks = new Map();
  const stopped = [];
  const clock = {
    setTimeout: (fn, ms) => {
      tasks.set(++id, { fn, ms });
      return id;
    },
    clearTimeout: (k) => tasks.delete(k),
  };
  const limits = new SessionLimits(
    { max_minutes: 2, silence_seconds: 10 },
    (r) => stopped.push(r),
    clock,
  );
  limits.start();
  assert.equal(tasks.size, 1);
  limits.setAgentBusy(false);
  assert.equal(tasks.size, 2);
  limits.setUserSpeaking(true);
  assert.equal(tasks.size, 1);
  limits.setUserSpeaking(false);
  [...tasks.values()].find((t) => t.ms === 10000).fn();
  assert.deepEqual(stopped, ["silence_timeout"]);
  assert.equal(tasks.size, 0);
  limits.dispose();
  assert.equal(validateCallLimits(undefined), undefined);
  assert.throws(() => validateCallLimits({ max_minutes: NaN, silence_seconds: 5 }));
});

test("setup migration enforces scoped admin-only writes, idempotent creation, stale-save rejection and preview claims in PostgreSQL", async (t) => {
  const db = new PGlite();
  const ids = Object.fromEntries(
    ["ws", "other", "admin", "member", "request"].map((k) => [k, crypto.randomUUID()]),
  );
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);
 create table workspaces(id uuid primary key);create table agents(id uuid primary key default gen_random_uuid(),workspace_id uuid references workspaces,name text,description text,config jsonb,status text default 'draft',live_version integer);
 create table tool_definitions(id uuid primary key);create table tool_revisions(id uuid primary key);create table runtime_bundles(id uuid primary key);create table conversations(id uuid primary key,workspace_id uuid,status text);
 create table agent_tool_bindings(agent_id uuid);create table agent_knowledge_bases(agent_id uuid);
 create function release_actor_is_admin(_workspace uuid,_actor uuid) returns boolean language sql stable as $$ select _actor='${ids.admin}'::uuid and _workspace='${ids.ws}'::uuid $$;
 create function is_workspace_member(_ws uuid,_min text default 'member') returns boolean language sql stable as $$select _ws='${ids.ws}'::uuid and current_setting('fixture.actor',true)='${ids.admin}'$$;`);
    await db.query("insert into auth.users values($1),($2)", [ids.admin, ids.member]);
    await db.query("insert into workspaces values($1),($2)", [ids.ws, ids.other]);
    await db.exec(
      fs.readFileSync("supabase/migrations/20261026010000_enquiry_preview.sql", "utf8"),
    );
    const config = { enquiry_business: { brief: "Fixture business" } };
    const begin = (actor = ids.admin) =>
      db.query("select begin_enquiry_setup($1,$2,$3,null,$4,$5,$6) s", [
        ids.ws,
        actor,
        ids.request,
        "Fixture",
        JSON.stringify(config),
        "snapshot",
      ]);
    await assert.rejects(begin(ids.member), /admin required/);
    const s = (await begin()).rows[0].s;
    assert.equal((await begin()).rows[0].s.id, s.id);
    assert.equal((await db.query("select count(*)::int n from agents")).rows[0].n, 1);
    await db.exec("set role authenticated");
    await assert.rejects(
      db.query("select begin_enquiry_setup($1,$2,$3,null,$4,$5,$6)", [
        ids.ws,
        ids.admin,
        ids.request,
        "Forged",
        "{}",
        "hash",
      ]),
      /permission denied/,
    );
    await assert.rejects(db.query("update agent_setup_runs set revision=1"), /permission denied/);
    await db.exec("reset role");
    await assert.rejects(
      db.query("select save_enquiry_setup($1,$2,$3,99,$4,$5,$6)", [
        ids.ws,
        s.id,
        ids.admin,
        "Fixture",
        "{}",
        "changed",
      ]),
      /changed/,
    );
    const save = await db.query("select save_enquiry_setup($1,$2,$3,1,$4,$5,$6) s", [
      ids.ws,
      s.id,
      ids.admin,
      "Fixture",
      JSON.stringify(config),
      "newhash",
    ]);
    assert.equal(save.rows[0].s.revision, 2);
    const tool = crypto.randomUUID(),
      rev = crypto.randomUUID();
    await db.query("insert into tool_definitions values($1)", [tool]);
    await db.query("insert into tool_revisions values($1)", [rev]);
    await db.query("update agent_setup_runs set tool_id=$1,tool_revision_id=$2 where id=$3", [
      tool,
      rev,
      s.id,
    ]);
    const key = crypto.randomUUID();
    const claim = (keyArg = key) =>
      db.query("select claim_enquiry_preview($1,$2,$3,2,$4) p", [ids.ws, s.id, ids.admin, keyArg]);
    assert.equal((await claim()).rows[0].p.claimed, true);
    assert.equal((await claim()).rows[0].p.claimed, false);
    await assert.rejects(claim(crypto.randomUUID()), /already running/);
    await assert.rejects(
      db.query("select claim_enquiry_preview($1,$2,$3,2,$4)", [
        ids.other,
        s.id,
        ids.admin,
        crypto.randomUUID(),
      ]),
      /admin required/,
    );
  } finally {
    await db.close();
  }
});

async function authorityFixture() {
  const config = { language: "English", fixture: true };
  const tables = {
    setup_preview_sessions: [
      {
        id: "p",
        session_id: "call",
        workspace_id: "ws",
        setup_id: "setup",
        actor_id: "owner",
        status: "ready",
        bundle_id: "bundle",
        setup_revision: 1,
        expires_at: new Date(Date.now() + 60000).toISOString(),
      },
    ],
    agent_setup_runs: [
      {
        id: "setup",
        workspace_id: "ws",
        agent_id: "agent",
        revision: 1,
        tool_id: "tool",
        tool_revision_id: "rev",
      },
    ],
    agents: [{ id: "agent", workspace_id: "ws", config }],
  };
  const db = database(tables);
  let allowed = true;
  db.rpc = async () => ({ data: allowed, error: null });
  const api = loader({ "@/integrations/supabase/client.server": { supabaseAdmin: db } })(
    "src/lib/setup-preview-authority.server.ts",
  );
  const hash = await api.setupSnapshot(config);
  tables.setup_preview_sessions[0].snapshot_hash = hash;
  tables.agent_setup_runs[0].snapshot_hash = hash;
  return {
    tables,
    api,
    deny: () => (allowed = false),
    session: {
      id: "call",
      workspace_id: "ws",
      agent_id: "agent",
      runtime_bundle_id: "bundle",
      deployment_id: null,
      channel: "web_test",
      started_by: "owner",
    },
  };
}
test("preview authority rejects forged purpose, live sessions, expiry, revocation and edited drafts", async () => {
  for (const change of [
    (f) => (f.session.channel = "pstn"),
    (f) => (f.session.started_by = "someone"),
    (f) => (f.session.deployment_id = "live"),
    (f) => (f.session.workspace_id = "other"),
    (f) => (f.tables.setup_preview_sessions[0].expires_at = "2020-01-01"),
    (f) => f.tables.agent_setup_runs[0].revision++,
    (f) => (f.tables.agents[0].config.fixture = false),
    (f) => f.deny(),
  ]) {
    const f = await authorityFixture();
    change(f);
    await assert.rejects(f.api.previewAuthority(f.session, "setup_preview"));
  }
  const f = await authorityFixture();
  assert.equal((await f.api.previewAuthority(f.session, "setup_preview")).tool_revision_id, "rev");
  await assert.rejects(f.api.previewAuthority(f.session, undefined));
  f.tables.setup_preview_sessions = [];
  await assert.rejects(f.api.previewAuthority(f.session, "setup_preview"));
  assert.equal(await f.api.previewAuthority(f.session, undefined), null);
});

test("setup receipts require the exact session, current revision and a persisted confirmed successful save", async () => {
  const tables = {
    agent_setup_runs: [
      {
        id: "setup",
        workspace_id: "ws",
        agent_id: "agent",
        revision: 1,
        snapshot_hash: "h",
        tool_id: "tool",
        tool_revision_id: "rev",
      },
    ],
    setup_preview_sessions: [
      {
        setup_id: "setup",
        workspace_id: "ws",
        session_id: "call",
        setup_revision: 1,
        snapshot_hash: "h",
        bundle_id: "bundle",
        expires_at: new Date(Date.now() + 60000).toISOString(),
      },
    ],
    conversations: [
      {
        id: "call",
        agent_id: "agent",
        workspace_id: "ws",
        runtime_bundle_id: "bundle",
        status: "completed",
        started_at: new Date().toISOString(),
        privacy_purged_at: null,
      },
    ],
    tool_invocations: [
      {
        id: "inv",
        workspace_id: "ws",
        session_id: "call",
        tool_id: "tool",
        tool_revision_id: "rev",
        status: "succeeded",
        output_redacted: { saved: true, request_id: "inv" },
        ended_at: new Date().toISOString(),
      },
    ],
    tool_pending_actions: [
      { id: "pending", workspace_id: "ws", invocation_id: "inv", status: "executed" },
    ],
  };
  const db = database(tables);
  db.rpc = async () => ({ data: true, error: null });
  const api = loader({
    "@/integrations/supabase/client.server": { supabaseAdmin: db },
    "./privacy.server": { workspaceCallPrivacy: async () => ({ cutoff: "2020-01-01" }) },
  })("src/lib/setup.server.ts");
  const result = () => api.getEnquiryPreviewState("ws", "setup", "call", "owner");
  assert.equal((await result()).state, "saved");
  assert.equal((await result()).receipt.notificationSent, false);
  tables.tool_pending_actions[0].status = "pending";
  assert.equal((await result()).state, "not_saved");
  tables.tool_pending_actions[0].status = "executed";
  tables.tool_invocations[0].session_id = "other";
  assert.equal((await result()).state, "not_saved");
  tables.agent_setup_runs[0].revision = 2;
  assert.equal((await result()).state, "failed");
  await assert.rejects(api.getEnquiryPreviewState("other", "setup", "call", "owner"));
});

test("test-only voice grant can save through exact confirmation but cannot authorize an ordinary call", async () => {
  process.env.PROVIDER_KEY_SECRET = "dummy-test-key-not-a-real-secret";
  const tables = {
    tool_definitions: [
      {
        id: "tool",
        workspace_id: "ws",
        connector_id: "connector",
        stable_slug: "save_callback",
        state: "active",
        current_revision_id: "rev",
      },
    ],
    tool_revisions: [
      {
        id: "rev",
        workspace_id: "ws",
        tool_id: "tool",
        display_name: "Save callback request",
        input_schema: { type: "object", required: ["name", "phone", "reason"] },
        adapter_mapping: { operation: "save_callback" },
      },
    ],
    tool_connectors: [
      {
        id: "connector",
        workspace_id: "ws",
        admin_enabled: true,
        health: "healthy",
        type: "native",
        configuration: { operation: "save_callback" },
      },
    ],
    tool_approvals: [
      {
        workspace_id: "ws",
        tool_revision_id: "rev",
        status: "approved",
        risk_class: "write",
        confirmation_minimum: "voice_readback",
        allowed_contexts: ["setup_preview"],
        policy_revision: 1,
      },
    ],
    workspaces: [{ id: "ws", org_id: "org" }],
    conversations: [{ id: "call", workspace_id: "ws", channel: "web_test" }],
  };
  const db = database(tables);
  let preview = true;
  const api = loader({
    "@/integrations/supabase/client.server": { supabaseAdmin: db },
    "./bindings.server": {
      sessionBinding: async () => ({
        session: { workspace_id: "ws", deployment_id: null },
        binding: { tool_id: "tool", tool_revision_id: "rev" },
        preview: preview ? { id: "preview" } : null,
      }),
    },
  })("src/lib/tools/gateway.server.ts");
  const request = () => ({
    workspaceId: "ws",
    toolId: "tool",
    toolRevisionId: "rev",
    context: {
      kind: "voice_session",
      sessionId: "call",
      turnId: crypto.randomUUID(),
      deploymentId: "",
    },
    arguments: { name: "Fixture", phone: "+13125550199", reason: "Repair enquiry" },
  });
  const pending = await api.invokeTool(request());
  assert.equal(pending.status, "pending_confirmation");
  const saved = await api.executePendingAction(
    "ws",
    pending.confirmation.id,
    { channel: "caller" },
    "confirm",
  );
  assert.equal(saved.status, "succeeded");
  assert.equal(saved.output.saved, true);
  assert.equal(saved.output.notification_sent, false);
  assert.equal(
    (await api.executePendingAction("ws", pending.confirmation.id, {}, "confirm")).status,
    "blocked",
  );
  assert.equal((tables.domain_events ?? []).length, 0);
  preview = false;
  assert.equal((await api.invokeTool(request())).status, "blocked");
});

test("confirmed setup preview dispatches the pinned Google Sheets adapter once with a test marker", async () => {
  process.env.PROVIDER_KEY_SECRET = "dummy-test-key-not-a-real-secret";
  const mapping = {
    operation: "append_google_sheet",
    destination: {
      spreadsheetId: "sheet_abcdefghijk",
      spreadsheetName: "Enquiries",
      worksheetId: 7,
      worksheetTitle: "Leads",
      mapping: {},
    },
  };
  const tables = {
    tool_definitions: [
      {
        id: "sheet-tool",
        workspace_id: "ws",
        connector_id: "sheet-connector",
        stable_slug: "append_google_sheet",
        state: "active",
        current_revision_id: "sheet-rev",
      },
    ],
    tool_revisions: [
      {
        id: "sheet-rev",
        workspace_id: "ws",
        tool_id: "sheet-tool",
        display_name: "Save enquiry to Google Sheets",
        input_schema: { type: "object", required: ["name", "phone", "reason"] },
        adapter_mapping: mapping,
      },
    ],
    tool_connectors: [
      {
        id: "sheet-connector",
        workspace_id: "ws",
        admin_enabled: true,
        health: "healthy",
        type: "native",
        configuration: { operation: "append_google_sheet" },
        consecutive_failures: 0,
      },
    ],
    tool_approvals: [
      {
        workspace_id: "ws",
        tool_revision_id: "sheet-rev",
        status: "approved",
        risk_class: "write",
        confirmation_minimum: "voice_readback",
        allowed_contexts: ["setup_preview"],
        policy_revision: 1,
        safe_to_retry: false,
      },
    ],
    workspaces: [{ id: "ws", org_id: "org" }],
  };
  const db = database(tables);
  const calls = [];
  const api = loader({
    "@/integrations/supabase/client.server": { supabaseAdmin: db },
    "./bindings.server": {
      sessionBinding: async () => ({
        session: { workspace_id: "ws", deployment_id: null },
        binding: { tool_id: "sheet-tool", tool_revision_id: "sheet-rev" },
        preview: { id: "preview" },
      }),
    },
    "../google-sheets.server": {
      invokeGoogleSheetsAdapter: async (input) => {
        calls.push(input);
        return {
          ok: true,
          host: "sheets.googleapis.com",
          statusCode: 201,
          output: {
            outcome_kind: "google_sheet_row",
            completion_state: "saved",
            request_marker: input.invocationId,
            record_kind: input.isSetupPreview ? "test" : "live",
          },
        };
      },
    },
  })("src/lib/tools/gateway.server.ts");
  const request = {
    workspaceId: "ws",
    toolId: "sheet-tool",
    toolRevisionId: "sheet-rev",
    context: {
      kind: "voice_session",
      sessionId: "call",
      turnId: crypto.randomUUID(),
      deploymentId: "",
    },
    arguments: { name: "Fixture", phone: "+13125550199", reason: "Repair enquiry" },
  };
  const pending = await api.invokeTool(request);
  assert.equal(pending.status, "pending_confirmation");
  const saved = await api.executePendingAction(
    "ws",
    pending.confirmation.id,
    { channel: "caller" },
    "confirm",
  );
  assert.equal(saved.status, "succeeded");
  assert.equal(saved.output.record_kind, "test");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].isSetupPreview, true);
  assert.deepEqual(calls[0].configuration, mapping);
  assert.equal((tables.tool_attempts ?? []).length, 1);
  assert.equal(tables.tool_attempts[0].retry_decision, "stop");
});

test("preview event ingestion never dispatches live workflows", async () => {
  const sid = crypto.randomUUID();
  let workflows = 0;
  const tables = {
    conversations: [{ id: sid, workspace_id: "ws", workspaces: { org_id: "org" } }],
    setup_preview_sessions: [{ id: "preview", workspace_id: "ws", session_id: sid }],
  };
  const db = database(tables);
  db.rpc = async () => ({ data: true, error: null });
  const api = loader({
    "@/integrations/supabase/client.server": { supabaseAdmin: db },
    "../workflows.server": { dispatchWorkflows: async () => workflows++ },
  })("src/lib/runtime/session.server.ts");
  await api.ingestEvents({
    session_id: sid,
    batch_id: crypto.randomUUID(),
    events: [{ type: "turn", role: "user", content: "hello" }, { type: "end" }],
  });
  assert.equal(workflows, 0);
});

test("removed test permission blocks a previously pending console confirmation", async () => {
  const user = crypto.randomUUID(),
    ws = crypto.randomUUID(),
    pending = crypto.randomUUID();
  let executions = 0;
  const tables = {
    tool_pending_actions: [{ id: pending, workspace_id: ws, invocation_id: "inv" }],
    tool_invocations: [
      { id: "inv", actor_user_id: user, mode: "live", context_kind: "console_test" },
    ],
  };
  const db = database(tables);
  const serverFn = {
    createServerFn: () => {
      let parse = (v) => v;
      const c = {
        middleware: () => c,
        validator: (fn) => {
          parse = fn;
          return c;
        },
        handler: (fn) => (args) => fn({ ...args, data: parse(args.data) }),
      };
      return c;
    },
  };
  const api = loader({
    "@tanstack/react-start": serverFn,
    "@/integrations/supabase/auth-middleware": { requireSupabaseAuth: {} },
    "@/integrations/supabase/client.server": { supabaseAdmin: db },
    "./tools/gateway.server": { executePendingAction: async () => executions++ },
  })("src/lib/tools.functions.ts");
  await assert.rejects(
    api.decideAction({
      data: { workspaceId: ws, pendingActionId: pending, decision: "confirm" },
      context: { userId: user, supabase: { rpc: async () => ({ data: false }) } },
    }),
    /Only admins|permission|live test/,
  );
  assert.equal(executions, 0);
});

test("preview compilation permits test-only grants and rejects them for ordinary or published bundles", async () => {
  const pack = loader({})("src/lib/enquiry-pack.ts").buildEnquiryPack({
    name: "Fixture",
    brief: "A fixture repair business.",
  });
  const tables = {
    agents: [{ id: "agent", workspace_id: "ws", config: pack }],
    tool_revisions: [
      {
        id: "rev",
        tool_id: "tool",
        workspace_id: "ws",
        input_schema: { type: "object" },
        description: "Save enquiry",
        invocation_hash: "hash",
      },
    ],
    tool_approvals: [
      {
        tool_revision_id: "rev",
        workspace_id: "ws",
        status: "approved",
        risk_class: "write",
        confirmation_minimum: "voice",
        allowed_contexts: ["setup_preview"],
      },
    ],
  };
  const api = loader({
    "@/integrations/supabase/client.server": { supabaseAdmin: database(tables) },
    "../tools/bindings.server": {
      agentBindings: async () => [
        { tool_id: "tool", tool_revision_id: "rev", alias: "save_callback" },
      ],
    },
  })("src/lib/runtime/bundle.server.ts");
  const opts = {
    workspaceId: "ws",
    agentId: "agent",
    agentVersion: null,
    environmentId: null,
    userId: "owner",
  };
  await assert.rejects(api.compileBundle(opts), /live calls/);
  const preview = await api.compileBundle({ ...opts, purpose: "setup_preview" });
  assert.equal(preview.bundle.purpose, "setup_preview");
  assert.equal(preview.bundle.capabilities.confirmation, "exact_readback");
  assert.equal(preview.bundle.call_behavior.max_minutes, 15);
  await assert.rejects(
    api.compileBundle({ ...opts, environmentId: "prod", purpose: "setup_preview" }),
    /unpublished draft/,
  );
});

test("a lost preview join reply resumes the same persisted session without a second compile or stored token", async () => {
  const oldSecret = process.env.RUNTIME_SHARED_SECRET;
  process.env.RUNTIME_SHARED_SECRET = "dummy-preview-secret-at-least-thirty-two-chars";
  try {
    const tables = { workspaces: [{ id: "ws", org_id: "org" }] };
    const db = database(tables);
    let compiles = 0,
      joins = 0;
    db.rpc = async (fn, args) => {
      if (fn === "release_actor_is_admin") return { data: true, error: null };
      if (fn === "begin_enquiry_setup") {
        tables.agents ??= [];
        tables.agent_setup_runs ??= [];
        if (!tables.agent_setup_runs.length) {
          tables.agents.push({
            id: "agent",
            workspace_id: "ws",
            name: args._name,
            config: args._config,
          });
          tables.agent_setup_runs.push({
            id: "setup",
            workspace_id: "ws",
            agent_id: "agent",
            revision: 1,
            snapshot_hash: args._hash,
            tool_id: null,
            tool_revision_id: null,
          });
        }
        return { data: structuredClone(tables.agent_setup_runs[0]), error: null };
      }
      if (fn === "claim_enquiry_preview") {
        tables.setup_preview_sessions ??= [];
        const existing = tables.setup_preview_sessions.find((p) => p.request_key === args._request);
        if (existing)
          return { data: { claimed: false, preview: structuredClone(existing) }, error: null };
        const s = tables.agent_setup_runs[0];
        const p = {
          id: "preview",
          workspace_id: "ws",
          setup_id: "setup",
          actor_id: "owner",
          setup_revision: 1,
          snapshot_hash: s.snapshot_hash,
          request_key: args._request,
          status: "preparing",
          expires_at: new Date(Date.now() + 60000).toISOString(),
        };
        tables.setup_preview_sessions.push(p);
        return { data: { claimed: true, preview: structuredClone(p) }, error: null };
      }
      throw new Error("Unexpected RPC " + fn);
    };
    const api = loader({
      "@/integrations/supabase/client.server": { supabaseAdmin: db },
      "./runtime/livekit.server": {
        mediaConfigured: () => true,
        createSessionJoin: async () => {
          if (++joins === 1) throw new Error("lost response");
          return { serverUrl: "wss://fixture.invalid", token: "fixture-token" };
        },
      },
      "./runtime/bundle.server": {
        bundleCredentials: async () => ({}),
        compileBundle: async () => {
          compiles++;
          return { bundleId: "bundle" };
        },
      },
      "./tools.functions": {
        prepareEnquiryPreviewAction: async () => ({ toolId: "tool", revisionId: "rev" }),
      },
    })("src/lib/setup.server.ts");
    const setup = await api.beginEnquiry("ws", "owner", "create-key", {
      name: "Fixture",
      brief: "A fixture repair business.",
    });
    assert.equal(setup.agentId, "agent");
    await assert.rejects(api.startEnquiry("ws", "setup", "owner", 1, "same-key"), /lost response/);
    const joined = await api.startEnquiry("ws", "setup", "owner", 1, "same-key");
    assert.equal(joined.sessionId, tables.conversations[0].id);
    assert.equal(compiles, 1);
    assert.equal(tables.conversations.length, 1);
    assert.doesNotMatch(JSON.stringify(tables), /fixture-token/);
  } finally {
    if (oldSecret === undefined) delete process.env.RUNTIME_SHARED_SECRET;
    else process.env.RUNTIME_SHARED_SECRET = oldSecret;
  }
});
