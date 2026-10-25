const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const { loader, database } = require('./helpers.cjs');

const ws = crypto.randomUUID(), other = crypto.randomUUID(), org = crypto.randomUUID(), otherOrg = crypto.randomUUID();
const member = crypto.randomUUID(), admin = crypto.randomUUID();
const schema = `
create role anon; create role authenticated; create role service_role bypassrls;
create table workspaces(id uuid primary key,org_id uuid not null);
create table memberships(ws uuid,person uuid,role text);
create function is_workspace_member(_ws uuid,_min text default 'member') returns boolean language sql stable security definer as $$
 select exists(select 1 from memberships where ws=_ws and person=nullif(current_setting('app.user',true),'')::uuid and (_min='member' or role='admin')) $$;
create table security_policies(org_id uuid primary key,record_calls boolean default false,redact_pii boolean default true,retention_days int default 90,transcript_access text default 'member');
create table conversations(id uuid primary key default gen_random_uuid(),workspace_id uuid,started_at timestamptz default now(),summary text,caller_number text);
create table conversation_turns(id uuid primary key default gen_random_uuid(),workspace_id uuid,conversation_id uuid,content text);
create table conversation_tags(id uuid primary key default gen_random_uuid(),workspace_id uuid,conversation_id uuid,tag text);
create table tool_invocations(id uuid primary key default gen_random_uuid(),workspace_id uuid,conversation_id uuid,session_id text,started_at timestamptz default now(),input_redacted jsonb,output_redacted jsonb);
create table tool_pending_actions(id uuid primary key default gen_random_uuid(),workspace_id uuid,invocation_id uuid references tool_invocations(id),frozen_arguments text,summary text,evidence jsonb);
create table workflow_runs(id uuid primary key default gen_random_uuid(),workspace_id uuid,conversation_id uuid,created_at timestamptz default now(),steps jsonb default '[]',error text);
create table tool_attempts(id uuid primary key default gen_random_uuid(),workspace_id uuid,invocation_id uuid);
create table tool_policy_decisions(id uuid primary key default gen_random_uuid(),workspace_id uuid,invocation_id uuid);
create table usage_events(id uuid primary key default gen_random_uuid(),conversation_id uuid,quantity numeric);
grant usage on schema public to authenticated,service_role;
grant select on conversations,conversation_turns,conversation_tags,tool_invocations,workflow_runs,tool_attempts,tool_policy_decisions to authenticated;
grant all on all tables in schema public to service_role;
alter table conversations enable row level security; alter table conversation_turns enable row level security; alter table conversation_tags enable row level security;
alter table tool_invocations enable row level security; alter table workflow_runs enable row level security; alter table tool_attempts enable row level security; alter table tool_policy_decisions enable row level security;
create policy membership on conversations for select to authenticated using(is_workspace_member(workspace_id));
create policy membership on conversation_turns for select to authenticated using(is_workspace_member(workspace_id));
create policy membership on conversation_tags for select to authenticated using(is_workspace_member(workspace_id));
create policy membership on tool_invocations for select to authenticated using(is_workspace_member(workspace_id));
create policy membership on workflow_runs for select to authenticated using(is_workspace_member(workspace_id));
create policy membership on tool_attempts for select to authenticated using(is_workspace_member(workspace_id));
create policy membership on tool_policy_decisions for select to authenticated using(is_workspace_member(workspace_id));
`;

