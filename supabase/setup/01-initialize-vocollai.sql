-- VOCOLLAI: initialize a fresh Supabase project (all repository migrations).
-- Generated 2026-10-22. Select the intended Supabase project and run as postgres.
-- Run ONCE. Do not run the original migrations separately after this succeeds.
-- This file contains no credentials and does not purchase or activate phone numbers.
-- Any error aborts this transaction; no partial application should be committed.
BEGIN;
SET LOCAL search_path = public, extensions;
SELECT pg_advisory_xact_lock(hashtext('vocollai.initial-schema'));
DO $vocollai_preflight$
BEGIN
  IF to_regclass('auth.users') IS NULL OR to_regclass('storage.objects') IS NULL THEN
    RAISE EXCEPTION 'This script requires a Supabase database with auth and storage schemas.';
  END IF;
  IF to_regclass('public.user_roles') IS NOT NULL
     OR to_regclass('public.organizations') IS NOT NULL
     OR to_regclass('public.workspaces') IS NOT NULL
     OR to_regclass('public.agents') IS NOT NULL
     OR to_regclass('public.phone_numbers') IS NOT NULL
     OR to_regtype('public.app_role') IS NOT NULL THEN
    RAISE EXCEPTION 'An vocollai schema already exists. STOP: do not rerun initialization or drop tables. Inspect applied migrations first.';
  END IF;
END
$vocollai_preflight$;

-- BEGIN MIGRATION 01/24: 20261001092758_2c940d02-70e0-4c21-bc96-9a577db79621.sql
-- SHA256: a2c4ba48a1da0f542e5091d3af4e0cae5bd21824ac570d4e010adf3d91fdff73
create extension if not exists vector;

create type public.app_role as enum ('admin', 'operator', 'user');
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.user_roles where user_id = _user_id and role = _role) $$;
create policy "own roles readable" on public.user_roles for select to authenticated using (user_id = auth.uid());

create type public.member_role as enum ('owner', 'admin', 'member');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
create table public.org_members (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role member_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now()
);
create table public.environments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  kind text not null default 'development',
  created_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create or replace function public.is_org_member(_org uuid, _min member_role default 'member')
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.org_members m where m.org_id = _org and m.user_id = auth.uid()
      and (case _min when 'member' then true
                     when 'admin' then m.role in ('owner','admin')
                     else m.role = 'owner' end)
  )
$$;
create or replace function public.is_workspace_member(_ws uuid, _min member_role default 'member')
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.workspaces w where w.id = _ws and public.is_org_member(w.org_id, _min)) $$;

grant select, insert, update, delete on public.organizations, public.org_members, public.workspaces, public.environments to authenticated;
grant all on public.organizations, public.org_members, public.workspaces, public.environments to service_role;
alter table public.organizations enable row level security;
alter table public.org_members enable row level security;
alter table public.workspaces enable row level security;
alter table public.environments enable row level security;

create policy "org read" on public.organizations for select to authenticated using (public.is_org_member(id));
create policy "org update" on public.organizations for update to authenticated using (public.is_org_member(id, 'admin'));
create policy "members read" on public.org_members for select to authenticated using (public.is_org_member(org_id));
create policy "members manage" on public.org_members for all to authenticated using (public.is_org_member(org_id, 'admin')) with check (public.is_org_member(org_id, 'admin'));
create policy "ws read" on public.workspaces for select to authenticated using (public.is_org_member(org_id));
create policy "ws manage" on public.workspaces for all to authenticated using (public.is_org_member(org_id, 'admin')) with check (public.is_org_member(org_id, 'admin'));
create policy "env read" on public.environments for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "env manage" on public.environments for all to authenticated using (public.is_workspace_member(workspace_id, 'admin')) with check (public.is_workspace_member(workspace_id, 'admin'));

create or replace function public.create_organization(_org_name text, _workspace_name text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare _org uuid; _ws uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.organizations(name, created_by) values (_org_name, auth.uid()) returning id into _org;
  insert into public.org_members(org_id, user_id, role) values (_org, auth.uid(), 'owner');
  insert into public.workspaces(org_id, name) values (_org, _workspace_name) returning id into _ws;
  insert into public.environments(workspace_id, name, kind) values (_ws, 'Development', 'development'), (_ws, 'Production', 'production');
  return _ws;
end $$;
revoke all on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;

create table public.provider_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null,
  label text not null,
  key_hint text not null,
  key_ciphertext text not null,
  created_by uuid not null,
  created_at timestamptz not null default now()
);
grant all on public.provider_accounts to service_role;
grant select (id, org_id, provider, label, key_hint, created_at) on public.provider_accounts to authenticated;
alter table public.provider_accounts enable row level security;
create policy "provider read" on public.provider_accounts for select to authenticated using (public.is_org_member(org_id));

create table public.agents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '',
  status text not null default 'draft',
  config jsonb not null default '{}'::jsonb,
  live_version int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.agent_versions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  version int not null,
  config jsonb not null,
  checksum text not null,
  published_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (agent_id, version)
);
grant select, insert, update, delete on public.agents to authenticated;
grant select, insert on public.agent_versions to authenticated;
grant all on public.agents, public.agent_versions to service_role;
alter table public.agents enable row level security;
alter table public.agent_versions enable row level security;
create policy "agents rw" on public.agents for all to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "versions read" on public.agent_versions for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "versions insert" on public.agent_versions for insert to authenticated with check (public.is_workspace_member(workspace_id));

create table public.knowledge_bases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '',
  created_at timestamptz not null default now()
);
create table public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  knowledge_base_id uuid not null references public.knowledge_bases(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null,
  name text not null,
  storage_path text,
  url text,
  status text not null default 'pending',
  error text,
  chunk_count int not null default 0,
  created_at timestamptz not null default now()
);
create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.knowledge_sources(id) on delete cascade,
  knowledge_base_id uuid not null references public.knowledge_bases(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  embedding vector(3072) not null,
  created_at timestamptz not null default now()
);
create index knowledge_chunks_embedding_idx on public.knowledge_chunks using hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops);
create index knowledge_chunks_kb_idx on public.knowledge_chunks (knowledge_base_id);
create table public.agent_knowledge_bases (
  agent_id uuid not null references public.agents(id) on delete cascade,
  knowledge_base_id uuid not null references public.knowledge_bases(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  primary key (agent_id, knowledge_base_id)
);
grant select, insert, update, delete on public.knowledge_bases, public.knowledge_sources, public.agent_knowledge_bases to authenticated;
grant select, delete on public.knowledge_chunks to authenticated;
grant all on public.knowledge_bases, public.knowledge_sources, public.knowledge_chunks, public.agent_knowledge_bases to service_role;
alter table public.knowledge_bases enable row level security;
alter table public.knowledge_sources enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.agent_knowledge_bases enable row level security;
create policy "kb rw" on public.knowledge_bases for all to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "src rw" on public.knowledge_sources for all to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "chunks read" on public.knowledge_chunks for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "chunks delete" on public.knowledge_chunks for delete to authenticated using (public.is_workspace_member(workspace_id));
create policy "akb rw" on public.agent_knowledge_bases for all to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

create or replace function public.match_chunks(_kb_ids uuid[], _embedding vector(3072), _k int default 5)
returns table (id uuid, source_id uuid, content text, similarity float)
language sql stable set search_path = public
as $$
  select c.id, c.source_id, c.content,
         1 - (c.embedding::halfvec(3072) <=> _embedding::halfvec(3072)) as similarity
  from public.knowledge_chunks c
  where c.knowledge_base_id = any(_kb_ids)
  order by c.embedding::halfvec(3072) <=> _embedding::halfvec(3072)
  limit least(greatest(_k, 1), 20)
$$;
grant execute on function public.match_chunks(uuid[], vector, int) to authenticated, service_role;

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete set null,
  agent_version int,
  channel text not null default 'web_test',
  started_by uuid,
  status text not null default 'completed',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds int,
  summary text
);
create table public.conversation_turns (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  seq int not null,
  role text not null,
  content text not null,
  created_at timestamptz not null default now()
);
create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  kind text not null,
  provider text not null default 'managed',
  model text,
  quantity numeric not null default 0,
  unit text not null,
  created_at timestamptz not null default now()
);
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  actor_id uuid,
  action text not null,
  target text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
grant select on public.conversations, public.conversation_turns, public.usage_events, public.audit_events to authenticated;
grant insert on public.audit_events to authenticated;
grant all on public.conversations, public.conversation_turns, public.usage_events, public.audit_events to service_role;
alter table public.conversations enable row level security;
alter table public.conversation_turns enable row level security;
alter table public.usage_events enable row level security;
alter table public.audit_events enable row level security;
create policy "conv read" on public.conversations for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "turns read" on public.conversation_turns for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "usage read" on public.usage_events for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "audit read" on public.audit_events for select to authenticated using ((org_id is not null and public.is_org_member(org_id, 'admin')) or (workspace_id is not null and public.is_workspace_member(workspace_id, 'admin')));
create policy "audit insert" on public.audit_events for insert to authenticated with check (actor_id = auth.uid() and ((workspace_id is not null and public.is_workspace_member(workspace_id)) or (org_id is not null and public.is_org_member(org_id))));

create policy "knowledge upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'knowledge' and public.is_workspace_member(((storage.foldername(name))[1])::uuid));
create policy "knowledge read" on storage.objects for select to authenticated
  using (bucket_id = 'knowledge' and public.is_workspace_member(((storage.foldername(name))[1])::uuid));
create policy "knowledge delete" on storage.objects for delete to authenticated
  using (bucket_id = 'knowledge' and public.is_workspace_member(((storage.foldername(name))[1])::uuid));
-- END MIGRATION 20261001092758_2c940d02-70e0-4c21-bc96-9a577db79621.sql

-- BEGIN MIGRATION 02/24: 20261001092823_06b70245-283e-49be-82dd-6fd9478999cf.sql
-- SHA256: 0f253d0cbeced0f6b2ad9905ec0280aecc9eaeb78426dc6cdfe2ce984ad37bb0
create schema if not exists extensions;
alter extension vector set schema extensions;

