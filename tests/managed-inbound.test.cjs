const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");
const { loader, database } = require("./helpers.cjs");

const migration = fs.readFileSync("supabase/migrations/20261022120000_managed_inbound.sql", "utf8") + "\n" + fs.readFileSync("supabase/migrations/20261025180000_managed_inbound_privacy_and_test_challenge.sql", "utf8") + "\n" + fs.readFileSync("supabase/migrations/20261025190000_successful_action_webhook_events.sql", "utf8");
const ws = crypto.randomUUID(),
  foreign = crypto.randomUUID(),
  agent = crypto.randomUUID(),
  env = crypto.randomUUID();
const schema = `
create role anon; create role authenticated; create role service_role bypassrls;
create table workspaces(id uuid primary key);
create table agents(id uuid primary key, workspace_id uuid, status text);
create table environments(id uuid primary key, workspace_id uuid);
create table deployments(id uuid primary key default gen_random_uuid(), workspace_id uuid, agent_id uuid, environment_id uuid, status text, canary_percent integer, agent_version integer, bundle_id uuid);
create table phone_numbers(id uuid primary key default gen_random_uuid(), workspace_id uuid, e164 text unique, carrier text, agent_id uuid, environment_id uuid, status text);
create table conversations(id uuid primary key default gen_random_uuid(), workspace_id uuid, phone_number_id uuid, agent_id uuid, environment_id uuid, agent_version integer,
 channel text, status text, started_at timestamptz default now(), ended_at timestamptz, duration_seconds integer);
create table conversation_turns(id uuid primary key default gen_random_uuid(), workspace_id uuid, conversation_id uuid, role text, content text);
create table domain_events(id uuid primary key, workspace_id uuid, type text, schema_version integer default 1, payload jsonb default '{}'::jsonb, created_at timestamptz default now(), processed_at timestamptz);
create table webhook_endpoints(id uuid primary key);
create table webhook_deliveries(id uuid primary key default gen_random_uuid(), endpoint_id uuid, workspace_id uuid, event text, status integer, error text, duration_ms integer, created_at timestamptz default now());
create function is_workspace_member(_ws uuid) returns boolean language sql stable as $$ select _ws::text = current_setting('test.workspace',true) $$;
grant usage on schema public to authenticated, service_role;
grant all on all tables in schema public to service_role;
`;

