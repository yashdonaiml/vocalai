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