revoke execute on function public.has_role(uuid, app_role) from public, anon;
revoke execute on function public.is_org_member(uuid, member_role) from public, anon;
revoke execute on function public.is_workspace_member(uuid, member_role) from public, anon;
grant execute on function public.has_role(uuid, app_role) to authenticated, service_role;
grant execute on function public.is_org_member(uuid, member_role) to authenticated, service_role;
grant execute on function public.is_workspace_member(uuid, member_role) to authenticated, service_role;

create or replace function public.match_chunks(_kb_ids uuid[], _embedding extensions.vector(3072), _k int default 5)
returns table (id uuid, source_id uuid, content text, similarity float)
language sql stable set search_path = public, extensions
as $$
  select c.id, c.source_id, c.content,
         1 - (c.embedding::extensions.halfvec(3072) <=> _embedding::extensions.halfvec(3072)) as similarity
  from public.knowledge_chunks c
  where c.knowledge_base_id = any(_kb_ids)
  order by c.embedding::extensions.halfvec(3072) <=> _embedding::extensions.halfvec(3072)
  limit least(greatest(_k, 1), 20)
$$;
-- END MIGRATION 20261001092823_06b70245-283e-49be-82dd-6fd9478999cf.sql

-- BEGIN MIGRATION 03/24: 20261001095218_254f0113-e1c1-4a26-8383-779b5dced3b6.sql
-- SHA256: 0f044160fcecb8901368f478f4f3d4b69a15ff43d7f52fd9436989567f1e4bd2
alter table public.knowledge_bases
  add column embedding_provider text not null default 'openai',
  add column embedding_model text not null default 'text-embedding-3-large';

alter table public.conversations
  add column deployment_id uuid,
  add column environment_id uuid references public.environments(id) on delete set null,
  add column runtime_mode text,
  add column session_ref text unique;

create table public.runtime_bundles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  agent_version int,
  environment_id uuid references public.environments(id) on delete set null,
  bundle jsonb not null,
  checksum text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);
grant select on public.runtime_bundles to authenticated;
grant all on public.runtime_bundles to service_role;
alter table public.runtime_bundles enable row level security;
create policy "bundles read" on public.runtime_bundles for select to authenticated using (public.is_workspace_member(workspace_id));

create table public.deployments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  environment_id uuid not null references public.environments(id) on delete cascade,
  agent_version int not null,
  bundle_id uuid not null references public.runtime_bundles(id),
  status text not null default 'active',
  canary_percent int not null default 100 check (canary_percent between 1 and 100),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index on public.deployments (agent_id, environment_id, status);
grant select on public.deployments to authenticated;
grant all on public.deployments to service_role;
alter table public.deployments enable row level security;
create policy "deployments read" on public.deployments for select to authenticated using (public.is_workspace_member(workspace_id));

alter table public.conversations add constraint conversations_deployment_fk foreign key (deployment_id) references public.deployments(id) on delete set null;

create table public.phone_numbers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  e164 text not null check (e164 ~ '^\+[1-9][0-9]{6,14}$'),
  carrier text not null default 'twilio',
  agent_id uuid references public.agents(id) on delete set null,
  environment_id uuid references public.environments(id) on delete set null,
  sip_trunk_ref text,
  dispatch_rule_ref text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  unique (e164)
);
grant select, insert, update, delete on public.phone_numbers to authenticated;
grant all on public.phone_numbers to service_role;
alter table public.phone_numbers enable row level security;
create policy "numbers rw" on public.phone_numbers for all to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

create table public.tools (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (name ~ '^[a-z][a-z0-9_]{1,47}$'),
  description text not null default '',
  parameters jsonb not null default '{"type":"object","properties":{}}'::jsonb,
  endpoint_url text not null check (endpoint_url ~ '^https://'),
  method text not null default 'POST' check (method in ('GET','POST')),
  timeout_ms int not null default 8000 check (timeout_ms between 500 and 30000),
  auth_hint text,
  auth_ciphertext text,
  created_at timestamptz not null default now(),
  unique (workspace_id, name)
);
grant select (id, workspace_id, name, description, parameters, endpoint_url, method, timeout_ms, auth_hint, created_at) on public.tools to authenticated;
grant delete on public.tools to authenticated;
grant all on public.tools to service_role;
alter table public.tools enable row level security;
create policy "tools read" on public.tools for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "tools delete" on public.tools for delete to authenticated using (public.is_workspace_member(workspace_id));

