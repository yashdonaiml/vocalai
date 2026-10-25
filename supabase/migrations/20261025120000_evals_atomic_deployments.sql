-- Authoritative version-bound evaluations and transactional release promotion.
alter table public.eval_suites add column revision integer not null default 1;
alter table public.eval_runs add column agent_id uuid references public.agents(id) on delete cascade,
  add column suite_revision integer,
  add column agent_checksum text,
  add column runner_kind text,
  add column snapshot jsonb,
  add column error text;
alter table public.eval_run_items add column response text;

-- Serialize release-policy statements before row locks, including INSERT phantoms.
-- Governance writes are infrequent; one catalog lock avoids inverse row/advisory lock ordering.
create function public.lock_release_catalog() returns trigger language plpgsql set search_path=public as $$
begin perform pg_advisory_xact_lock(25120000); return null; end $$;
create trigger lock_eval_suites before insert or update or delete on public.eval_suites for each statement execute function public.lock_release_catalog();
create trigger lock_eval_cases before insert or update or delete on public.eval_cases for each statement execute function public.lock_release_catalog();

revoke insert, update, delete on public.eval_runs, public.eval_run_items from authenticated;
drop policy "ws members" on public.eval_runs;
create policy "members read authoritative runs" on public.eval_runs for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy "ws members" on public.eval_suites;
drop policy "ws members" on public.eval_cases;
create policy "members read suites" on public.eval_suites for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "admins manage suites" on public.eval_suites for all to authenticated
  using (public.is_workspace_member(workspace_id,'admin')) with check (public.is_workspace_member(workspace_id,'admin'));
create policy "members read cases" on public.eval_cases for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "admins manage cases" on public.eval_cases for all to authenticated
  using (public.is_workspace_member(workspace_id,'admin')) with check (public.is_workspace_member(workspace_id,'admin'));

create function public.guard_eval_suite() returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='UPDATE' and new.workspace_id<>old.workspace_id then raise exception 'Suite workspace cannot change'; end if;
  if new.agent_id is not null and not exists(select 1 from agents where id=new.agent_id and workspace_id=new.workspace_id) then raise exception 'Agent outside suite workspace'; end if;
  if new.pass_threshold not between 1 and 100 then raise exception 'Pass threshold must be between 1 and 100'; end if;
  new.revision := case when tg_op='INSERT' then 1 else old.revision+1 end;
  return new;
end $$;
create trigger guard_eval_suite before insert or update on public.eval_suites for each row execute function public.guard_eval_suite();

create function public.guard_eval_case() returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='UPDATE' and (new.workspace_id<>old.workspace_id or new.suite_id<>old.suite_id) then raise exception 'Case scope cannot change'; end if;
  if not exists(select 1 from eval_suites where id=new.suite_id and workspace_id=new.workspace_id) then raise exception 'Suite outside case workspace'; end if;
  return new;
end $$;
create trigger guard_eval_case before insert or update on public.eval_cases for each row execute function public.guard_eval_case();
create function public.bump_eval_suite_revision() returns trigger language plpgsql security definer set search_path=public as $$
begin
  update eval_suites set revision=revision+1 where id=case when tg_op='DELETE' then old.suite_id else new.suite_id end;
  return null;
end $$;
create trigger bump_eval_suite_revision after insert or update or delete on public.eval_cases for each row execute function public.bump_eval_suite_revision();

create function public.release_actor_is_admin(_workspace uuid,_actor uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from workspaces w join org_members m on m.org_id=w.org_id where w.id=_workspace and m.user_id=_actor and m.role in ('admin','owner'))
$$;

