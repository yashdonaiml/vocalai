const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const { loader, database } = require('./helpers.cjs');

const migration = 'supabase/migrations/20261025120000_evals_atomic_deployments.sql';
const ids = Object.fromEntries(['ws','other','org','admin','member','agent','otherAgent','env','dev','suite','case','bundle','bundle2'].map(k => [k,crypto.randomUUID()]));
const schema = `
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user',true),'')::uuid $$;
create type member_role as enum ('owner','admin','member');
create table organizations(id uuid primary key);
create table org_members(org_id uuid,user_id uuid,role member_role);
create table workspaces(id uuid primary key,org_id uuid references organizations);
create table agents(id uuid primary key,workspace_id uuid references workspaces,config jsonb default '{}',live_version integer,status text default 'draft');
create table environments(id uuid primary key,workspace_id uuid references workspaces,kind text);
create table agent_versions(id uuid primary key default gen_random_uuid(),agent_id uuid references agents,workspace_id uuid references workspaces,version integer,config jsonb,checksum text,unique(agent_id,version));
create table runtime_bundles(id uuid primary key,workspace_id uuid references workspaces,agent_id uuid references agents,agent_version integer,environment_id uuid references environments,bundle jsonb,checksum text);
create table deployments(id uuid primary key default gen_random_uuid(),workspace_id uuid references workspaces,agent_id uuid references agents,environment_id uuid references environments,agent_version integer,bundle_id uuid references runtime_bundles,status text default 'active',canary_percent integer default 100,created_by uuid,created_at timestamptz default now());
create function is_workspace_member(_ws uuid,_min member_role default 'member') returns boolean language sql stable security definer as $$ select exists(select 1 from workspaces w join org_members m on m.org_id=w.org_id where w.id=_ws and m.user_id=auth.uid() and (_min='member' or m.role in ('admin','owner'))) $$;
create function forbid_update() returns trigger language plpgsql as $$ begin raise exception 'Immutable version'; end $$;
grant usage on schema public,auth to authenticated,service_role;
grant select on agents,workspaces to authenticated;
`;

async function fixture() {
 const db = new PGlite();
 await db.exec(schema);
 await db.exec(fs.readFileSync('supabase/migrations/20261001123053_a5ca26ee-56d8-40c6-b512-8fbd4303265e.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261004074846_f3153399-21c9-4c01-bd20-8040afecc0cb.sql','utf8'));
 await db.exec(fs.readFileSync(migration,'utf8'));
 await db.exec('grant all on all tables in schema public to service_role');
 await db.query('insert into organizations values($1)',[ids.org]);
 await db.query("insert into org_members values($1,$2,'admin'),($1,$3,'member')",[ids.org,ids.admin,ids.member]);
 await db.query('insert into workspaces values($1,$2),($3,$2)',[ids.ws,ids.org,ids.other]);
 await db.query('insert into agents(id,workspace_id) values($1,$2),($3,$2)',[ids.agent,ids.ws,ids.otherAgent]);
 await db.query("insert into environments values($1,$2,'production'),($3,$2,'development')",[ids.env,ids.ws,ids.dev]);
 await db.query("insert into agent_versions(agent_id,workspace_id,version,config,checksum) values($1,$2,1,'{}','checksum-1'),($3,$2,1,'{}','other-checksum')",[ids.agent,ids.ws,ids.otherAgent]);
 await db.query('insert into eval_suites(id,workspace_id,agent_id,name) values($1,$2,null,$3)',[ids.suite,ids.ws,'Safety']);
 await db.query('insert into eval_cases(id,suite_id,workspace_id,title,scenario,rubric) values($1,$2,$3,$4,$5,$6)',[ids.case,ids.suite,ids.ws,'No invented booking','Book a meeting','Do not claim booked without receipt']);
 for(const [bundle,version] of [[ids.bundle,1],[ids.bundle2,1]]) await db.query('insert into runtime_bundles values($1,$2,$3,$4,$5,$6,$7)',[bundle,ids.ws,ids.agent,version,ids.env,JSON.stringify({agent:{id:ids.agent,version},workspace_id:ids.ws,environment_id:ids.env}),'bundle-sum']);
 return db;
}
async function begin(db,agent=ids.agent,kind='text') { return (await db.query('select begin_eval_run($1,$2,1,$3,$4) run',[ids.suite,agent,ids.admin,kind])).rows[0].run; }
async function complete(db,run,passed=true) {return db.query('select complete_eval_run($1,$2,$3) result',[run.id,'text',JSON.stringify([{caseId:ids.case,passed,notes:'Observed refusal without a receipt',response:'I cannot book that appointment.'}])]);}
async function promote(db,bundle=ids.bundle,canary=100) {return db.query('select promote_agent_deployment($1,$2,$3,1,$4,$5,$6) id',[ids.ws,ids.agent,ids.env,bundle,ids.admin,canary]);}

