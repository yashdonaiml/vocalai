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