test("managed inbound purchase, tenant isolation, billing and verification in PostgreSQL", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(schema);
    await db.exec(migration);
    await db.query("insert into workspaces values ($1),($2)", [ws, foreign]);
    await db.query("insert into agents values ($1,$2,'published')", [agent, ws]);
    await db.query("insert into environments values ($1,$2)", [env, ws]);
    await db.query(
      "insert into deployments(workspace_id,agent_id,environment_id,status,canary_percent,agent_version,bundle_id) values ($1,$2,$3,'active',100,1,$4)",
      [ws, agent, env, crypto.randomUUID()],
    );
    let counter = 0;
    async function quote(workspace = ws, expired = false) {
      return (
        await db.query(
          `insert into managed_number_quotes(workspace_id,e164,monthly_cents,setup_cents,inbound_rate,carrier_monthly_cents,carrier_setup_cents,expires_at)
   values ($1,$2,200,100,'0.05',100,0,now()+$3::interval) returning id`,
          [
            workspace,
            "+1312555" + String(++counter).padStart(4, "0"),
            expired ? "-1 minute" : "5 minutes",
          ],
        )
      ).rows[0].id;
    }
    const q = await quote(),
      request = crypto.randomUUID();
    const reserve = (workspace, qid, requestId, limit = 1) =>
      db.query("select reserve_managed_number($1,$2,$3,$4,$5,$6) as id", [
        workspace,
        qid,
        agent,
        env,
        requestId,
        limit,
      ]);
    await t.test(
      "foreign and expired quotes cannot reserve numbers; canaries cannot purchase",
      async () => {
        await assert.rejects(reserve(foreign, q, crypto.randomUUID()), /Quote expired/);
        await assert.rejects(
          reserve(ws, await quote(ws, true), crypto.randomUUID()),
          /Quote expired/,
        );
        await assert.rejects(
          reserve(foreign, await quote(foreign), crypto.randomUUID()),
          /full published deployment/,
        );
        await db.exec("update deployments set canary_percent=50");
        await assert.rejects(reserve(ws, q, request), /full published deployment/);
        await db.exec("update deployments set canary_percent=100");
      },
    );
    await t.test(
      "replayed requests return one order and concurrent different quotes obey the quota",
      async () => {
        await reserve(ws, q, request);
        await reserve(ws, q, request);
        const extra = await quote();
        await assert.rejects(reserve(ws, extra, crypto.randomUUID()), /limit reached/);
        await assert.rejects(reserve(ws, extra, request), /already used/);
        assert.equal(
          (await db.query("select count(*)::int as n from managed_number_orders")).rows[0].n,
          1,
        );
      },
    );
    await t.test(
      "browser roles cannot buy or write ledger rows and cannot see another workspace",
      async () => {
        await db.exec("set role authenticated; set test.workspace='" + foreign + "'");
        await assert.rejects(db.query("select * from managed_number_orders"), /permission denied/);
        await assert.rejects(db.query("select carrier_monthly_cents from managed_number_quotes"), /permission denied/);
        await assert.rejects(db.query("select carrier_order_ref from managed_number_orders"), /permission denied/);
        await assert.rejects(reserve(ws, q, request), /permission denied/);
        await assert.rejects(
          db.query(
            "insert into managed_number_charges(workspace_id,order_id,period,amount_cents,description) values ($1,$2,0,0,'fake')",
            [ws, request],
          ),
          /permission denied/,
        );
        await db.exec("reset role");
      },
    );
    const number = (
      await db.query("select number_id from managed_number_orders where id=$1", [request])
    ).rows[0].number_id;
    await db.query(
      "update managed_number_orders set activated_at=now()-interval '1 month 1 day', state='ready' where id=$1",
      [request],
    );
    await t.test("rental accrual replays safely and stops at carrier release time", async () => {
      await db.query("select accrue_managed_number_charges($1)", [request]);
      await db.query("select accrue_managed_number_charges($1)", [request]);
      assert.equal(
        (await db.query("select sum(amount_cents)::int as n from managed_number_charges")).rows[0]
          .n,
        500,
      );
      await db.query(
        "update managed_number_orders set carrier_released_at=now(), activated_at=now()-interval '3 months' where id=$1",
        [request],
      );
      await db.query("select accrue_managed_number_charges($1)", [request]);
      const count = (await db.query("select count(*)::int as n from managed_number_charges"))
        .rows[0].n;
      await db.query(
        "update managed_number_orders set carrier_released_at=now()-interval '2 months' where id=$1",
        [request],
      );
      await db.query("select accrue_managed_number_charges($1)", [request]);
      assert.equal(
        (await db.query("select count(*)::int as n from managed_number_charges")).rows[0].n,
        count,
      );
    });
    await db.query("update phone_numbers set status='routed' where id=$1", [number]);
    const testId = (
      await db.query(
        "insert into phone_verifications(workspace_id,number_id,agent_id,environment_id,agent_version,challenge) values ($1,$2,$3,$4,1,'AVIROH ABC123') returning id",
        [ws, number, agent, env],
      )
    ).rows[0].id;
    const conv = (
      await db.query(
        "insert into conversations(workspace_id,phone_number_id,agent_id,environment_id,agent_version,channel,status) values ($1,$2,$3,$4,1,'pstn','active') returning id",
        [ws, number, agent, env],
      )
    ).rows[0].id;
    const verify = () =>
      db.query("select confirm_phone_verification($1,$2,$3,$4)", [ws, number, testId, conv]);
    await t.test(
      "verification requires a completed call with both transcript roles and tenant ownership",
      async () => {
        await assert.rejects(verify(), /Complete the phone test/);
        await db.query(
          "update conversations set status='completed',ended_at=now(),duration_seconds=61 where id=$1",
          [conv],
        );
        await assert.rejects(verify(), /both directions/);
        await db.query(
          "insert into conversation_turns(workspace_id,conversation_id,role,content) values ($1,$2,'user','Hello'),($1,$2,'assistant','Welcome')",
          [ws, conv],
        );
        await assert.rejects(verify(), /test phrase/);
        await db.query("update conversation_turns set content='Hello, AVIROH ABC123' where conversation_id=$1 and role='user'", [conv]);
        await assert.rejects(
          db.query("select confirm_phone_verification($1,$2,$3,$4)", [
            foreign,
            number,
            testId,
            conv,
          ]),
          /route changed/,
        );
        await verify();
        assert.ok(
          (await db.query("select verified_at from phone_numbers where id=$1", [number])).rows[0]
            .verified_at,
        );
      },
    );
    await t.test(
      "call charges commit once, use accepted rate and remain scoped to the call workspace",
      async () => {
        await db.query("update conversations set status='completed' where id=$1", [conv]);
        const rows = (
          await db.query("select * from managed_call_charges where conversation_id=$1", [conv])
        ).rows;
        assert.equal(rows.length, 1);
        assert.equal(rows[0].amount_cents, 6);
        assert.equal(rows[0].workspace_id, ws);
      },
    );
    await t.test("assignment changes clear verification and invalidate old evidence", async () => {
      const next = crypto.randomUUID();
      await db.query("insert into environments values ($1,$2)", [next, ws]);
      await db.query("update phone_numbers set environment_id=$1 where id=$2", [next, number]);
      assert.equal(
        (await db.query("select verified_at from phone_numbers where id=$1", [number])).rows[0]
          .verified_at,
        null,
      );
      await assert.rejects(verify(), /route changed/);
    });
  } finally {
    await db.close();
  }
});