test('privacy migration enforces redaction, tenant/admin reads and irreversible content expiry in PostgreSQL', async (t) => {
  const db = new PGlite();
  try {
    await db.exec(schema);
    await db.query('insert into workspaces values($1,$2),($3,$4)',[ws,org,other,otherOrg]);
    await db.query("insert into memberships values($1,$2,'member'),($1,$3,'admin')",[ws,member,admin]);
    await db.query("insert into security_policies(org_id,transcript_access,retention_days) values($1,'admin',30)",[org]);
    const initial = crypto.randomUUID();
    await db.query('insert into conversations(id,workspace_id,summary,caller_number) values($1,$2,$3,$4)',[initial,ws,'Email alice@example.com or +1 (312) 555-0199','+13125550199']);
    await db.exec(fs.readFileSync('supabase/migrations/20261025110000_privacy_enforcement.sql','utf8'));

    await t.test('existing and new service-role content is masked before storage, including summaries and artifacts',async()=>{
      assert.match((await db.query('select summary from conversations where id=$1',[initial])).rows[0].summary,/REDACTED_EMAIL/);
      await db.exec('set role service_role');
      await db.query('insert into conversation_turns(workspace_id,conversation_id,content) values($1,$2,$3)',[ws,initial,'bob@example.com +1 312 555 0199 card 4111 1111 1111 1111']);
      await db.query('insert into workflow_runs(workspace_id,conversation_id,steps,error) values($1,$2,$3,$4)',[ws,initial,JSON.stringify([{detail:'bob@example.com',phone:13125550199}]),'Call +13125550199']);
      await db.exec('reset role');
      const text = JSON.stringify((await db.query('select content from conversation_turns')).rows);
      assert.doesNotMatch(text,/bob@example|312|4111/);
      const workflow=JSON.stringify((await db.query('select steps,error from workflow_runs')).rows);
      assert.doesNotMatch(workflow,/bob@example|13125550199/);
      await assert.rejects(db.query('insert into conversation_turns(workspace_id,conversation_id,content) values($1,$2,$3)',[other,initial,'Tenant mismatch']),/outside this workspace/);
    });
    await t.test('admin-only policy restricts summaries, transcripts and tool/workflow payloads even with permissive membership policy',async()=>{
      await db.query("select set_config('app.user',$1,false)",[member]);
      await db.exec('set role authenticated');
      for(const table of ['conversations','conversation_turns','workflow_runs']) assert.equal((await db.query(`select count(*)::int n from ${table}`)).rows[0].n,0);
      await assert.rejects(db.query('select purge_expired_call_data()'),/permission denied/);
      await db.exec('reset role');
      await db.query("select set_config('app.user',$1,false)",[admin]);
      await db.exec('set role authenticated');
      assert.equal((await db.query('select count(*)::int n from conversation_turns')).rows[0].n,1);
      await db.exec('reset role');
    });
    await t.test('expiry hides data before scheduler and purges callback secrets and newer child artifacts without deleting usage',async()=>{
      const inv=crypto.randomUUID();
      await db.query('insert into tool_invocations(id,workspace_id,conversation_id,session_id,input_redacted,output_redacted) values($1,$2,$3,$4,$5,$5)',[inv,ws,initial,initial,JSON.stringify({message:'saved'})]);
      await db.query('insert into tool_pending_actions(workspace_id,invocation_id,frozen_arguments,summary) values($1,$2,$3,$4)',[ws,inv,'encrypted callback contact','Frozen details']);
      await db.query('insert into usage_events(conversation_id,quantity) values($1,2)',[initial]);
      await db.query("update conversations set started_at=now()-interval '31 days' where id=$1",[initial]);
      await db.exec('set role authenticated');
      assert.equal((await db.query('select count(*)::int n from conversations')).rows[0].n,0);
      assert.equal((await db.query('select count(*)::int n from tool_invocations')).rows[0].n,0);
      await db.exec('reset role');
      await assert.rejects(db.query('insert into conversation_turns(workspace_id,conversation_id,content) values($1,$2,$3)',[ws,initial,'Late PII']),/retention expired/);
      await db.exec('set role service_role');
      assert.equal((await db.query('select purge_expired_call_data() n')).rows[0].n,1);
      assert.equal((await db.query('select purge_expired_call_data() n')).rows[0].n,0);
      await db.exec('reset role');
      assert.equal((await db.query('select count(*)::int n from conversation_turns')).rows[0].n,0);
      assert.equal((await db.query('select count(*)::int n from tool_pending_actions')).rows[0].n,0);
      const row=(await db.query('select summary,caller_number,privacy_purged_at from conversations where id=$1',[initial])).rows[0];
      assert.equal(row.summary,null); assert.equal(row.caller_number,null); assert.ok(row.privacy_purged_at);
      assert.equal((await db.query('select output_redacted from tool_invocations')).rows[0].output_redacted,null);
      assert.deepEqual((await db.query('select steps from workflow_runs')).rows[0].steps,[]);
      assert.equal((await db.query('select quantity from usage_events')).rows[0].quantity,'2');
      await assert.rejects(db.query('update security_policies set record_calls=true'),/audio_recording_unavailable/);
    });
    await t.test('enabling masking applies immediately to retained existing content',async()=>{
      await db.query('update security_policies set redact_pii=false where org_id=$1',[org]);
      const c=(await db.query('insert into conversations(workspace_id,summary) values($1,$2) returning id',[ws,'new@example.com'])).rows[0].id;
      await db.query('update security_policies set redact_pii=true where org_id=$1',[org]);
      assert.equal((await db.query('select summary from conversations where id=$1',[c])).rows[0].summary,'[REDACTED_EMAIL]');
    });
  } finally { await db.close(); }
});

test('service-role API export denies admin-only policy and fails closed on missing workspace/policy errors',async()=>{
  const tables={workspaces:[{id:ws,org_id:org}],security_policies:[{org_id:org,transcript_access:'admin',retention_days:30,redact_pii:true}]};
  const db=database(tables);
  const api=loader({'@/integrations/supabase/client.server':{supabaseAdmin:db}})('src/lib/privacy.server.ts');
  await assert.rejects(api.apiCallPrivacy(ws),e=>e instanceof Response && e.status===403);
  await assert.rejects(api.apiCallPrivacy(other),/Could not load/);
  tables.security_policies[0].transcript_access='member';
  const policy=await api.apiCallPrivacy(ws); assert.equal(policy.retentionDays,30); assert.ok(Date.parse(policy.cutoff)<Date.now());
});