create function public.begin_eval_run(_suite uuid,_agent uuid,_version integer,_actor uuid,_kind text default 'text')
returns jsonb language plpgsql security definer set search_path=public as $$
declare s eval_suites; v agent_versions; c jsonb; r eval_runs;
begin
  perform pg_advisory_xact_lock(25120000);
  select * into s from eval_suites where id=_suite for update;
  if not found or not release_actor_is_admin(s.workspace_id,_actor) then raise exception 'Workspace admin required'; end if;
  if _kind not in ('text','runtime') then raise exception 'Unsupported evaluation runner'; end if;
  if s.agent_id is not null and s.agent_id<>_agent then raise exception 'Suite is bound to another agent'; end if;
  select * into v from agent_versions where agent_id=_agent and version=_version and workspace_id=s.workspace_id;
  if not found then raise exception 'Published agent version not found in workspace'; end if;
  select jsonb_agg(jsonb_build_object('id',id,'title',title,'caller_persona',caller_persona,'scenario',scenario,'rubric',rubric) order by id) into c
    from eval_cases where suite_id=s.id and workspace_id=s.workspace_id;
  if c is null or jsonb_array_length(c)=0 or jsonb_array_length(c)>20 then raise exception 'A suite needs 1 to 20 cases'; end if;
  if exists(select 1 from eval_runs where suite_id=s.id and agent_id=_agent and agent_version=_version and suite_revision=s.revision and status='running' and created_at>now()-interval '10 minutes') then raise exception 'This version is already being evaluated'; end if;
  insert into eval_runs(suite_id,workspace_id,agent_id,agent_version,suite_revision,agent_checksum,runner_kind,snapshot,status,total,created_by)
    values(s.id,s.workspace_id,_agent,_version,s.revision,v.checksum,_kind,jsonb_build_object('config',v.config,'cases',c),'running',jsonb_array_length(c),_actor) returning * into r;
  return to_jsonb(r);
end $$;

create function public.complete_eval_run(_run uuid,_kind text,_items jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare r eval_runs; item jsonb; n integer; yes integer:=0; seen uuid[]:='{}'; cid uuid;
begin
  select * into r from eval_runs where id=_run for update;
  if not found or r.status<>'running' or r.runner_kind<>_kind or r.snapshot is null then raise exception 'Evaluation is not running for this runner'; end if;
  if jsonb_typeof(_items) is distinct from 'array' then raise exception 'Per-case results required'; end if;
  n:=jsonb_array_length(_items);
  if n<1 or n is distinct from r.total or jsonb_typeof(r.snapshot->'cases') is distinct from 'array'
    or n is distinct from jsonb_array_length(r.snapshot->'cases') then raise exception 'Every frozen case needs one result'; end if;
  for item in select * from jsonb_array_elements(_items) loop
    if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'caseId') is distinct from 'string'
      or jsonb_typeof(item->'passed') is distinct from 'boolean' or jsonb_typeof(item->'response') is distinct from 'string'
      or jsonb_typeof(item->'notes') is distinct from 'string' then raise exception 'Typed per-case evidence required'; end if;
    cid:=(item->>'caseId')::uuid;
    if cid=any(seen) or not exists(select 1 from jsonb_array_elements(r.snapshot->'cases') c where c->>'id'=cid::text)
      or coalesce(length(item->>'response'),0)=0 or coalesce(length(item->>'notes'),0)=0
      or length(item->>'response')>12000 or length(item->>'notes')>2000 then raise exception 'Invalid or duplicate case result'; end if;
    seen:=array_append(seen,cid);
    if (item->>'passed')::boolean then yes:=yes+1; end if;
    insert into eval_run_items(run_id,workspace_id,case_id,case_title,passed,score,notes,response)
      select r.id,r.workspace_id,case when exists(select 1 from eval_cases where id=cid) then cid else null end,c->>'title',(item->>'passed')::boolean,
        case when (item->>'passed')::boolean then 100 else 0 end,item->>'notes',item->>'response'
      from jsonb_array_elements(r.snapshot->'cases') c where c->>'id'=cid::text;
  end loop;
  update eval_runs set status='completed',passed=yes,score=round(100.0*yes/n),finished_at=now(),error=null where id=r.id returning * into r;
  return jsonb_build_object('id',r.id,'status',r.status,'score',r.score,'passed',r.passed,'total',r.total);
end $$;

create function public.fail_eval_run(_run uuid,_kind text) returns void language sql security definer set search_path=public as $$
  update eval_runs set status='failed',score=null,error='Evaluation could not finish. Check provider configuration and retry.',finished_at=now()
  where id=_run and runner_kind=_kind and status='running'
$$;

