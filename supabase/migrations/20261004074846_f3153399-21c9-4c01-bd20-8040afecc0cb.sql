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