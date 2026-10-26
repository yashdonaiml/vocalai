-- Resumable business-first builder state. The agent draft and setup revision move atomically.
alter table public.agent_setup_runs
  add column if not exists business_profile jsonb,
  add column if not exists profile_version integer;

alter table public.agent_setup_runs
  add constraint agent_setup_runs_business_profile_object
    check (business_profile is null or jsonb_typeof(business_profile) = 'object'),
  add constraint agent_setup_runs_profile_version_positive
    check (profile_version is null or profile_version > 0);

create or replace function public.save_business_profile_setup(
  _ws uuid,
  _setup uuid,
  _actor uuid,
  _revision integer,
  _profile jsonb,
  _config jsonb,
  _hash text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare s public.agent_setup_runs;
begin
  if not public.release_actor_is_admin(_ws, _actor) then
    raise exception 'Workspace admin required';
  end if;
  if jsonb_typeof(_profile) <> 'object' or (_profile->>'version')::integer <> 1 then
    raise exception 'Invalid business profile';
  end if;
  if _config->'business_profile' <> _profile or (_config->>'business_profile_version')::integer <> 1 then
    raise exception 'Business profile does not match compiled config';
  end if;

  select * into s
    from public.agent_setup_runs
    where id=_setup and workspace_id=_ws
    for update;
  if not found or s.revision <> _revision then
    raise exception 'Setup changed. Reload before saving.';
  end if;

  perform 1 from public.agents
    where id=s.agent_id and workspace_id=_ws and status='draft' and live_version is null
    for update;
  if not found then
    raise exception 'This assistant is no longer an editable preview draft';
  end if;

  update public.agents
    set name=_profile->'business'->>'name',
        description=left(coalesce(_profile->'business'->>'description', ''), 300),
        config=_config
    where id=s.agent_id;

  update public.agent_setup_runs
    set business_profile=_profile,
        profile_version=1,
        revision=revision+1,
        snapshot_hash=_hash,
        updated_at=now()
    where id=s.id
    returning * into s;
  return to_jsonb(s);
end $$;

revoke all on function public.save_business_profile_setup(uuid,uuid,uuid,integer,jsonb,jsonb,text)
  from public,anon,authenticated;
grant execute on function public.save_business_profile_setup(uuid,uuid,uuid,integer,jsonb,jsonb,text)
  to service_role;
