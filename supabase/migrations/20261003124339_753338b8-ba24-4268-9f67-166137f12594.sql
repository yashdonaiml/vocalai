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