-- Old duplicate full deployments are normalized before adding the invariant.
with ranked as(select id,row_number() over(partition by workspace_id,agent_id,environment_id order by created_at desc,id desc) n from deployments where status='active' and canary_percent=100)
update deployments set status='superseded' where id in(select id from ranked where n>1);
create unique index one_active_full_deployment on public.deployments(workspace_id,agent_id,environment_id) where status='active' and canary_percent=100;

create function public.promote_agent_deployment(_workspace uuid,_agent uuid,_environment uuid,_version integer,_bundle uuid,_actor uuid,_canary integer default 100)
returns uuid language plpgsql security definer set search_path=public as $$
declare e environments; v agent_versions; b runtime_bundles; s eval_suites; deployed_id uuid;
begin
  perform pg_advisory_xact_lock(25120000);
  if not release_actor_is_admin(_workspace,_actor) then raise exception 'Workspace admin required'; end if;
  select * into e from environments where id=_environment and workspace_id=_workspace for update;
  if not found or _canary not between 1 and 100 then raise exception 'Invalid environment or rollout'; end if;
  select * into v from agent_versions where agent_id=_agent and workspace_id=_workspace and version=_version;
  if not found then raise exception 'Published version not found'; end if;
  select * into b from runtime_bundles where runtime_bundles.id=_bundle and workspace_id=_workspace and agent_id=_agent and environment_id=e.id and agent_version=_version;
  if not found or b.bundle->'agent'->>'id' is distinct from _agent::text or (b.bundle->'agent'->>'version')::integer is distinct from _version
    or b.bundle->>'workspace_id' is distinct from _workspace::text or b.bundle->>'environment_id' is distinct from e.id::text
    or b.checksum is null or length(b.checksum)=0 then raise exception 'Bundle does not match release'; end if;
  if e.kind='production' and _canary=100 then
    for s in select * from eval_suites where workspace_id=_workspace and gates_promotion and (agent_id is null or agent_id=_agent) order by eval_suites.id for share loop
      if not exists(select 1 from eval_runs r where r.suite_id=s.id and r.workspace_id=_workspace and r.agent_id=_agent and r.agent_version=_version
        and r.agent_checksum=v.checksum and r.suite_revision=s.revision and r.status='completed' and r.finished_at is not null and r.total>0
        and r.snapshot is not null and r.total=jsonb_array_length(r.snapshot->'cases') and r.score>=s.pass_threshold) then
        raise exception 'Blocked: suite "%" needs a completed passing run on this version and suite revision',s.name;
      end if;
    end loop;
  end if;
  if _canary=100 then update deployments set status='superseded' where workspace_id=_workspace and agent_id=_agent and environment_id=e.id and status='active'; end if;
  insert into deployments(workspace_id,agent_id,environment_id,agent_version,bundle_id,canary_percent,created_by)
    values(_workspace,_agent,e.id,_version,_bundle,_canary,_actor) returning deployments.id into deployed_id;
  if e.kind='production' and _canary=100 then update agents set live_version=_version,status='live' where agents.id=_agent and workspace_id=_workspace; end if;
  return deployed_id;
end $$;

-- Published snapshots must stay immutable after their checksum has been evaluated.
create trigger immutable_agent_version before update on public.agent_versions for each row execute function public.forbid_update();
create trigger immutable_runtime_bundle before update on public.runtime_bundles for each row execute function public.forbid_update();

revoke all on function public.release_actor_is_admin(uuid,uuid),public.begin_eval_run(uuid,uuid,integer,uuid,text),public.complete_eval_run(uuid,text,jsonb),public.fail_eval_run(uuid,text),public.promote_agent_deployment(uuid,uuid,uuid,integer,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.release_actor_is_admin(uuid,uuid),public.begin_eval_run(uuid,uuid,integer,uuid,text),public.complete_eval_run(uuid,text,jsonb),public.fail_eval_run(uuid,text),public.promote_agent_deployment(uuid,uuid,uuid,integer,uuid,uuid,integer) to service_role;
revoke all on function public.guard_eval_suite(),public.guard_eval_case(),public.bump_eval_suite_revision(),public.lock_release_catalog() from public,anon,authenticated;
