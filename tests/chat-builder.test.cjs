const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");
const { loader } = require("./helpers.cjs");

const builder = loader({})("src/lib/builder-chat.ts");

function profile() {
  return {
    version: 1,
    business: {
      name: "Northstar Plumbing",
      description: "Repairs household plumbing problems.",
      timezone: "America/Chicago",
      language: "en",
    },
    services: [{ id: "plumbing_repairs", name: "Plumbing repairs" }],
    hours: { mode: "not_provided" },
    escalation: { mode: "take_message" },
    prohibitedClaims: ["Never guarantee arrival time."],
  };
}

test("chat proposals stay inside the supported receptionist contract", () => {
  const parsed = builder.builderProposalSchema.parse({
    assistantMessage: "I prepared a receptionist for review.",
    proposedProfile: profile(),
    requestedDestination: "google_sheets",
    questions: [],
    assumptions: ["Business hours were not provided."],
  });
  assert.equal(parsed.proposedProfile.business.language, "en");
  assert.equal(parsed.proposedProfile.escalation.mode, "take_message");
  assert.throws(() =>
    builder.builderProposalSchema.parse({
      ...parsed,
      requestedDestination: "salesforce",
    }),
  );
  assert.throws(() =>
    builder.builderProposalSchema.parse({
      ...parsed,
      proposedProfile: { ...profile(), escalation: { mode: "human_transfer" } },
    }),
  );
});

test("profile summaries expose customer-relevant changes", () => {
  const changes = builder.summarizeProfileChange(null, profile());
  assert.ok(changes.some((change) => change.includes("Northstar Plumbing")));
  assert.ok(changes.some((change) => change.includes("Plumbing repairs")));
  assert.ok(changes.some((change) => change.includes("unknown")));
});

test("developer access is disabled by default and workflow RLS follows the workspace gate", async () => {
  const db = new PGlite();
  const ids = Object.fromEntries(
    ["workspace", "org", "member", "other", "workflow"].map((key) => [key, crypto.randomUUID()]),
  );
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('fixture.actor',true),'')::uuid
      $$;
      grant usage on schema auth to authenticated;
      grant execute on function auth.uid() to authenticated;
      create table auth.users(id uuid primary key);
      create table organizations(id uuid primary key);
      create table org_members(org_id uuid,user_id uuid,primary key(org_id,user_id));
      create table workspaces(id uuid primary key,org_id uuid references organizations);
      create table agents(id uuid primary key);
      create table workflows(id uuid primary key,workspace_id uuid);
      grant select,insert,update,delete on workflows to authenticated;
      alter table workflows enable row level security;
      create policy "members read workflows" on workflows for select to authenticated using(true);
      create policy "admins write workflows" on workflows for all to authenticated using(true) with check(true);
      create function is_staff(_uid uuid) returns boolean language sql stable as $$select false$$;
      create function is_workspace_member(_ws uuid,_min text default 'member') returns boolean language sql stable as $$
        select exists(select 1 from workspaces w join org_members m on m.org_id=w.org_id where w.id=_ws and m.user_id=auth.uid())
      $$;`);
    await db.query("insert into auth.users values($1),($2)", [ids.member, ids.other]);
    await db.query("insert into organizations values($1)", [ids.org]);
    await db.query("insert into workspaces values($1,$2)", [ids.workspace, ids.org]);
    await db.query("insert into org_members values($1,$2)", [ids.org, ids.member]);
    await db.query("insert into workflows values($1,$2)", [ids.workflow, ids.workspace]);
    await db.exec(
      fs.readFileSync(
        "supabase/migrations/20261026050000_chat_builder_and_developer_access.sql",
        "utf8",
      ),
    );

    assert.equal(
      (
        await db.query("select can_use_developer_studio($1,$2) allowed", [
          ids.workspace,
          ids.member,
        ])
      ).rows[0].allowed,
      false,
    );
    await db.query("update workspaces set developer_studio_enabled=true where id=$1", [
      ids.workspace,
    ]);
    assert.equal(
      (
        await db.query("select can_use_developer_studio($1,$2) allowed", [
          ids.workspace,
          ids.member,
        ])
      ).rows[0].allowed,
      true,
    );
    assert.equal(
      (await db.query("select can_use_developer_studio($1,$2) allowed", [ids.workspace, ids.other]))
        .rows[0].allowed,
      false,
    );
    await db.exec(
      `set role authenticated; select set_config('fixture.actor','${ids.member}',false);`,
    );
    assert.equal((await db.query("select count(*)::int count from workflows")).rows[0].count, 1);
    await db.exec(`select set_config('fixture.actor','${ids.other}',false);`);
    assert.equal((await db.query("select count(*)::int count from workflows")).rows[0].count, 0);
  } finally {
    await db.close();
  }
});
