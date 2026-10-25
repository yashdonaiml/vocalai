const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');

const ws = crypto.randomUUID(), other = crypto.randomUUID(), agent = crypto.randomUUID(), env = crypto.randomUUID();
const schema = `
create role anon; create role authenticated; create role service_role bypassrls;
create table public.workspaces(id uuid primary key);
create table public.agents(id uuid primary key, workspace_id uuid not null references public.workspaces);
create table public.environments(id uuid primary key, workspace_id uuid not null references public.workspaces);
create table public.phone_numbers(id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces,
  e164 text unique not null, agent_id uuid references public.agents, environment_id uuid references public.environments, status text default 'pending');
create table public.conversations(id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces,
  status text not null default 'active', summary text, started_at timestamptz not null default now(), ended_at timestamptz, duration_seconds int);
create table public.conversation_turns(id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.conversations,
  workspace_id uuid not null references public.workspaces, seq int not null, role text not null, content text not null, unique(conversation_id,seq));
create table public.usage_events(id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces,
  conversation_id uuid references public.conversations, kind text not null, model text, quantity numeric not null, unit text not null);
create table public.tool_pending_actions(id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces, session_id text, status text);
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on public.phone_numbers to authenticated;
grant all on all tables in schema public to service_role;
`;

test('inbound migration enforces tenant routing and commits event batches exactly once in PostgreSQL', async (t) => {
  const db = new PGlite();
  try {
    await db.exec(schema);
    await db.exec(fs.readFileSync('supabase/migrations/20261021120000_inbound_telephony.sql', 'utf8'));
    await db.query('insert into workspaces values ($1), ($2)', [ws, other]);
    await db.query('insert into agents values ($1,$2)', [agent, ws]);
    await db.query('insert into environments values ($1,$2)', [env, ws]);

    await t.test('cross-workspace agent/environment references are rejected by the database', async () => {
      await assert.rejects(db.query('insert into phone_numbers(workspace_id,e164,agent_id,environment_id) values ($1,$2,$3,$4)', [other, '+15551234567', agent, env]), /outside this workspace/);
      const { rows } = await db.query('insert into phone_numbers(workspace_id,e164,agent_id,environment_id) values ($1,$2,$3,$4) returning id', [ws, '+15551234567', agent, env]);
      await assert.rejects(db.query('update phone_numbers set workspace_id=$1 where id=$2', [other, rows[0].id]), /outside this workspace/);
    });

    await t.test('browser roles cannot write phone routes or call the runtime ingestion function', async () => {
      await db.exec('set role authenticated');
      try {
        await assert.rejects(db.query('insert into phone_numbers(workspace_id,e164) values ($1,$2)', [ws, '+15551234568']), /permission denied/);
        await assert.rejects(db.query('select ingest_runtime_events($1,$2,$3)', [crypto.randomUUID(), crypto.randomUUID(), '[]']), /permission denied/);
      } finally { await db.exec('reset role'); }
    });

    await t.test('duplicate replies, late end events and concurrent batches do not duplicate transcript or billing', async () => {
      const id = crypto.randomUUID(), batch = crypto.randomUUID();
      await db.query("insert into conversations(id,workspace_id,started_at) values ($1,$2,now()-interval '2 minutes')", [id, ws]);
      await db.query("insert into tool_pending_actions(workspace_id,session_id,status) values ($1,$2,'pending')", [ws, id]);
      const input = JSON.stringify([{ type: 'turn', role: 'user', content: 'Hello', workspace_id: other }, { type: 'turn', role: 'assistant', content: 'How can I help?' }]);
      await db.exec('set role service_role');
      assert.equal((await db.query('select ingest_runtime_events($1,$2,$3) as accepted', [id, batch, input])).rows[0].accepted, true);
      assert.equal((await db.query('select ingest_runtime_events($1,$2,$3) as accepted', [id, batch, input])).rows[0].accepted, false);
      await Promise.all([0, 1].map((n) => db.query('select ingest_runtime_events($1,$2,$3)', [id, crypto.randomUUID(), JSON.stringify([{ type: 'turn', role: 'user', content: `turn ${n}` }])])));
      const end = JSON.stringify([{ type: 'end', reason: 'caller_left' }]);
      await db.query('select ingest_runtime_events($1,$2,$3)', [id, crypto.randomUUID(), end]);
      assert.equal((await db.query('select ingest_runtime_events($1,$2,$3) as accepted', [id, crypto.randomUUID(), end])).rows[0].accepted, false);
      await db.exec('reset role');
      const turns = (await db.query('select seq, workspace_id from conversation_turns where conversation_id=$1 order by seq', [id])).rows;
      assert.deepEqual(turns.map((r) => r.seq), [0, 1, 2, 3]);
      assert.ok(turns.every((r) => r.workspace_id === ws));
      assert.equal((await db.query("select count(*)::int as n from usage_events where conversation_id=$1 and kind='voice_minutes'", [id])).rows[0].n, 1);
      assert.equal((await db.query('select status from conversations where id=$1', [id])).rows[0].status, 'completed');
      assert.equal((await db.query('select status from tool_pending_actions where session_id=$1', [id])).rows[0].status, 'invalidated');
    });

    await t.test('a failed batch rolls back its turns and can be retried with the same batch ID', async () => {
      const id = crypto.randomUUID(), batch = crypto.randomUUID();
      await db.query('insert into conversations(id,workspace_id) values ($1,$2)', [id, ws]);
      const first = { type: 'turn', role: 'user', content: 'Please help' };
      await assert.rejects(db.query('select ingest_runtime_events($1,$2,$3)', [id, batch, JSON.stringify([first, { type: 'usage', kind: 'test', quantity: 'invalid', unit: 'tokens' }])]), /invalid input/);
      assert.equal((await db.query('select count(*)::int as n from conversation_turns where conversation_id=$1', [id])).rows[0].n, 0);
      await db.query('select ingest_runtime_events($1,$2,$3)', [id, batch, JSON.stringify([first, { type: 'end', reason: 'runtime_error' }])]);
      assert.equal((await db.query('select status from conversations where id=$1', [id])).rows[0].status, 'failed');
      assert.equal((await db.query('select count(*)::int as n from conversation_turns where conversation_id=$1', [id])).rows[0].n, 1);
    });
  } finally { await db.close(); }
});