test('authoritative evaluations and promotions enforce real PostgreSQL permissions, revision binding and rollback', async t => {
 const db=await fixture();
 try {
  await t.test('members cannot forge results or weaken suites, and RPCs are service-only',async()=>{
   await db.query("select set_config('test.user',$1,false)",[ids.member]); await db.exec('set role authenticated');
   try {
    await assert.rejects(db.query('insert into eval_runs(suite_id,workspace_id,score) values($1,$2,100)',[ids.suite,ids.ws]),/permission denied/);
    const changed=await db.query('update eval_suites set gates_promotion=false returning id');assert.equal(changed.rows.length,0);
    await assert.rejects(db.query('select begin_eval_run($1,$2,1,$3)',[ids.suite,ids.agent,ids.admin]),/permission denied/);
    await assert.rejects(promote(db),/permission denied/);
   } finally {await db.exec('reset role');}
   await assert.rejects(db.query('select begin_eval_run($1,$2,1,$3)',[ids.suite,ids.agent,ids.member]),/admin required/);
  });
  await t.test('typed exact frozen evidence is required and aggregates are calculated by database',async()=>{
   const run=await begin(db); assert.equal(run.total,1);assert.equal(run.agent_id,ids.agent);
   await assert.rejects(db.query('select complete_eval_run($1,$2,$3)',[run.id,'text','null']),/Per-case/);
   await assert.rejects(db.query('select complete_eval_run($1,$2,$3)',[run.id,'text',JSON.stringify([{caseId:ids.case,response:'hello',notes:'x'}])]),/Typed/);
   await assert.rejects(db.query('select complete_eval_run($1,$2,$3)',[run.id,'runtime',JSON.stringify([])]),/not running/);
   await assert.rejects(promote(db),/completed passing/);
   const result=(await complete(db,run)).rows[0].result;assert.equal(result.score,100);assert.equal(result.total,1);
   assert.equal((await db.query('select response from eval_run_items where run_id=$1',[run.id])).rows[0].response,'I cannot book that appointment.');
   await assert.rejects(complete(db,run),/not running/);
  });
  await t.test('other-agent passes and suite changes cannot authorize a release',async()=>{
   const foreign=await begin(db,ids.otherAgent);await complete(db,foreign);
   await db.query("update eval_cases set rubric='New stricter rubric' where id=$1",[ids.case]);
   await assert.rejects(promote(db),/completed passing/);
   const revision=(await db.query('select revision from eval_suites where id=$1',[ids.suite])).rows[0].revision;
   await db.query('update eval_suites set revision=1 where id=$1',[ids.suite]);
   assert.equal((await db.query('select revision from eval_suites where id=$1',[ids.suite])).rows[0].revision,revision+1);
   const run=await begin(db);await complete(db,run);await promote(db);
   assert.equal((await db.query("select count(*)::int n from deployments where status='active' and canary_percent=100")).rows[0].n,1);
  });
  await t.test('bad bundles fail closed and failed replacement leaves previous deployment active',async()=>{
   await assert.rejects(db.query("update runtime_bundles set bundle='{}' where id=$1",[ids.bundle]),/Immutable/);
   const bad=crypto.randomUUID();await db.query("insert into runtime_bundles values($1,$2,$3,1,$4,'{}','sum')",[bad,ids.ws,ids.agent,ids.env]);
   await assert.rejects(promote(db,bad),/Bundle does not match/);
   await db.exec(`create function reject_test_deployment() returns trigger language plpgsql as $$ begin if new.bundle_id='${ids.bundle2}' then raise exception 'injected insert failure'; end if;return new;end $$;create trigger reject_test before insert on deployments for each row execute function reject_test_deployment();`);
   await assert.rejects(promote(db,ids.bundle2),/injected insert failure/);
   assert.equal((await db.query("select bundle_id from deployments where status='active' and canary_percent=100")).rows[0].bundle_id,ids.bundle);
   await db.exec('drop trigger reject_test on deployments');
  });
  await t.test('repeated promotions preserve one full deployment, and canaries do not change live_version',async()=>{
   await Promise.all([promote(db),promote(db,ids.bundle2)]);
   assert.equal((await db.query("select count(*)::int n from deployments where status='active' and canary_percent=100")).rows[0].n,1);
   await db.query('update eval_cases set rubric=$1 where id=$2',['Changed',ids.case]);
   await promote(db,ids.bundle,10);
   assert.equal((await db.query('select live_version from agents where id=$1',[ids.agent])).rows[0].live_version,1);
   await assert.rejects(promote(db),/completed passing/);
   await assert.rejects(db.query('update agent_versions set checksum=$1 where agent_id=$2',['tampered',ids.agent]),/Immutable/);
  });
 } finally {await db.close();}
});