test("signed-runtime ingestion and managed billing migrations commit a call and its charge together", async () => {
  const db = new PGlite();
  try {
    await db.exec(schema.replace("phone_number_id uuid, ", ""));
    await db.exec(`alter table conversations add column summary text;
   alter table conversation_turns add column seq integer;
   create table usage_events(id uuid primary key default gen_random_uuid(),workspace_id uuid,conversation_id uuid,kind text,model text,quantity numeric,unit text);
   create table tool_pending_actions(workspace_id uuid,session_id text,status text);`);
    await db.exec(
      fs.readFileSync("supabase/migrations/20261021120000_inbound_telephony.sql", "utf8"),
    );
    await db.exec(migration);
    await db.query("insert into workspaces values ($1)", [ws]);
    await db.query("insert into agents values ($1,$2,'published')", [agent, ws]);
    await db.query("insert into environments values ($1,$2)", [env, ws]);
    await db.query(
      "insert into deployments(workspace_id,agent_id,environment_id,status,canary_percent,agent_version,bundle_id) values ($1,$2,$3,'active',100,1,$4)",
      [ws, agent, env, crypto.randomUUID()],
    );
    const quote = (
      await db.query(
        "insert into managed_number_quotes(workspace_id,e164,monthly_cents,setup_cents,inbound_rate,carrier_monthly_cents,carrier_setup_cents) values ($1,'+13125550999',200,0,'0.05',100,0) returning id",
        [ws],
      )
    ).rows[0].id;
    const order = crypto.randomUUID();
    await db.query("select reserve_managed_number($1,$2,$3,$4,$5,1)", [
      ws,
      quote,
      agent,
      env,
      order,
    ]);
    const number = (
      await db.query("select number_id from managed_number_orders where id=$1", [order])
    ).rows[0].number_id;
    await db.query(
      "update managed_number_orders set state='ready',activated_at=now()-interval '1 day' where id=$1",
      [order],
    );
    const conv = (
      await db.query(
        "insert into conversations(workspace_id,phone_number_id,agent_id,environment_id,agent_version,channel,status,started_at) values ($1,$2,$3,$4,1,'pstn','active',now()-interval '2 minutes') returning id",
        [ws, number, agent, env],
      )
    ).rows[0].id;
    const batch = crypto.randomUUID(),
      events = JSON.stringify([
        { type: "turn", role: "user", content: "Hello" },
        { type: "turn", role: "assistant", content: "Welcome" },
        { type: "end", reason: "caller_left" },
      ]);
    await db.query("select ingest_runtime_events($1,$2,$3)", [conv, batch, events]);
    await db.query("select ingest_runtime_events($1,$2,$3)", [conv, batch, events]);
    const charges = (
      await db.query("select amount_cents from managed_call_charges where conversation_id=$1", [
        conv,
      ])
    ).rows;
    assert.equal(charges.length, 1);
    assert.equal(charges[0].amount_cents, 10);
    assert.equal(
      (await db.query("select status from conversations where id=$1", [conv])).rows[0].status,
      "completed",
    );
  } finally {
    await db.close();
  }
});