create table public.agent_tools (
  agent_id uuid not null references public.agents(id) on delete cascade,
  tool_id uuid not null references public.tools(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  primary key (agent_id, tool_id)
);
grant select, insert, delete on public.agent_tools to authenticated;
grant all on public.agent_tools to service_role;
alter table public.agent_tools enable row level security;
create policy "agent tools rw" on public.agent_tools for all to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
-- END MIGRATION 20261001095218_254f0113-e1c1-4a26-8383-779b5dced3b6.sql

-- BEGIN MIGRATION 04/24: 20261001123053_a5ca26ee-56d8-40c6-b512-8fbd4303265e.sql
-- SHA256: cc9b59091f547537b3e621e50336e02c144933f4a7e93db649336b7ef36ad32c
create table public.eval_suites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete cascade,
  name text not null,
  pass_threshold int not null default 80,
  gates_promotion boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create table public.eval_cases (
  id uuid primary key default gen_random_uuid(),
  suite_id uuid not null references public.eval_suites(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  caller_persona text not null default '',
  scenario text not null default '',
  rubric text not null default '',
  created_at timestamptz not null default now()
);
create table public.eval_runs (
  id uuid primary key default gen_random_uuid(),
  suite_id uuid not null references public.eval_suites(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_version int,
  status text not null default 'queued',
  score int,
  passed int not null default 0,
  total int not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
grant select, insert, update, delete on public.eval_suites, public.eval_cases, public.eval_runs to authenticated;
grant all on public.eval_suites, public.eval_cases, public.eval_runs to service_role;
alter table public.eval_suites enable row level security;
alter table public.eval_cases enable row level security;
alter table public.eval_runs enable row level security;
create policy "ws members" on public.eval_suites for all to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "ws members" on public.eval_cases for all to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "ws members" on public.eval_runs for all to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
-- END MIGRATION 20261001123053_a5ca26ee-56d8-40c6-b512-8fbd4303265e.sql

-- BEGIN MIGRATION 05/24: 20261003084945_a9f57b49-8274-4ed5-8dbd-4c8cfb0cbadc.sql
-- SHA256: b5ce2947793ea81e76fb6a2886e4726865cc811f8b61429cd2e156047b80dda8
CREATE TABLE public.demo_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  email text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 255),
  company text CHECK (char_length(company) <= 160),
  team_size text CHECK (char_length(team_size) <= 40),
  message text CHECK (char_length(message) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.demo_requests TO anon, authenticated;
GRANT ALL ON public.demo_requests TO service_role;
ALTER TABLE public.demo_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can request a demo" ON public.demo_requests FOR INSERT TO anon, authenticated WITH CHECK (true);
-- END MIGRATION 20261003084945_a9f57b49-8274-4ed5-8dbd-4c8cfb0cbadc.sql

-- BEGIN MIGRATION 06/24: 20261003120558_19a33d19-bf0b-45d4-a3bb-a0019556a69a.sql
-- SHA256: f9392a0eb998dab0d182fc6a4a550f636e292904b8f0dcb4894b4c41b7411526
create or replace function public.is_staff(_uid uuid) returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.user_roles where user_id = _uid and role in ('admin','operator')) $$;

create table public.platform_incidents (id uuid primary key default gen_random_uuid(), title text not null, severity text not null default 'minor', status text not null default 'investigating', notes text not null default '', created_by uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
grant select, insert, update on public.platform_incidents to authenticated; grant all on public.platform_incidents to service_role;
alter table public.platform_incidents enable row level security;
create policy "staff read incidents" on public.platform_incidents for select to authenticated using (public.is_staff(auth.uid()));
create policy "staff create incidents" on public.platform_incidents for insert to authenticated with check (public.is_staff(auth.uid()) and created_by = auth.uid());
create policy "staff update incidents" on public.platform_incidents for update to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

create table public.support_access_requests (id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade, requested_by uuid not null, reason text not null, duration_hours int not null check (duration_hours between 1 and 24), status text not null default 'pending', approved_by uuid, expires_at timestamptz, created_at timestamptz not null default now());
grant select on public.support_access_requests to authenticated; grant all on public.support_access_requests to service_role;
alter table public.support_access_requests enable row level security;
create policy "staff read access requests" on public.support_access_requests for select to authenticated using (public.is_staff(auth.uid()));

create table public.internal_audit_events (id uuid primary key default gen_random_uuid(), actor_id uuid not null, action text not null, target text, metadata jsonb not null default '{}', created_at timestamptz not null default now());
grant select on public.internal_audit_events to authenticated; grant all on public.internal_audit_events to service_role;
alter table public.internal_audit_events enable row level security;
create policy "staff read internal audit" on public.internal_audit_events for select to authenticated using (public.is_staff(auth.uid()));
-- END MIGRATION 20261003120558_19a33d19-bf0b-45d4-a3bb-a0019556a69a.sql

-- BEGIN MIGRATION 07/24: 20261003120617_cc6eef9a-5541-487a-9c8c-272fd17cdbbd.sql
-- SHA256: 252191c1f64c2b64268a5d66d72258105804ba23a3723ac4d85cb8d702e2c920
revoke execute on function public.is_staff(uuid) from public, anon;
-- END MIGRATION 20261003120617_cc6eef9a-5541-487a-9c8c-272fd17cdbbd.sql

-- BEGIN MIGRATION 08/24: 20261003122339_fbf3c7f8-3957-4953-9ffb-187575e67110.sql
-- SHA256: 59ab4437c55972bdd7c3e4fce9de66c71946b14d8b3b0fd5b30601ccbe4511e4
create table public.org_invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role member_role not null default 'member',
  invited_by uuid not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid
);
create unique index org_invitations_pending_uniq on public.org_invitations(org_id, lower(email)) where status = 'pending';
grant select, insert, update, delete on public.org_invitations to authenticated;
grant all on public.org_invitations to service_role;
alter table public.org_invitations enable row level security;
create policy "invites admin read" on public.org_invitations for select to authenticated using (public.is_org_member(org_id, 'admin'));
create policy "invites admin insert" on public.org_invitations for insert to authenticated
  with check (public.is_org_member(org_id, 'admin') and invited_by = auth.uid() and status = 'pending' and (role <> 'owner' or public.is_org_member(org_id, 'owner')));
create policy "invites admin update" on public.org_invitations for update to authenticated using (public.is_org_member(org_id, 'admin')) with check (public.is_org_member(org_id, 'admin'));
create policy "invites admin delete" on public.org_invitations for delete to authenticated using (public.is_org_member(org_id, 'admin'));

create or replace function public.accept_my_invitations()
returns integer language plpgsql security definer set search_path = public as $$
declare _email text; _n integer := 0; r record;
begin
  if auth.uid() is null then return 0; end if;
  select lower(email) into _email from auth.users where id = auth.uid() and email_confirmed_at is not null;
  if _email is null then return 0; end if;
  for r in select * from public.org_invitations where lower(email) = _email and status = 'pending' loop
    insert into public.org_members(org_id, user_id, role) values (r.org_id, auth.uid(), r.role) on conflict do nothing;
    update public.org_invitations set status = 'accepted', accepted_at = now(), accepted_by = auth.uid() where id = r.id;
    insert into public.audit_events(org_id, actor_id, action, target) values (r.org_id, auth.uid(), 'member.joined', _email);
    _n := _n + 1;
  end loop;
  return _n;
end $$;
revoke execute on function public.accept_my_invitations() from public, anon;
grant execute on function public.accept_my_invitations() to authenticated;

create or replace function public.org_member_emails(_org uuid)
returns table(user_id uuid, email text) language sql stable security definer set search_path = public as $$
  select m.user_id, u.email::text from public.org_members m join auth.users u on u.id = m.user_id
  where m.org_id = _org and public.is_org_member(_org)
$$;
revoke execute on function public.org_member_emails(uuid) from public, anon;
grant execute on function public.org_member_emails(uuid) to authenticated;

create or replace function public.log_tenant_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare _row jsonb; _old jsonb; _ws uuid; _org uuid; _changed text[]; _target text;
begin
  _row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  _old := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  if tg_table_name = 'workspaces' then
    _ws := (_row->>'id')::uuid; _org := (_row->>'org_id')::uuid;
  else
    _ws := (_row->>'workspace_id')::uuid;
    select org_id into _org from public.workspaces where id = _ws;
  end if;
  if tg_op = 'UPDATE' then
    select array_agg(k) into _changed from jsonb_object_keys(_row) k
      where k not in ('updated_at') and _row->k is distinct from _old->k;
    if _changed is null then return new; end if;
  end if;
  _target := coalesce(_row->>'name', _row->>'title', _row->>'e164', case when _row ? 'version' then 'v' || (_row->>'version') end, _row->>'id');
  insert into public.audit_events(org_id, workspace_id, actor_id, action, target, metadata)
  values (_org, _ws, auth.uid(), tg_table_name || '.' || lower(tg_op), _target,
          jsonb_build_object('record_id', _row->>'id', 'changed', coalesce(to_jsonb(_changed), '[]'::jsonb)));
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke execute on function public.log_tenant_change() from public, anon, authenticated;

do $$ declare t text; begin
  foreach t in array array['agents','agent_versions','knowledge_bases','knowledge_sources','tools','phone_numbers','deployments','eval_suites','eval_cases','environments','workspaces','agent_tools','agent_knowledge_bases'] loop
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I for each row execute function public.log_tenant_change()', t);
  end loop;
end $$;

drop policy "audit read" on public.audit_events;
create policy "audit read" on public.audit_events for select to authenticated
  using ((org_id is not null and public.is_org_member(org_id)) or (workspace_id is not null and public.is_workspace_member(workspace_id)));
-- END MIGRATION 20261003122339_fbf3c7f8-3957-4953-9ffb-187575e67110.sql

-- BEGIN MIGRATION 09/24: 20261003123139_4c7e0471-63bb-40dc-a010-7a62ec74969d.sql
-- SHA256: d9ad149c79dd5d10251c86970d84c1ead14e89974f4c4940ce4f91ccfdb035d4
CREATE OR REPLACE FUNCTION public.create_organization(_org_name text, _workspace_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing uuid;
  _org uuid;
BEGIN
  SELECT org_id INTO _existing FROM public.org_members WHERE user_id = auth.uid() LIMIT 1;
  IF _existing IS NOT NULL THEN
    RETURN _existing;
  END IF;

  INSERT INTO public.organizations (name, created_by) VALUES (_org_name, auth.uid()) RETURNING id INTO _org;
  INSERT INTO public.org_members (org_id, user_id, role) VALUES (_org, auth.uid(), 'owner');
  INSERT INTO public.workspaces (org_id, name) VALUES (_org, _workspace_name);
  RETURN _org;
END;
$$;
-- END MIGRATION 20261003123139_4c7e0471-63bb-40dc-a010-7a62ec74969d.sql

-- BEGIN MIGRATION 10/24: 20261003124339_753338b8-ba24-4268-9f67-166137f12594.sql
-- SHA256: 492982d29b2c8a65ae3513b5dd24e565ac755c92c34c83bf2d6a821f3e21d5ea
-- Security hardening of permission helpers
revoke execute on function public.log_tenant_change() from public, anon, authenticated;
create or replace function public.has_role(_user_id uuid, _role app_role)
 returns boolean language sql stable security definer set search_path to 'public'
as $$ select _user_id = auth.uid() and exists (select 1 from public.user_roles where user_id = _user_id and role = _role) $$;
create or replace function public.is_staff(_uid uuid)
 returns boolean language sql stable security definer set search_path to 'public'
as $$ select _uid = auth.uid() and exists (select 1 from public.user_roles where user_id = _uid and role in ('admin','operator')) $$;
revoke execute on function public.has_role(uuid, app_role) from public, anon;
revoke execute on function public.is_staff(uuid) from public, anon;
revoke execute on function public.is_org_member(uuid, member_role) from public, anon;
revoke execute on function public.is_workspace_member(uuid, member_role) from public, anon;
revoke execute on function public.org_member_emails(uuid) from public, anon;
revoke execute on function public.accept_my_invitations() from public, anon;
revoke execute on function public.create_organization(text, text) from public, anon;

-- Developer API keys
create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  prefix text not null,
  key_hash text not null unique,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
grant select on public.api_keys to authenticated;
grant all on public.api_keys to service_role;
alter table public.api_keys enable row level security;
create policy "members read api keys" on public.api_keys for select to authenticated using (public.is_workspace_member(workspace_id));

create table public.api_request_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  api_key_id uuid references public.api_keys(id) on delete set null,
  method text not null,
  path text not null,
  status integer not null,
  duration_ms integer not null default 0,
  created_at timestamptz not null default now()
);
create index on public.api_request_logs(workspace_id, created_at desc);
grant select on public.api_request_logs to authenticated;
grant all on public.api_request_logs to service_role;
alter table public.api_request_logs enable row level security;
create policy "members read api logs" on public.api_request_logs for select to authenticated using (public.is_workspace_member(workspace_id));
-- END MIGRATION 20261003124339_753338b8-ba24-4268-9f67-166137f12594.sql

-- BEGIN MIGRATION 11/24: 20261003133842_fcdad814-626f-44a7-b044-2cc8058ce5aa.sql
-- SHA256: b67f83478a2057f94a4bb6fb6c9f26b6c731782598cf7d820bb5892c9c1f1389
CREATE TABLE public.workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  trigger text NOT NULL DEFAULT 'call.ended' CHECK (trigger IN ('call.started','call.ended','tool.result','keyword')),
  trigger_value text,
  agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  enabled boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflows TO authenticated;
GRANT ALL ON public.workflows TO service_role;
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read workflows" ON public.workflows FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY "admins write workflows" ON public.workflows FOR ALL TO authenticated USING (public.is_workspace_member(workspace_id,'admin')) WITH CHECK (public.is_workspace_member(workspace_id,'admin'));
CREATE TRIGGER audit_workflows AFTER INSERT OR UPDATE OR DELETE ON public.workflows FOR EACH ROW EXECUTE FUNCTION public.log_tenant_change();

CREATE TABLE public.security_policies (
  org_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  record_calls boolean NOT NULL DEFAULT false,
  announce_recording boolean NOT NULL DEFAULT true,
  retention_days integer NOT NULL DEFAULT 90 CHECK (retention_days BETWEEN 1 AND 3650),
  transcript_access text NOT NULL DEFAULT 'member' CHECK (transcript_access IN ('member','admin')),
  redact_pii boolean NOT NULL DEFAULT true,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.security_policies TO authenticated;
GRANT ALL ON public.security_policies TO service_role;
ALTER TABLE public.security_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read policy" ON public.security_policies FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "admins insert policy" ON public.security_policies FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id,'admin'));
CREATE POLICY "admins update policy" ON public.security_policies FOR UPDATE TO authenticated USING (public.is_org_member(org_id,'admin')) WITH CHECK (public.is_org_member(org_id,'admin'));

CREATE TABLE public.webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  url text NOT NULL,
  events text[] NOT NULL DEFAULT '{}',
  secret_hint text NOT NULL,
  secret_ciphertext text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.webhook_endpoints TO authenticated;
GRANT ALL ON public.webhook_endpoints TO service_role;
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read webhooks" ON public.webhook_endpoints FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id,'admin'));

CREATE TABLE public.webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id uuid NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event text NOT NULL,
  status integer,
  error text,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.webhook_deliveries TO authenticated;
GRANT ALL ON public.webhook_deliveries TO service_role;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read deliveries" ON public.webhook_deliveries FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id,'admin'));
-- END MIGRATION 20261003133842_fcdad814-626f-44a7-b044-2cc8058ce5aa.sql

-- BEGIN MIGRATION 12/24: 20261003142454_5d5b5c16-430d-419a-9716-eb670c1060c7.sql
-- SHA256: 611d2afbd92c58a073edbc8b8fc127592cd9cccc3bf12777754e13a69d195448
DROP POLICY IF EXISTS "Anyone can submit a demo request" ON public.demo_requests;
DO $$ DECLARE p record; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='demo_requests' AND cmd='INSERT' LOOP EXECUTE format('DROP POLICY %I ON public.demo_requests', p.policyname); END LOOP; END $$;
CREATE POLICY "Visitors can submit a valid demo request" ON public.demo_requests FOR INSERT TO anon, authenticated
WITH CHECK (length(trim(name)) BETWEEN 1 AND 120 AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' AND length(email) <= 200
  AND coalesce(length(company),0) <= 200 AND coalesce(length(team_size),0) <= 40 AND coalesce(length(message),0) <= 2000);
DELETE FROM public.demo_requests WHERE name = 'Test QA';
-- END MIGRATION 20261003142454_5d5b5c16-430d-419a-9716-eb670c1060c7.sql

-- BEGIN MIGRATION 13/24: 20261003145730_de9e92cd-f29d-42cd-9ba6-1a75a0ea1749.sql
-- SHA256: df8dff54eeb0b4e64c3de3d1fbfdb8805cfb845ad553f346ba6c311dc471d06d
REVOKE EXECUTE ON FUNCTION public.accept_my_invitations() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_organization(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid, public.member_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_workspace_member(uuid, public.member_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.org_member_emails(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_tenant_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_my_invitations(), public.create_organization(text, text), public.has_role(uuid, public.app_role), public.is_org_member(uuid, public.member_role), public.is_staff(uuid), public.is_workspace_member(uuid, public.member_role), public.org_member_emails(uuid) TO authenticated, service_role;
-- END MIGRATION 20261003145730_de9e92cd-f29d-42cd-9ba6-1a75a0ea1749.sql

-- BEGIN MIGRATION 14/24: 20261003152918_783395a2-0416-4a10-b58b-59d26d0ed020.sql
-- SHA256: 639f24cb6757d36bf047a50708c8dab9d24520acdf31f8424efad78702e1ba70
alter table public.agent_versions add column if not exists release_note text;

create table public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  trigger text not null,
  source text not null default 'manual',
  status text not null default 'running',
  steps jsonb not null default '[]'::jsonb,
  error text,
  duration_ms integer,
  started_by uuid,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
grant select on public.workflow_runs to authenticated;
grant all on public.workflow_runs to service_role;
alter table public.workflow_runs enable row level security;
create policy "members read workflow runs" on public.workflow_runs for select to authenticated using (public.is_workspace_member(workspace_id));
create index workflow_runs_wf_idx on public.workflow_runs(workflow_id, created_at desc);
-- END MIGRATION 20261003152918_783395a2-0416-4a10-b58b-59d26d0ed020.sql

-- BEGIN MIGRATION 15/24: 20261004060627_d97dcf0c-bf6d-4560-9d2f-743c1c953937.sql
-- SHA256: fd40d7596cf5f8190c53169db9195f5d0a23e4b7ad27b1505b390d77e8e0e78c
CREATE TABLE public.conversation_tags (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
 tag text NOT NULL CHECK (length(trim(tag)) BETWEEN 1 AND 80),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (conversation_id, tag)
);
GRANT SELECT, INSERT, DELETE ON public.conversation_tags TO authenticated;
GRANT ALL ON public.conversation_tags TO service_role;
ALTER TABLE public.conversation_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace members read conversation tags" ON public.conversation_tags FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY "workspace admins add conversation tags" ON public.conversation_tags FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(workspace_id, 'admin') AND EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.workspace_id = workspace_id));
CREATE POLICY "workspace admins remove conversation tags" ON public.conversation_tags FOR DELETE TO authenticated USING (public.is_workspace_member(workspace_id, 'admin'));
CREATE OR REPLACE FUNCTION public.touch_conversation_tag() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER touch_conversation_tag BEFORE UPDATE ON public.conversation_tags FOR EACH ROW EXECUTE FUNCTION public.touch_conversation_tag();
-- END MIGRATION 20261004060627_d97dcf0c-bf6d-4560-9d2f-743c1c953937.sql

-- BEGIN MIGRATION 16/24: 20261004072041_286b4c42-12a9-44ad-9415-6ca00ddbb62a.sql
-- SHA256: 5356fc0b9de0b141c55cd3f23a8e51df4f8c15f3bd181c1f3fcf7d3d0e3ecfdd
alter table public.knowledge_bases add column if not exists rerank boolean not null default false;
-- END MIGRATION 20261004072041_286b4c42-12a9-44ad-9415-6ca00ddbb62a.sql

-- BEGIN MIGRATION 17/24: 20261004074642_c6a09a7d-e22b-4d4e-a56e-722050da84c9.sql
-- SHA256: 9e792397b4a7d1a1c515a84bf06dc8d36051a2be1ff98ec4ce5ccc142b08c658
alter table public.knowledge_sources add column if not exists source_url text;

drop function public.match_chunks(uuid[], extensions.vector, integer);

create function public.match_chunks(_kb_ids uuid[], _embedding extensions.vector, _k int default 5)
returns table (id uuid, source_id uuid, content text, similarity float, source_name text)
language sql stable security definer set search_path = public, extensions as $$
  select c.id, c.source_id, c.content, 1 - (c.embedding <=> _embedding) as similarity, s.name as source_name
  from knowledge_chunks c
  join knowledge_sources s on s.id = c.source_id
  where c.knowledge_base_id = any(_kb_ids)
  order by c.embedding <=> _embedding
  limit _k
$$;
-- END MIGRATION 20261004074642_c6a09a7d-e22b-4d4e-a56e-722050da84c9.sql

-- BEGIN MIGRATION 18/24: 20261004074658_36e2e6d9-6780-4f0f-a597-533e44945057.sql
-- SHA256: 7f4b84f1284d61e742529bd9c0df4b7cbba9b1beb6d00a023c76b8b92c58d9d9
revoke execute on function public.match_chunks(uuid[], extensions.vector, integer) from anon, authenticated;
grant execute on function public.match_chunks(uuid[], extensions.vector, integer) to service_role;
-- END MIGRATION 20261004074658_36e2e6d9-6780-4f0f-a597-533e44945057.sql

-- BEGIN MIGRATION 19/24: 20261004074846_f3153399-21c9-4c01-bd20-8040afecc0cb.sql
-- SHA256: 3d747765eb0e6ca5e3bbfa82b16d7dea6918293f8c539f5829f1c57336e0c2ac
create table public.eval_run_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.eval_runs(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  case_id uuid references public.eval_cases(id) on delete set null,
  case_title text not null,
  passed boolean,
  score numeric,
  notes text,
  created_at timestamptz not null default now()
);

create index eval_run_items_run_idx on public.eval_run_items(run_id);

grant select on public.eval_run_items to authenticated;
grant all on public.eval_run_items to service_role;

alter table public.eval_run_items enable row level security;

create policy "Members read run items"
  on public.eval_run_items for select to authenticated
  using (public.is_workspace_member(workspace_id));
-- END MIGRATION 20261004074846_f3153399-21c9-4c01-bd20-8040afecc0cb.sql

-- BEGIN MIGRATION 20/24: 20261005070733_538e0aaa-351e-4aae-a77d-9ced32d93a6a.sql
-- SHA256: 55a53446b3903a2168171d3e81bd8824e749691e5cf1826ec6660fb861ddedac

-- RBAC
create table public.permissions (key text primary key);
create table public.roles (id uuid primary key default gen_random_uuid(), org_id uuid references public.organizations(id) on delete cascade, name text not null, created_at timestamptz not null default now(), unique nulls not distinct (org_id, name));
create table public.role_permissions (role_id uuid not null references public.roles(id) on delete cascade, permission_key text not null references public.permissions(key) on delete cascade, primary key (role_id, permission_key));
create table public.role_assignments (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, role_id uuid not null references public.roles(id) on delete cascade, scope_type text not null check (scope_type in ('org','workspace')), scope_id uuid not null, granted_by uuid, expires_at timestamptz, created_at timestamptz not null default now(), unique (user_id, role_id, scope_type, scope_id));
grant select on public.permissions, public.roles, public.role_permissions, public.role_assignments to authenticated;
grant all on public.permissions, public.roles, public.role_permissions, public.role_assignments to service_role;
alter table public.permissions enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.role_assignments enable row level security;
create policy "perm read" on public.permissions for select to authenticated using (true);
create policy "roles read" on public.roles for select to authenticated using (org_id is null or public.is_org_member(org_id));
create policy "role perms read" on public.role_permissions for select to authenticated using (exists (select 1 from public.roles r where r.id = role_id and (r.org_id is null or public.is_org_member(r.org_id))));
create policy "assignments read" on public.role_assignments for select to authenticated using (user_id = auth.uid() or (scope_type='org' and public.is_org_member(scope_id, 'admin')) or (scope_type='workspace' and public.is_workspace_member(scope_id, 'admin')));

insert into public.permissions(key) values
 ('connector.read'),('connector.create'),('connector.update'),('connector.pause'),('connector.delete'),('credential.manage'),
 ('tool.read'),('tool.approve'),('tool.revoke'),('tool.policy.edit'),('tool.test.mock'),('tool.test.sandbox'),('tool.test.live'),
 ('tool.execution.read'),('tool.decision.read'),('agent.bind_tools'),('agent.publish'),('workflow.bind_tools'),('workflow.publish'),('delegation.manage');
insert into public.roles(org_id, name) values (null,'Owner'),(null,'Admin'),(null,'Builder'),(null,'Reviewer'),(null,'Operator'),(null,'Viewer');
insert into public.role_permissions select r.id, p.key from public.roles r, public.permissions p where r.org_id is null and r.name='Owner';
insert into public.role_permissions select r.id, p.key from public.roles r, public.permissions p where r.org_id is null and r.name='Admin' and p.key <> 'delegation.manage';
insert into public.role_permissions select r.id, p.key from public.roles r, public.permissions p where r.org_id is null and r.name='Builder' and p.key in ('connector.read','tool.read','tool.execution.read','tool.test.mock','tool.test.sandbox','agent.bind_tools','workflow.bind_tools');
insert into public.role_permissions select r.id, p.key from public.roles r, public.permissions p where r.org_id is null and r.name='Reviewer' and p.key in ('connector.read','tool.read','tool.execution.read','tool.approve','tool.revoke','tool.decision.read');
insert into public.role_permissions select r.id, p.key from public.roles r, public.permissions p where r.org_id is null and r.name='Operator' and p.key in ('connector.read','tool.read','tool.execution.read','connector.pause');
insert into public.role_permissions select r.id, p.key from public.roles r, public.permissions p where r.org_id is null and r.name='Viewer' and p.key in ('connector.read','tool.read','tool.execution.read');

create or replace function public.has_permission(_perm text, _ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  with w as (select org_id from public.workspaces where id = _ws),
  base as (
    select case m.role when 'owner' then 'Owner' when 'admin' then 'Admin' else 'Builder' end as rname
    from public.org_members m, w where m.org_id = w.org_id and m.user_id = auth.uid()
  )
  select auth.uid() is not null and (
    exists (select 1 from base b join public.roles r on r.org_id is null and r.name = b.rname
            join public.role_permissions rp on rp.role_id = r.id and rp.permission_key = _perm)
    or exists (select 1 from public.role_assignments a join public.role_permissions rp on rp.role_id = a.role_id and rp.permission_key = _perm, w
               where a.user_id = auth.uid() and (a.expires_at is null or a.expires_at > now())
                 and ((a.scope_type='workspace' and a.scope_id=_ws) or (a.scope_type='org' and a.scope_id=w.org_id))
                 and exists (select 1 from public.org_members m where m.org_id = w.org_id and m.user_id = auth.uid()))
  )
$$;
revoke execute on function public.has_permission(text, uuid) from public, anon;
grant execute on function public.has_permission(text, uuid) to authenticated, service_role;

-- Connectors and credentials
create table public.tool_connectors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  type text not null check (type in ('http','mcp','webhook','openapi','native')),
  display_name text not null check (char_length(display_name) between 1 and 80),
  canonical_origin text not null check (canonical_origin ~ '^https://[^/?#@]+$'),
  endpoint_path text not null default '/',
  configuration jsonb not null default '{}'::jsonb,
  provider_label text,
  admin_enabled boolean not null default true,
  health text not null default 'not_checked' check (health in ('not_checked','checking','healthy','degraded','auth_invalid','auth_forbidden','schema_drift','unreachable','revoked')),
  protocol_version text,
  environment_class text not null default 'live' check (environment_class in ('live','sandbox')),
  sandbox_of uuid references public.tool_connectors(id) on delete set null,
  last_checked_at timestamptz, last_success_at timestamptz, next_check_at timestamptz,
  consecutive_failures int not null default 0,
  error_code text, discovery_etag text,
  archived_at timestamptz,
  revision int not null default 1,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id, display_name)
);
create table public.tool_credentials (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connector_id uuid not null references public.tool_connectors(id) on delete cascade,
  origin text not null,
  auth_kind text not null check (auth_kind in ('bearer','basic','header','query')),
  header_name text,
  ciphertext text not null,
  secret_version int not null default 1,
  hint text not null default '',
  status text not null default 'active' check (status in ('active','replaced','revoked')),
  created_by uuid, created_at timestamptz not null default now(), rotated_at timestamptz, revoked_at timestamptz
);
create unique index tool_credentials_one_active on public.tool_credentials(connector_id) where status = 'active';
create table public.tool_credential_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  credential_id uuid not null references public.tool_credentials(id) on delete cascade,
  event text not null check (event in ('created','rotated','revoked','used_failed')),
  actor uuid, at timestamptz not null default now()
);

-- Tools
create table public.tool_definitions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connector_id uuid not null references public.tool_connectors(id) on delete cascade,
  source_operation_id text not null,
  stable_slug text not null check (stable_slug ~ '^[a-z][a-z0-9_]{1,63}$'),
  state text not null default 'active' check (state in ('active','archived','unsupported')),
  unsupported_reason text,
  current_revision_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz,
  unique (connector_id, source_operation_id), unique (workspace_id, stable_slug)
);
create table public.tool_revisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  tool_id uuid not null references public.tool_definitions(id) on delete cascade,
  revision_no int not null,
  display_name text not null,
  description text not null default '' check (char_length(description) <= 2000),
  input_schema jsonb not null,
  output_schema jsonb,
  adapter_mapping jsonb not null default '{}'::jsonb,
  remote_annotations jsonb not null default '{}'::jsonb,
  review_hash text not null, invocation_hash text not null, normalizer_version int not null default 1,
  discovered_at timestamptz not null default now(),
  unique (tool_id, revision_no)
);
alter table public.tool_definitions add constraint tool_definitions_current_rev_fk foreign key (current_revision_id) references public.tool_revisions(id) on delete set null;
create table public.tool_approvals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  tool_revision_id uuid not null references public.tool_revisions(id) on delete cascade,
  risk_class text not null check (risk_class in ('read','write','sensitive','destructive','restricted')),
  allowed_contexts text[] not null default array['voice_session','text_test','workflow','console_test'],
  confirmation_minimum text not null default 'none' check (confirmation_minimum in ('none','voice','voice_readback','blocked')),
  idempotency_mode text not null default 'none' check (idempotency_mode in ('none','destination_supported','platform_dedup_only')),
  safe_to_retry boolean not null default false,
  drift_read_policy text not null default 'warn' check (drift_read_policy in ('warn','block')),
  status text not null default 'pending' check (status in ('pending','approved','rejected','revoked')),
  approval_source text not null default 'human' check (approval_source in ('human','legacy_migration')),
  approved_by uuid, approved_at timestamptz, review_required_by timestamptz,
  policy_revision int not null default 1,
  created_at timestamptz not null default now(),
  check (approval_source = 'legacy_migration' or status <> 'approved' or approved_by is not null),
  check (not safe_to_retry or risk_class = 'read' or idempotency_mode = 'destination_supported')
);
create table public.tool_policies (
  tool_id uuid primary key references public.tool_definitions(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  timeout_ms int not null default 8000 check (timeout_ms between 500 and 15000),
  rate_limit_per_min int not null default 60 check (rate_limit_per_min between 1 and 6000),
  sensitive_output text not null default 'mask_common' check (sensitive_output in ('none','mask_common','drop')),
  max_output_bytes int not null default 16384 check (max_output_bytes between 256 and 16384),
  revision int not null default 1, updated_by uuid, updated_at timestamptz not null default now()
);
create table public.tool_mocks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  tool_revision_id uuid not null references public.tool_revisions(id) on delete cascade,
  name text not null default 'default', reply jsonb not null,
  created_at timestamptz not null default now(), unique (tool_revision_id, name)
);
create table public.connector_discovery_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connector_id uuid not null references public.tool_connectors(id) on delete cascade,
  protocol_version text, catalog_hash text, status text not null check (status in ('running','succeeded','failed')),
  tool_count int not null default 0, drift jsonb not null default '{}'::jsonb, error_code text, actor uuid,
  started_at timestamptz not null default now(), finished_at timestamptz
);

-- Bindings
create table public.agent_tool_bindings (
  agent_id uuid not null references public.agents(id) on delete cascade,
  tool_id uuid not null references public.tool_definitions(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  tool_revision_id uuid not null references public.tool_revisions(id),
  enabled boolean not null default true,
  requirement text not null default 'required' check (requirement in ('required','optional')),
  confirmation_mode text not null default 'policy_minimum' check (confirmation_mode in ('policy_minimum','always')),
  timeout_ms int check (timeout_ms between 500 and 15000),
  output_budget_bytes int not null default 2048 check (output_budget_bytes between 256 and 16384),
  input_mapping jsonb not null default '{}'::jsonb,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (agent_id, tool_id)
);
create table public.workflow_versions (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  version int not null, graph jsonb not null, published_by uuid, created_at timestamptz not null default now(),
  unique (workflow_id, version)
);
create table public.workflow_tool_bindings (
  workflow_version_id uuid not null references public.workflow_versions(id) on delete cascade,
  step_id text not null,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  tool_revision_id uuid not null references public.tool_revisions(id),
  execution_policy jsonb not null default '{"after_call_allowed": false}'::jsonb,
  primary key (workflow_version_id, step_id)
);
create table public.domain_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  type text not null, schema_version int not null default 1,
  payload jsonb not null default '{}'::jsonb check (pg_column_size(payload) <= 4096),
  created_at timestamptz not null default now(), processed_at timestamptz
);
create index domain_events_pending on public.domain_events(created_at) where processed_at is null;

-- Records
create table public.tool_invocations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  context_kind text not null check (context_kind in ('voice_session','text_test','workflow','console_test')),
  context_key text not null,
  invocation_key text not null,
  mode text not null default 'live' check (mode in ('mock','sandbox','live')),
  agent_id uuid, agent_version int, deployment_id uuid, conversation_id uuid, session_id text, turn_id text,
  workflow_id uuid, workflow_version_id uuid, workflow_run_id uuid, workflow_step_id text,
  tool_id uuid references public.tool_definitions(id) on delete set null,
  tool_revision_id uuid references public.tool_revisions(id) on delete set null,
  connector_id uuid references public.tool_connectors(id) on delete set null,
  acting_partner_org_id uuid, actor_user_id uuid, trace_id text,
  input_hash text, idempotency_key text,
  status text not null check (status in ('pending_confirmation','running','succeeded','failed','outcome_unknown','cancelled','expired','blocked')),
  error_code text, input_redacted jsonb, output_redacted jsonb,
  started_at timestamptz not null default now(), ended_at timestamptz, latency_ms int,
  unique (context_key, invocation_key)
);
create index tool_invocations_ws_time on public.tool_invocations(workspace_id, started_at desc);
create table public.tool_attempts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  invocation_id uuid not null references public.tool_invocations(id) on delete cascade,
  attempt_no int not null, destination_host text, status_code int, error_class text, retry_decision text,
  started_at timestamptz not null default now(), ended_at timestamptz, unique (invocation_id, attempt_no)
);
create table public.tool_pending_actions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  invocation_id uuid not null references public.tool_invocations(id) on delete cascade,
  session_id text, turn_id text,
  execution_scope jsonb not null default '{"kind":"live"}'::jsonb,
  tool_revision_id uuid not null references public.tool_revisions(id),
  frozen_arguments text not null, args_digest text not null, policy_revision int not null,
  summary text not null,
  status text not null default 'pending' check (status in ('pending','confirmed','executing','executed','denied','expired','invalidated')),
  expires_at timestamptz not null, evidence jsonb, executed_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.tool_policy_decisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  invocation_id uuid not null references public.tool_invocations(id) on delete cascade,
  stage text not null check (stage in ('request','confirmation','pre_execute','retry')),
  policy_revision int not null, decision text not null check (decision in ('allow','deny','confirm')),
  reason_codes text[] not null default '{}', risk_class text, required_confirmation text,
  pending_action_id uuid references public.tool_pending_actions(id) on delete set null,
  evaluated_at timestamptz not null default now()
);
create table public.partner_delegations (
  id uuid primary key default gen_random_uuid(),
  partner_org_id uuid not null references public.organizations(id) on delete cascade,
  client_org_id uuid not null references public.organizations(id) on delete cascade,
  allowed_actions text[] not null default '{}', resource_scope jsonb not null default '{}'::jsonb,
  granted_by uuid not null, expires_at timestamptz, revoked_at timestamptz, created_at timestamptz not null default now(),
  check (partner_org_id <> client_org_id)
);
create table public.runtime_nonces (nonce text primary key, expires_at timestamptz not null);

