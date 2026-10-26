alter table public.workspaces
  add column if not exists developer_studio_enabled boolean not null default false;

create or replace function public.can_use_developer_studio(_ws uuid, _actor uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select public.is_staff(_actor)
    or exists (
      select 1
      from public.workspaces w
      join public.org_members m on m.org_id=w.org_id
      where w.id=_ws
        and w.developer_studio_enabled
        and m.user_id=_actor
    )
$$;

revoke all on function public.can_use_developer_studio(uuid,uuid) from public,anon;
grant execute on function public.can_use_developer_studio(uuid,uuid) to authenticated,service_role;

drop policy if exists "members read workflows" on public.workflows;
drop policy if exists "admins write workflows" on public.workflows;
create policy "developer studio reads workflows" on public.workflows
  for select to authenticated
  using (public.can_use_developer_studio(workspace_id,auth.uid()));
create policy "developer studio admins write workflows" on public.workflows
  for all to authenticated
  using (
    public.can_use_developer_studio(workspace_id,auth.uid())
    and public.is_workspace_member(workspace_id,'admin')
  )
  with check (
    public.can_use_developer_studio(workspace_id,auth.uid())
    and public.is_workspace_member(workspace_id,'admin')
  );

create table public.agent_builder_proposals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  conversation_key uuid not null,
  request_key uuid not null,
  user_message text not null check(char_length(user_message) between 1 and 4000),
  assistant_message text not null check(char_length(assistant_message) between 1 and 4000),
  proposed_profile jsonb,
  requested_destination text check(requested_destination in ('callback_inbox','google_sheets')),
  questions jsonb not null default '[]'::jsonb check(jsonb_typeof(questions)='array'),
  assumptions jsonb not null default '[]'::jsonb check(jsonb_typeof(assumptions)='array'),
  status text not null default 'proposed' check(status in ('proposed','applied','rejected')),
  based_on_revision integer,
  applied_agent_id uuid references public.agents(id) on delete set null,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  unique(workspace_id,request_key)
);

create index agent_builder_proposals_history
  on public.agent_builder_proposals(workspace_id,conversation_key,created_at);

alter table public.agent_builder_proposals enable row level security;
grant select on public.agent_builder_proposals to authenticated;
grant all on public.agent_builder_proposals to service_role;
create policy "admins read builder proposals" on public.agent_builder_proposals
  for select to authenticated
  using (public.is_workspace_member(workspace_id,'admin'));

