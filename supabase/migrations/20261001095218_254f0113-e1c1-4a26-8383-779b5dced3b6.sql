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