function fixture() {
  const workspace = crypto.randomUUID(),
    id = crypto.randomUUID(),
    number = crypto.randomUUID(),
    agentId = crypto.randomUUID(),
    environmentId = crypto.randomUUID(),
    quote = crypto.randomUUID();
  const tables = {
    managed_number_orders: [
      {
        id,
        workspace_id: workspace,
        number_id: number,
        quote_id: quote,
        state: "reserved",
        lease_at: null,
        submitted_at: null,
        carrier_order_ref: null,
      },
    ],
    phone_numbers: [
      {
        id: number,
        workspace_id: workspace,
        e164: "+13125550123",
        management_mode: "managed",
        agent_id: agentId,
        environment_id: environmentId,
      },
    ],
    managed_number_quotes: [
      {
        id: quote,
        workspace_id: workspace,
        e164: "+13125550123",
        monthly_cents: 200,
        setup_cents: 100,
      },
    ],
    deployments: [
      {
        workspace_id: workspace,
        agent_id: agentId,
        environment_id: environmentId,
        status: "active",
        canary_percent: 100,
        agent_version: 1,
        bundle_id: "bundle",
      },
    ],
    runtime_bundles: [
      {
        id: "bundle",
        workspace_id: workspace,
        agent_id: agentId,
        environment_id: environmentId,
        agent_version: 1,
        bundle: {},
      },
    ],
    workspaces: [{ id: workspace, org_id: "org" }],
  };
  const db = database(tables);
  db.rpc = async () => ({ data: null, error: null });
  let purchases = 0,
    routeAttempts = 0,
    timeout = false,
    releaseAttempts = 0,
    cleanupFailure = false,
    routingFailure = false;
  let remote = null;
  const provider = {
    searchNumbers: async () => [{ e164: "+13125550123", monthlyCents: 100, setupCents: 0 }],
    ensureConnection: async () => "connection",
    submitNumberOrder: async () => {
      purchases++;
      remote = {
        id: "remote",
        customer_reference: `aviroh-${id}`,
        connection_id: "connection",
        status: "success",
        phone_numbers: [{ phone_number: "+13125550123" }],
      };
      if (timeout) throw Error("private secret");
      return remote;
    },
    findNumberOrder: async () => remote,
    findOwnedNumber: async () => ({ id: "owned", status: "active" }),
    releaseNumber: async () => {
      releaseAttempts++;
    },
    removeConnection: async () => {},
    cents: (s) => Number(s) * 100,
  };
  const load = loader({
    "@/integrations/supabase/client.server": { supabaseAdmin: db },
    "./telephony/telnyx.server": provider,
    "./runtime/livekit.server": {
      phoneServiceSetup: () => ({
        mediaConfigured: true,
        runtimeConfigured: true,
        telnyxAllowed: true,
        sipEndpoint: "project.sip.example.com",
      }),
      removeInboundNumber: async () => {
        if (cleanupFailure) throw Error("private cleanup failure");
      },
    },
    "./runtime/bundle.server": { bundleCredentials: async () => ({}) },
    "./telephony.server": {
      validatePhoneRoute: async () => {},
      provisionPhoneNumber: async () => {
        routeAttempts++;
        if (routingFailure) throw Error("private provider URL");
        return { provisioned: true };
      },
    },
  });
  process.env.MANAGED_TELEPHONY_ENABLED = "true";
  process.env.TELNYX_API_KEY = "test";
  process.env.MANAGED_NUMBER_MONTHLY_USD = "2";
  process.env.MANAGED_NUMBER_SETUP_USD = "1";
  process.env.MANAGED_INBOUND_USD_PER_MINUTE = "0.05";
  return {
    workspace,
    id,
    db,
    tables,
    api: load("src/lib/managed-telephony.server.ts"),
    purchases: () => purchases,
    routes: () => routeAttempts,
    timeout: () => (timeout = true),
    breakRouting: () => (routingFailure = true),
    fixRouting: () => (routingFailure = false),
    releases: () => releaseAttempts,
    breakCleanup: () => (cleanupFailure = true),
    fixCleanup: () => (cleanupFailure = false),
  };
}