-- Grants: browser reads only; server writes
grant select on public.tool_connectors, public.tool_credential_events, public.tool_definitions, public.tool_revisions, public.tool_approvals,
  public.tool_policies, public.tool_mocks, public.connector_discovery_runs, public.agent_tool_bindings, public.workflow_versions,
  public.workflow_tool_bindings, public.tool_invocations, public.tool_attempts, public.tool_policy_decisions, public.partner_delegations to authenticated;
grant all on public.tool_connectors, public.tool_credentials, public.tool_credential_events, public.tool_definitions, public.tool_revisions, public.tool_approvals,
  public.tool_policies, public.tool_mocks, public.connector_discovery_runs, public.agent_tool_bindings, public.workflow_versions,
  public.workflow_tool_bindings, public.domain_events, public.tool_invocations, public.tool_attempts, public.tool_pending_actions,
  public.tool_policy_decisions, public.partner_delegations, public.runtime_nonces to service_role;

alter table public.tool_connectors enable row level security;
alter table public.tool_credentials enable row level security;
alter table public.tool_credential_events enable row level security;
alter table public.tool_definitions enable row level security;
alter table public.tool_revisions enable row level security;
alter table public.tool_approvals enable row level security;
alter table public.tool_policies enable row level security;
alter table public.tool_mocks enable row level security;
alter table public.connector_discovery_runs enable row level security;
alter table public.agent_tool_bindings enable row level security;
alter table public.workflow_versions enable row level security;
alter table public.workflow_tool_bindings enable row level security;
alter table public.domain_events enable row level security;
alter table public.tool_invocations enable row level security;
alter table public.tool_attempts enable row level security;
alter table public.tool_pending_actions enable row level security;
alter table public.tool_policy_decisions enable row level security;
alter table public.partner_delegations enable row level security;
alter table public.runtime_nonces enable row level security;

