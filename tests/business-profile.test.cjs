const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");
const { loader } = require("./helpers.cjs");

const profileApi = loader({})("src/lib/business-profile.ts");

function profile(overrides = {}) {
  return {
    version: 1,
    business: {
      name: "Northwind Dental",
      description: "Family dental care supplied by the owner.",
      timezone: "America/Chicago",
      language: "en",
    },
    services: [{ id: "cleaning", name: "Dental cleaning", description: "Routine cleaning." }],
    hours: { mode: "not_provided" },
    escalation: { mode: "take_message" },
    prohibitedClaims: ["Do not claim same-day availability."],
    ...overrides,
  };
}

test("business profile exposes only engine-supported language and escalation choices", () => {
  assert.deepEqual(profileApi.BUSINESS_PROFILE_LANGUAGE_OPTIONS, [
    { value: "en", label: "English" },
  ]);
  assert.deepEqual(profileApi.BUSINESS_PROFILE_ESCALATION_OPTIONS, [
    { value: "take_message", label: "Take a message for my team" },
  ]);
  assert.throws(
    () =>
      profileApi.parseBusinessProfile(
        profile({
          business: { ...profile().business, language: "es" },
        }),
      ),
    /Invalid literal value|Invalid input/,
  );
  assert.throws(
    () =>
      profileApi.parseBusinessProfile(
        profile({
          escalation: { mode: "human_transfer" },
        }),
      ),
    /Invalid literal value|Invalid input/,
  );
});

test("scheduled hours require a real timezone and non-overlapping forward ranges", () => {
  const emptyWeek = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
  assert.throws(
    () =>
      profileApi.parseBusinessProfile(
        profile({
          business: { ...profile().business, timezone: "Central-ish" },
        }),
      ),
    /valid IANA timezone/,
  );
  assert.throws(
    () =>
      profileApi.parseBusinessProfile(
        profile({
          hours: {
            mode: "schedule",
            weekly: {
              ...emptyWeek,
              mon: [
                { open: "09:00", close: "12:00" },
                { open: "11:00", close: "17:00" },
              ],
            },
          },
        }),
      ),
    /cannot overlap/,
  );
  assert.equal(
    profileApi.parseBusinessProfile(
      profile({
        hours: {
          mode: "schedule",
          weekly: { ...emptyWeek, mon: [{ open: "09:00", close: "17:00" }] },
        },
      }),
    ).hours.mode,
    "schedule",
  );
});

test("compiler stores the exact profile, creates a flow, and marks missing hours unknown", () => {
  const input = profile({ hours: { mode: "not_provided" } });
  const config = profileApi.compileBusinessProfile(input);
  assert.deepEqual(config.business_profile, input);
  assert.equal(config.business_profile_version, 1);
  assert.equal(config.flow.enabled, true);
  assert.equal(config.flow.nodes[0].type, "start");
  assert.match(config.instructions, /Business hours were not provided/);
  assert.match(config.instructions, /never infer whether the business is open/);
  assert.match(config.instructions, /same-day availability/);
  assert.doesNotMatch(config.instructions, /Monday|9 AM|open now/i);
});

test("readiness reports business and behavior independently", () => {
  assert.deepEqual(profileApi.businessProfileReadiness(profile()), {
    business: true,
    behavior: true,
    issues: [],
  });
  const result = profileApi.businessProfileReadiness(profile({ services: [] }));
  assert.equal(result.business, false);
  assert.equal(result.behavior, true);
  assert.ok(result.issues.length > 0);
});

test("business profile migration updates the draft and setup revision atomically", async () => {
  const db = new PGlite();
  const ids = Object.fromEntries(
    ["workspace", "admin", "member", "setup", "agent"].map((key) => [key, crypto.randomUUID()]),
  );
  const ownerProfile = profile();
  const compiled = {
    business_profile: ownerProfile,
    business_profile_version: 1,
    instructions: "compiled fixture",
  };
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create table workspaces(id uuid primary key);
      create table agents(id uuid primary key, workspace_id uuid references workspaces, name text, description text, config jsonb, status text, live_version integer);
      create table agent_setup_runs(id uuid primary key, workspace_id uuid, agent_id uuid, revision integer, snapshot_hash text, updated_at timestamptz default now());
      create function release_actor_is_admin(_workspace uuid,_actor uuid) returns boolean language sql stable as $$
        select _workspace='${ids.workspace}'::uuid and _actor='${ids.admin}'::uuid
      $$;`);
    await db.query("insert into workspaces values($1)", [ids.workspace]);
    await db.query(
      "insert into agents values($1,$2,'Old name','Old description','{}','draft',null)",
      [ids.agent, ids.workspace],
    );
    await db.query("insert into agent_setup_runs values($1,$2,$3,1,'old',now())", [
      ids.setup,
      ids.workspace,
      ids.agent,
    ]);
    await db.exec(
      fs.readFileSync("supabase/migrations/20261026040000_business_profile_builder.sql", "utf8"),
    );

    await assert.rejects(
      db.query("select save_business_profile_setup($1,$2,$3,1,$4,$5,$6)", [
        ids.workspace,
        ids.setup,
        ids.member,
        JSON.stringify(ownerProfile),
        JSON.stringify(compiled),
        "new",
      ]),
      /admin required/i,
    );
    await assert.rejects(
      db.query("select save_business_profile_setup($1,$2,$3,2,$4,$5,$6)", [
        ids.workspace,
        ids.setup,
        ids.admin,
        JSON.stringify(ownerProfile),
        JSON.stringify(compiled),
        "new",
      ]),
      /changed/i,
    );

    const saved = await db.query("select save_business_profile_setup($1,$2,$3,1,$4,$5,$6) result", [
      ids.workspace,
      ids.setup,
      ids.admin,
      JSON.stringify(ownerProfile),
      JSON.stringify(compiled),
      "new",
    ]);
    assert.equal(saved.rows[0].result.revision, 2);
    const agent = (
      await db.query("select name,description,config from agents where id=$1", [ids.agent])
    ).rows[0];
    assert.equal(agent.name, ownerProfile.business.name);
    assert.deepEqual(agent.config.business_profile, ownerProfile);
    assert.equal(
      (await db.query("select snapshot_hash from agent_setup_runs where id=$1", [ids.setup]))
        .rows[0].snapshot_hash,
      "new",
    );
  } finally {
    await db.close();
  }
});
