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