create policy "read" on public.tool_connectors for select to authenticated using (public.has_permission('connector.read', workspace_id));
create policy "read" on public.tool_credential_events for select to authenticated using (public.has_permission('credential.manage', workspace_id));
create policy "read" on public.tool_definitions for select to authenticated using (public.has_permission('tool.read', workspace_id));
create policy "read" on public.tool_revisions for select to authenticated using (public.has_permission('tool.read', workspace_id));
create policy "read" on public.tool_approvals for select to authenticated using (public.has_permission('tool.read', workspace_id));
create policy "read" on public.tool_policies for select to authenticated using (public.has_permission('tool.read', workspace_id));
create policy "read" on public.tool_mocks for select to authenticated using (public.has_permission('tool.read', workspace_id));
create policy "read" on public.connector_discovery_runs for select to authenticated using (public.has_permission('connector.read', workspace_id));
create policy "read" on public.agent_tool_bindings for select to authenticated using (public.has_permission('tool.read', workspace_id));
create policy "read" on public.workflow_versions for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "read" on public.workflow_tool_bindings for select to authenticated using (public.has_permission('tool.read', workspace_id));
create policy "read" on public.tool_invocations for select to authenticated using (public.has_permission('tool.execution.read', workspace_id));
create policy "read" on public.tool_attempts for select to authenticated using (public.has_permission('tool.execution.read', workspace_id));
create policy "read" on public.tool_policy_decisions for select to authenticated using (public.has_permission('tool.decision.read', workspace_id));
create policy "read" on public.partner_delegations for select to authenticated using (public.is_org_member(partner_org_id) or public.is_org_member(client_org_id));