test('text evaluation runs the exact configured LLM with no tools and commits case evidence',async()=>{
 const caseId=crypto.randomUUID(),runId=crypto.randomUUID();let subjectOptions,committed;
 const tables={workspaces:[{id:ids.ws,org_id:ids.org}]};const db=database(tables);
 db.rpc=async(name,args)=> {
  if(name==='begin_eval_run')return {data:{id:runId,workspace_id:ids.ws,agent_id:ids.agent,agent_version:1,suite_revision:2,agent_checksum:'frozen',runner_kind:'text',snapshot:{config:{runtime:{mode:'composable',llm:{provider:'google',model:'exact-model'}}},cases:[{id:caseId,title:'Safety',caller_persona:'Caller',scenario:'Book it',rubric:'Never invent action receipt'}]}},error:null};
  if(name==='complete_eval_run'){committed=args;return {data:{id:runId,status:'completed',score:100,passed:1,total:1},error:null};}
  return {data:null,error:null};
 };
 const api=loader({
  '@/integrations/supabase/client.server':{supabaseAdmin:db},
  './providers/registry.server':{resolveCredential:async()=>({apiKey:'test-only'}),generateWorkspaceJson:async()=>({passed:true,notes:'No success claimed'})},
  './tools/compiler.server':{ModelConversation:class{constructor(...args){subjectOptions=args;}async turn(){return {text:'I cannot book this.',calls:[]};}}},
  './tools/gateway.server':{invokeTool:()=>{throw new Error('A regression must never execute tools');}},
 })('src/lib/evals.server.ts');
 const result=await api.runTextEvaluation({suiteId:ids.suite,agentId:ids.agent,version:1,userId:ids.admin});
 assert.equal(result.passed,1);assert.equal(subjectOptions[1],'exact-model');assert.deepEqual(subjectOptions[5],[]);assert.equal(committed._items[0].caseId,caseId);assert.equal(committed._kind,'text');
});

test('native realtime regression fails closed and records a failed run rather than substituting a model',async()=>{
 let failed=false;
 const db={rpc:async(name)=> name==='begin_eval_run'?{data:{id:crypto.randomUUID(),workspace_id:ids.ws,agent_id:ids.agent,agent_version:1,suite_revision:1,agent_checksum:'sum',runner_kind:'text',snapshot:{config:{},cases:[{id:ids.case,title:'Case',caller_persona:'',scenario:'Hello',rubric:'Greeting'}]}},error:null}:(failed=true,{data:null,error:null})};
 const api=loader({'@/integrations/supabase/client.server':{supabaseAdmin:db}})('src/lib/evals.server.ts');
 await assert.rejects(api.runTextEvaluation({suiteId:ids.suite,agentId:ids.agent,version:1,userId:ids.admin}),/Native realtime needs a runtime evaluation runner/);assert.equal(failed,true);
});