test("a lost paid-order response is reconciled without another purchase", async () => {
  const f = fixture();
  f.timeout();
  await f.api.advanceManagedOrder(f.workspace, f.id);
  assert.equal(f.purchases(), 1);
  assert.equal(f.tables.managed_number_orders[0].state, "review");
  await f.api.advanceManagedOrder(f.workspace, f.id);
  assert.equal(f.purchases(), 1);
  assert.equal(f.tables.managed_number_orders[0].state, "ready");
  assert.ok(!JSON.stringify(f.tables.managed_number_orders).includes("private secret"));
});

test("a stale pre-lease snapshot cannot repeat a purchase another request just completed", async () => {
  const f = fixture();
  const from = f.db.from.bind(f.db);
  let injected = false;
  f.db.from = (table) => {
    const query = from(table),
      update = query.update;
    query.update = (patch) => {
      if (table === "managed_number_orders" && patch.lease_token && !injected) {
        injected = true;
        Object.assign(f.tables.managed_number_orders[0], {
          state: "ready",
          submitted_at: new Date().toISOString(),
          carrier_order_ref: "already-bought",
          carrier_number_ref: "owned",
        });
      }
      return update(patch);
    };
    return query;
  };
  await f.api.advanceManagedOrder(f.workspace, f.id);
  assert.equal(f.purchases(), 0);
  assert.equal(f.tables.managed_number_orders[0].state, "ready");
});

test("release disables calls and records carrier release before retrying media cleanup", async () => {
  const f = fixture();
  await f.api.advanceManagedOrder(f.workspace, f.id);
  f.breakCleanup();
  await f.api.releaseManagedNumber(f.workspace, f.id);
  assert.equal(f.tables.phone_numbers[0].status, "removing");
  assert.equal(f.tables.managed_number_orders[0].state, "releasing");
  assert.ok(f.tables.managed_number_orders[0].carrier_released_at);
  f.fixCleanup();
  await f.api.advanceManagedOrder(f.workspace, f.id);
  assert.equal(f.releases(), 1);
  assert.equal(f.tables.managed_number_orders[0].state, "released");
  assert.equal(f.tables.phone_numbers[0].status, "released");
});

test("cancelling a pre-purchase request never calls the paid order or number release API", async () => {
  const f = fixture();
  await f.api.releaseManagedNumber(f.workspace, f.id);
  assert.equal(f.purchases(), 0);
  assert.equal(f.releases(), 0);
  assert.equal(f.tables.managed_number_orders[0].state, "released");
});