-- Safe credential view (no ciphertext)
create view public.tool_credentials_public with (security_invoker = false) as
  select c.id, c.workspace_id, c.connector_id, c.auth_kind, c.header_name, c.hint, c.status, c.secret_version, c.created_at, c.rotated_at
  from public.tool_credentials c where public.has_permission('connector.read', c.workspace_id);
grant select on public.tool_credentials_public to authenticated;

-- updated_at
create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = public as $$ begin new.updated_at = now(); return new; end $$;
create trigger touch before update on public.tool_connectors for each row execute function public.touch_updated_at();
create trigger touch before update on public.tool_definitions for each row execute function public.touch_updated_at();
create trigger touch before update on public.tool_policies for each row execute function public.touch_updated_at();
create trigger touch before update on public.agent_tool_bindings for each row execute function public.touch_updated_at();

-- Revisions are immutable
create or replace function public.forbid_update() returns trigger language plpgsql set search_path = public as $$ begin raise exception 'Tool revisions are immutable'; end $$;
create trigger immutable before update on public.tool_revisions for each row execute function public.forbid_update();

-- Audit
create trigger audit_tool_connectors after insert or update or delete on public.tool_connectors for each row execute function public.log_tenant_change();
create trigger audit_tool_definitions after insert or update or delete on public.tool_definitions for each row execute function public.log_tenant_change();
create trigger audit_tool_approvals after insert or update or delete on public.tool_approvals for each row execute function public.log_tenant_change();
create trigger audit_tool_policies after insert or update or delete on public.tool_policies for each row execute function public.log_tenant_change();
create trigger audit_agent_tool_bindings after insert or update or delete on public.agent_tool_bindings for each row execute function public.log_tenant_change();
create trigger audit_workflow_versions after insert or update or delete on public.workflow_versions for each row execute function public.log_tenant_change();

-- Legacy migration
do $$
declare t record; c uuid; d uuid; r uuid; o uuid; origin text; path text; schema jsonb; risk text;
begin
  for t in select * from public.tools loop
    select org_id into o from public.workspaces where id = t.workspace_id;
    origin := substring(t.endpoint_url from '^(https://[^/?#]+)');
    path := coalesce(nullif(substring(t.endpoint_url from '^https://[^/?#]+(.*)$'), ''), '/');
    risk := case when t.method = 'GET' then 'read' else 'write' end;
    insert into public.tool_connectors(org_id, workspace_id, type, display_name, canonical_origin, endpoint_path, configuration, health)
      values (o, t.workspace_id, 'http', t.name, origin, path, jsonb_build_object('legacy_tool_id', t.id), 'not_checked')
      on conflict (workspace_id, display_name) do update set display_name = excluded.display_name returning id into c;
    if t.auth_ciphertext is not null then
      insert into public.tool_credentials(org_id, workspace_id, connector_id, origin, auth_kind, header_name, ciphertext, hint)
        values (o, t.workspace_id, c, origin, 'header', 'Authorization', t.auth_ciphertext, coalesce(t.auth_hint, ''));
    end if;
    insert into public.tool_definitions(workspace_id, connector_id, source_operation_id, stable_slug)
      values (t.workspace_id, c, t.method || ' ' || path, t.name) returning id into d;
    schema := coalesce(t.parameters, '{"type":"object","properties":{}}'::jsonb);
    insert into public.tool_revisions(workspace_id, tool_id, revision_no, display_name, description, input_schema, adapter_mapping, review_hash, invocation_hash)
      values (t.workspace_id, d, 1, t.name, left(t.description, 2000), schema,
              jsonb_build_object('method', t.method, 'path', path, 'params', 'body_or_query'),
              encode(sha256(convert_to(t.name || t.description || schema::text, 'UTF8')), 'hex'),
              encode(sha256(convert_to(t.method || path || schema::text, 'UTF8')), 'hex'))
      returning id into r;
    update public.tool_definitions set current_revision_id = r where id = d;
    insert into public.tool_approvals(workspace_id, tool_revision_id, risk_class, confirmation_minimum, status, approval_source, approved_at, review_required_by)
      values (t.workspace_id, r, risk, case when risk = 'read' then 'none' else 'voice' end, 'approved', 'legacy_migration', now(), now() + interval '30 days');
    insert into public.tool_policies(tool_id, workspace_id, timeout_ms) values (d, t.workspace_id, least(t.timeout_ms, 15000));
    insert into public.agent_tool_bindings(agent_id, tool_id, workspace_id, tool_revision_id)
      select at.agent_id, d, at.workspace_id, r from public.agent_tools at where at.tool_id = t.id;
  end loop;
