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