test("carrier adapter sets encrypted routing and validates number/order ownership", async () => {
  const oldFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, init) => {
    const u = new URL(url);
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: u, ...init, body });
    let data;
    if (u.pathname.endsWith("/fqdn_connections") && init.method === "GET") data = [];
    else if (u.pathname.endsWith("/fqdn_connections") && init.method === "POST")
      data = { id: "connection" };
    else if (u.pathname.endsWith("/fqdns") && init.method === "GET") data = [];
    else if (u.pathname.endsWith("/fqdns") && init.method === "POST") data = { id: "fqdn" };
    else if (u.pathname.endsWith("/fqdn_connections/connection")) data = { id: "connection" };
    else if (u.pathname.endsWith("/number_orders"))
      data = [
        {
          id: "order",
          customer_reference: "foreign",
          phone_numbers: [{ phone_number: "+13125550123" }],
        },
      ];
    else if (u.pathname.endsWith("/phone_numbers/owned"))
      data = { id: "owned", phone_number: "+13125550999", connection_id: "connection" };
    else throw Error("Unexpected request");
    return new Response(JSON.stringify({ data }), { status: 200 });
  };
  try {
    const api = loader({})("src/lib/telephony/telnyx.server.ts");
    assert.equal(await api.ensureConnection("request", "project.sip.example.com"), "connection");
    const patch = calls.find((c) => c.method === "PATCH").body;
    assert.equal(patch.transport_protocol, "TLS");
    assert.equal(patch.encrypted_media, "SRTP");
    assert.equal(patch.inbound.ani_number_format, "+E.164");
    assert.equal(patch.inbound.dnis_number_format, "+e164");
    assert.equal(patch.inbound.default_primary_fqdn_id, "fqdn");
    assert.equal(
      calls.find((c) => c.url.pathname.endsWith("/fqdns") && c.method === "POST").body.port,
      5061,
    );
    await assert.rejects(api.findNumberOrder("request", "+13125550123"), /support review/);
    await assert.rejects(api.releaseNumber("owned", "+13125550123", "connection"), /ownership/);
    assert.equal(calls.filter((c) => c.method === "DELETE").length, 0);
  } finally {
    global.fetch = oldFetch;
  }
});
test("routing failure retries owned number setup without repurchasing", async () => {
  const f = fixture();
  f.breakRouting();
  await f.api.advanceManagedOrder(f.workspace, f.id);
  assert.equal(f.tables.managed_number_orders[0].state, "error");
  f.fixRouting();
  await f.api.advanceManagedOrder(f.workspace, f.id);
  assert.equal(f.purchases(), 1);
  assert.equal(f.routes(), 2);
  assert.equal(f.tables.managed_number_orders[0].state, "ready");
});
test("concurrent provisioning claims one lease and foreign workspaces never reach the carrier", async () => {
  const f = fixture();
  await assert.rejects(f.api.advanceManagedOrder(crypto.randomUUID(), f.id), /not found/);
  await Promise.all([
    f.api.advanceManagedOrder(f.workspace, f.id),
    f.api.advanceManagedOrder(f.workspace, f.id),
  ]);
  assert.equal(f.purchases(), 1);
});
test("an uncertain order with no carrier match is held for review, never resubmitted", async () => {
  const f = fixture();
  Object.assign(f.tables.managed_number_orders[0], {
    state: "review",
    submitted_at: new Date().toISOString(),
    connection_ref: "connection",
  });
  await f.api.advanceManagedOrder(f.workspace, f.id);
  await f.api.advanceManagedOrder(f.workspace, f.id);
  assert.equal(f.purchases(), 0);
  assert.equal(f.tables.managed_number_orders[0].state, "review");
});

test("managed server functions reject non-admin purchases before provider access", async () => {
  const api = loader({
    "@tanstack/react-start": {
      createServerFn: () => {
        let parse = (v) => v;
        const c = {
          middleware: () => c,
          validator: (f) => {
            parse = f;
            return c;
          },
          handler: (f) => (args) => f({ ...args, data: parse(args.data) }),
        };
        return c;
      },
    },
    "@/integrations/supabase/auth-middleware": { requireSupabaseAuth: {} },
  })("src/lib/managed-telephony.functions.ts");
  const context = { supabase: { rpc: async () => ({ data: false }) } };
  await assert.rejects(
    api.purchaseManagedPhoneNumber({
      context,
      data: {
        workspaceId: ws,
        quoteId: crypto.randomUUID(),
        agentId: agent,
        environmentId: env,
        requestId: crypto.randomUUID(),
        acceptCharges: true,
      },
    }),
    /Only workspace admins/,
  );
  await assert.rejects(
    api.getManagedPhoneOverview({ context, data: { workspaceId: ws } }),
    /Workspace access/,
  );
});