end $$;
-- END MIGRATION 20261005070733_538e0aaa-351e-4aae-a77d-9ced32d93a6a.sql

-- BEGIN MIGRATION 21/24: 20261005070752_9011de2a-c579-40c7-8bb9-75befe906863.sql
-- SHA256: 64f7176f45521d0bbe96d7bc8eb6c3acb18a8f4d118e7d51a8234e1527e4f2ad

drop view public.tool_credentials_public;
grant select (id, workspace_id, connector_id, auth_kind, header_name, hint, status, secret_version, created_at, rotated_at) on public.tool_credentials to authenticated;
create policy "read meta" on public.tool_credentials for select to authenticated using (public.has_permission('connector.read', workspace_id));
create view public.tool_credentials_public with (security_invoker = true) as
  select id, workspace_id, connector_id, auth_kind, header_name, hint, status, secret_version, created_at, rotated_at from public.tool_credentials;
grant select on public.tool_credentials_public to authenticated;
-- END MIGRATION 20261005070752_9011de2a-c579-40c7-8bb9-75befe906863.sql

-- BEGIN MIGRATION 22/24: 20261017120000_gateway_runtime_bindings.sql
-- SHA256: fcf1890a6e85a1b9833db7ab14555bab5b9b135b107fe675da6ccf55f1a997d2
alter table public.workflows add column published_version_id uuid references public.workflow_versions(id);
alter table public.conversations add column runtime_bundle_id uuid references public.runtime_bundles(id);
alter table public.workflow_runs add column workflow_version_id uuid references public.workflow_versions(id);

-- Version publication now snapshots tool bindings in an authenticated server function.
revoke insert on public.agent_versions from authenticated;

-- Pending actions created by the old gateway contain plaintext arguments. They must
-- never be resumed by the encrypted pending-action reader.
update public.tool_invocations set status = 'cancelled', ended_at = now()
where id in (select invocation_id from public.tool_pending_actions where status = 'pending');
update public.tool_pending_actions set status = 'invalidated', frozen_arguments = '' where status = 'pending';

-- Runs are reproducible from their version; published graphs cannot be edited.
create trigger workflow_version_immutable before update on public.workflow_versions
for each row execute function public.forbid_update();

-- Expired nonces are safe to remove; recent nonces remain unique across workers.
create or replace function public.prune_runtime_nonces() returns trigger
language plpgsql set search_path = public as $$
begin
  delete from public.runtime_nonces where expires_at < now();
  return null;
end $$;
create trigger prune_runtime_nonces before insert on public.runtime_nonces
for each statement execute function public.prune_runtime_nonces();
-- END MIGRATION 20261017120000_gateway_runtime_bindings.sql

-- BEGIN MIGRATION 23/24: 20261021120000_inbound_telephony.sql
-- SHA256: c4c21258cd292042f9cfec75ea00290125433bfc10677bf0cd34a6c5d2c7b43b
alter table public.phone_numbers
  add column provisioning_error text,
  add column provisioning_token uuid,
  add column provisioning_started_at timestamptz,
  add column last_call_at timestamptz;
alter table public.conversations
  add column phone_number_id uuid references public.phone_numbers(id) on delete set null,
  add column caller_number text;

-- Provisioning and routing now go through authenticated server functions.
revoke insert, update, delete on public.phone_numbers from authenticated;
create or replace function public.validate_phone_route() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.agent_id is not null and not exists (
    select 1 from public.agents where id = new.agent_id and workspace_id = new.workspace_id
  ) then raise exception 'Agent is outside this workspace'; end if;
  if new.environment_id is not null and not exists (
    select 1 from public.environments where id = new.environment_id and workspace_id = new.workspace_id
  ) then raise exception 'Environment is outside this workspace'; end if;
  return new;
end $$;
create trigger validate_phone_route before insert or update of agent_id, environment_id, workspace_id
on public.phone_numbers for each row execute function public.validate_phone_route();

-- A retried transcript batch must neither duplicate turns nor bill a call twice.
create table public.runtime_event_batches (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.runtime_event_batches enable row level security;
grant all on public.runtime_event_batches to service_role;

create or replace function public.ingest_runtime_events(_session_id uuid, _batch_id uuid, _events jsonb)
returns boolean language plpgsql set search_path = public as $$
declare c public.conversations%rowtype; ev jsonb; next_seq int; seconds int; batch_claim uuid;
begin
  select * into c from public.conversations where id = _session_id for update;
  if not found then raise exception 'Session not found'; end if;
  if jsonb_typeof(_events) <> 'array' or jsonb_array_length(_events) > 200 then
    raise exception 'Invalid runtime event batch';
  end if;
  insert into public.runtime_event_batches(id, workspace_id, conversation_id)
    values (_batch_id, c.workspace_id, c.id) on conflict do nothing returning id into batch_claim;
  if batch_claim is null then return false; end if;
  if c.status <> 'active' then return false; end if;
  select coalesce(max(seq) + 1, 0) into next_seq from public.conversation_turns where conversation_id = c.id;
  for ev in select value from jsonb_array_elements(_events) loop
    if ev->>'type' = 'turn' and length(trim(ev->>'content')) > 0 then
      if ev->>'role' not in ('user', 'assistant') then raise exception 'Invalid turn role'; end if;
      insert into public.conversation_turns(conversation_id, workspace_id, seq, role, content)
        values (c.id, c.workspace_id, next_seq, ev->>'role', left(trim(ev->>'content'), 8000));
      next_seq := next_seq + 1;
      if ev->>'role' = 'user' then
        update public.conversations set summary = left(ev->>'content', 160) where id = c.id and summary is null;
      end if;
    elsif ev->>'type' = 'usage' then
      insert into public.usage_events(workspace_id, conversation_id, kind, model, quantity, unit)
        values (c.workspace_id, c.id, ev->>'kind', ev->>'model', (ev->>'quantity')::numeric, ev->>'unit');
    elsif ev->>'type' = 'end' then
      seconds := greatest(0, round(extract(epoch from (now() - c.started_at)))::int);
      update public.conversations set status = case when ev->>'reason' = 'runtime_error' then 'failed' else 'completed' end,
        ended_at = now(), duration_seconds = seconds where id = c.id;
      update public.tool_pending_actions set status = 'invalidated'
        where workspace_id = c.workspace_id and session_id = c.id::text and status = 'pending';
      insert into public.usage_events(workspace_id, conversation_id, kind, model, quantity, unit)
        values (c.workspace_id, c.id, 'voice_minutes', 'session', greatest(seconds, 1) / 60.0, 'minutes');
      exit;
    end if;
  end loop;
  return true;
end $$;
revoke all on function public.ingest_runtime_events(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_runtime_events(uuid, uuid, jsonb) to service_role;
-- END MIGRATION 20261021120000_inbound_telephony.sql

-- BEGIN MIGRATION 24/24: 20261022120000_managed_inbound.sql
-- SHA256: aee42ef4d2543f203a7ea885e34595c7d0c2701616632d6c59bf101d288aa19f
-- Platform-managed inbound numbers. All mutations are server-only.
alter table public.phone_numbers add column management_mode text not null default 'external' check (management_mode in ('external','managed'));
alter table public.phone_numbers add column verified_at timestamptz;
alter table public.phone_numbers drop constraint phone_numbers_e164_key;
create unique index phone_numbers_current_e164 on public.phone_numbers(e164) where status <> 'released';

create table public.managed_number_quotes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  e164 text not null check (e164 ~ '^\+1[0-9]{10}$'),
  currency text not null default 'USD' check (currency = 'USD'),
  monthly_cents integer not null check (monthly_cents >= 0),
  setup_cents integer not null check (setup_cents >= 0),
  inbound_rate text not null check (inbound_rate ~ '^[0-9]{1,3}(\.[0-9]{1,6})?$' and inbound_rate::numeric <= 100),
  carrier_monthly_cents integer not null check (carrier_monthly_cents >= 0),
  carrier_setup_cents integer not null check (carrier_setup_cents >= 0),
  expires_at timestamptz not null default now() + interval '5 minutes',
  created_at timestamptz not null default now()
);
create table public.managed_number_orders (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id),
  quote_id uuid not null unique references public.managed_number_quotes(id),
  number_id uuid not null unique references public.phone_numbers(id),
  state text not null default 'reserved' check (state in ('reserved','ordering','activation','routing','ready','error','review','releasing','released','failed')),
  connection_ref text, carrier_order_ref text, carrier_number_ref text,
  submitted_at timestamptz, activated_at timestamptz, carrier_released_at timestamptz,
  lease_token uuid, lease_at timestamptz, error text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index managed_carrier_order_unique on public.managed_number_orders(carrier_order_ref) where carrier_order_ref is not null;
create unique index managed_carrier_number_unique on public.managed_number_orders(carrier_number_ref) where carrier_number_ref is not null;
create index managed_orders_reconcile on public.managed_number_orders(state, updated_at);

create table public.phone_verifications (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  number_id uuid not null references public.phone_numbers(id), agent_id uuid not null references public.agents(id),
  environment_id uuid not null references public.environments(id), agent_version integer not null,
  requested_at timestamptz not null default now(), verified_at timestamptz,
  conversation_id uuid references public.conversations(id)
);
create index phone_verification_recent on public.phone_verifications(number_id, requested_at desc);
create table public.managed_number_charges (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  order_id uuid not null references public.managed_number_orders(id), period integer not null check (period >= 0),
  currency text not null default 'USD', amount_cents integer not null check (amount_cents >= 0),
  description text not null, created_at timestamptz not null default now(), unique(order_id, period)
);
create table public.managed_call_charges (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  order_id uuid not null references public.managed_number_orders(id), conversation_id uuid not null unique references public.conversations(id),
  currency text not null default 'USD', amount_cents integer not null check (amount_cents >= 0),
  description text not null default 'Inbound call usage', created_at timestamptz not null default now()
);

alter table public.managed_number_quotes enable row level security;
alter table public.managed_number_orders enable row level security;
alter table public.phone_verifications enable row level security;
alter table public.managed_number_charges enable row level security;
alter table public.managed_call_charges enable row level security;
grant select on public.managed_number_quotes, public.managed_number_orders, public.phone_verifications, public.managed_number_charges to authenticated;
grant all on public.managed_number_quotes, public.managed_number_orders, public.phone_verifications, public.managed_number_charges to service_role;
grant select on public.managed_call_charges to authenticated;
grant all on public.managed_call_charges to service_role;
create policy managed_quotes_read on public.managed_number_quotes for select to authenticated using (public.is_workspace_member(workspace_id));
create policy managed_orders_read on public.managed_number_orders for select to authenticated using (public.is_workspace_member(workspace_id));
create policy phone_verifications_read on public.phone_verifications for select to authenticated using (public.is_workspace_member(workspace_id));
create policy number_charges_read on public.managed_number_charges for select to authenticated using (public.is_workspace_member(workspace_id));
create policy call_charges_read on public.managed_call_charges for select to authenticated using (public.is_workspace_member(workspace_id));

-- A workspace lock serializes purchases across different request keys and quotes.
create function public.reserve_managed_number(_workspace uuid, _quote uuid, _agent uuid, _environment uuid, _request uuid, _limit integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare q public.managed_number_quotes; o public.managed_number_orders; n uuid;
begin
  perform 1 from public.workspaces where id = _workspace for update;
  if not found then raise exception 'Workspace not found'; end if;
  select * into o from public.managed_number_orders where id = _request;
  if found then
    if o.workspace_id <> _workspace or o.quote_id <> _quote then raise exception 'Purchase request already used'; end if;
    if not exists(select 1 from public.phone_numbers where id = o.number_id and agent_id = _agent and environment_id = _environment) then raise exception 'Purchase request already used with another assignment'; end if;
    return o.id;
  end if;
  select * into q from public.managed_number_quotes where id = _quote and workspace_id = _workspace and expires_at > now() for update;
  if not found then raise exception 'Quote expired. Search again.'; end if;
  if not exists(select 1 from public.agents where id = _agent and workspace_id = _workspace and status <> 'archived')
    or not exists(select 1 from public.environments where id = _environment and workspace_id = _workspace)
    or not exists(select 1 from public.deployments where workspace_id = _workspace and agent_id = _agent and environment_id = _environment and status = 'active' and canary_percent = 100 and bundle_id is not null)
    then raise exception 'Choose an agent with a full published deployment in this workspace'; end if;
  if _limit < 1 or (select count(*) from public.managed_number_orders where workspace_id = _workspace and state <> 'released' and not (state = 'failed' and submitted_at is null)) >= _limit then
    raise exception 'Managed number limit reached. Contact support.';
  end if;
  insert into public.phone_numbers(workspace_id,e164,carrier,agent_id,environment_id,management_mode,status)
    values(_workspace,q.e164,'telnyx',_agent,_environment,'managed','pending') returning id into n;
  insert into public.managed_number_orders(id,workspace_id,quote_id,number_id) values(_request,_workspace,_quote,n);
  return _request;
end $$;
revoke all on function public.reserve_managed_number(uuid,uuid,uuid,uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.reserve_managed_number(uuid,uuid,uuid,uuid,uuid,integer) to service_role;

-- Accounting ledger, not a payment processor. Period 0 includes setup and first month.
-- Run while holding the order lease; uniqueness also protects cron retries.
create function public.accrue_managed_number_charges(_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare o public.managed_number_orders; q public.managed_number_quotes; p integer := 0;
begin
  select * into o from public.managed_number_orders where id = _order for update;
  if o.activated_at is null then return; end if;
  select * into q from public.managed_number_quotes where id = o.quote_id;
  while o.activated_at + make_interval(months => p) <= coalesce(o.carrier_released_at, now()) loop
    insert into public.managed_number_charges(workspace_id,order_id,period,amount_cents,description)
      values(o.workspace_id,o.id,p,q.monthly_cents + case when p = 0 then q.setup_cents else 0 end,
        case when p = 0 then 'Number setup and first month' else 'Monthly number rental' end)
      on conflict(order_id,period) do nothing;
    p := p + 1;
  end loop;
end $$;
revoke all on function public.accrue_managed_number_charges(uuid) from public, anon, authenticated;
grant execute on function public.accrue_managed_number_charges(uuid) to service_role;

-- Assignment changes invalidate audio verification even if an older call completed.
create function public.reset_phone_verification() returns trigger language plpgsql set search_path = public as $$
begin
  if new.agent_id is distinct from old.agent_id or new.environment_id is distinct from old.environment_id then new.verified_at := null; end if;
  return new;
end $$;
create trigger reset_phone_verification before update on public.phone_numbers for each row execute function public.reset_phone_verification();
create function public.reset_deployment_phone_verification() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'DELETE' then
    update public.phone_numbers set verified_at = null where workspace_id = new.workspace_id and agent_id = new.agent_id and environment_id = new.environment_id;
  end if;
  if tg_op <> 'INSERT' then
    update public.phone_numbers set verified_at = null where workspace_id = old.workspace_id and agent_id = old.agent_id and environment_id = old.environment_id;
  end if;
  return null;
end $$;
create trigger deployment_phone_verification after insert or update or delete on public.deployments for each row execute function public.reset_deployment_phone_verification();

-- Commit inbound usage accounting with call completion, including failed calls that used time.
create function public.record_managed_call_charge() returns trigger language plpgsql security definer set search_path = public as $$
declare o public.managed_number_orders; rate numeric;
begin
  if new.phone_number_id is null or new.channel <> 'pstn' or new.status not in ('completed','failed') or new.ended_at is null then return new; end if;
  select * into o from public.managed_number_orders where number_id = new.phone_number_id and workspace_id = new.workspace_id;
  if not found or o.activated_at is null then return new; end if;
  select inbound_rate::numeric into rate from public.managed_number_quotes where id = o.quote_id;
  insert into public.managed_call_charges(workspace_id,order_id,conversation_id,amount_cents)
    values(new.workspace_id,o.id,new.id,ceil(greatest(coalesce(new.duration_seconds,0),0)::numeric / 60 * rate * 100)::integer)
    on conflict(conversation_id) do nothing;
  return new;
end $$;
create trigger managed_call_charge after update of status on public.conversations for each row execute function public.record_managed_call_charge();

create function public.confirm_phone_verification(_workspace uuid, _number uuid, _test uuid, _conversation uuid)
returns void language plpgsql security definer set search_path = public as $$
declare n public.phone_numbers; t public.phone_verifications; c public.conversations;
begin
  select * into n from public.phone_numbers where id = _number and workspace_id = _workspace for update;
  if not found or n.status not in ('routed','active') then raise exception 'Phone route changed'; end if;
  select * into t from public.phone_verifications where id = _test and workspace_id = _workspace and number_id = n.id;
  if not found or t.agent_id is distinct from n.agent_id or t.environment_id is distinct from n.environment_id then raise exception 'Phone route changed'; end if;
  if exists(select 1 from public.phone_verifications where workspace_id = _workspace and number_id = n.id and requested_at > t.requested_at) then raise exception 'Start the latest phone test'; end if;
  if not exists(select 1 from public.deployments where workspace_id = _workspace and agent_id = t.agent_id and environment_id = t.environment_id and status = 'active' and canary_percent = 100 and agent_version = t.agent_version) then raise exception 'Deployment changed'; end if;
  select * into c from public.conversations where id = _conversation and workspace_id = _workspace and phone_number_id = n.id and channel = 'pstn'
    and agent_id = t.agent_id and environment_id = t.environment_id and agent_version = t.agent_version and started_at >= t.requested_at and status = 'completed';
  if not found then raise exception 'Complete the phone test first'; end if;
  if not exists(select 1 from public.conversation_turns where conversation_id = c.id and workspace_id = _workspace and role = 'user' and length(trim(content)) > 0)
    or not exists(select 1 from public.conversation_turns where conversation_id = c.id and workspace_id = _workspace and role = 'assistant' and length(trim(content)) > 0) then raise exception 'Speech is required in both directions'; end if;
  update public.phone_verifications set verified_at = now(), conversation_id = c.id where id = t.id;
  update public.phone_numbers set verified_at = now() where id = n.id;
end $$;
revoke all on function public.confirm_phone_verification(uuid,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.confirm_phone_verification(uuid,uuid,uuid,uuid) to service_role;

create function public.assign_managed_phone_route(_workspace uuid, _number uuid, _agent uuid, _environment uuid)
returns void language plpgsql security definer set search_path = public as $$
declare o public.managed_number_orders;
begin
  select * into o from public.managed_number_orders where workspace_id = _workspace and number_id = _number for update;
  if not found or o.state <> 'ready' or o.lease_at is not null then raise exception 'Wait for number setup to finish'; end if;
  if not exists(select 1 from public.agents where id = _agent and workspace_id = _workspace and status <> 'archived')
    or not exists(select 1 from public.environments where id = _environment and workspace_id = _workspace)
    or not exists(select 1 from public.deployments where workspace_id = _workspace and agent_id = _agent and environment_id = _environment and status = 'active' and canary_percent = 100 and bundle_id is not null)
    then raise exception 'Choose a deployed agent in this workspace'; end if;
  update public.phone_numbers set agent_id = _agent, environment_id = _environment where id = _number and workspace_id = _workspace and management_mode = 'managed' and status in ('active','routed');
  if not found then raise exception 'Phone route is not ready'; end if;
end $$;
revoke all on function public.assign_managed_phone_route(uuid,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.assign_managed_phone_route(uuid,uuid,uuid,uuid) to service_role;
-- END MIGRATION 20261022120000_managed_inbound.sql

NOTIFY pgrst, 'reload schema';
COMMIT;
SELECT 'VocollAI schema initialized successfully' AS result, 24 AS migrations_applied;
