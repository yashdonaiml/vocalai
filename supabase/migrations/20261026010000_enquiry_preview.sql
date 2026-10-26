-- Guided inbox preview: service-owned setup state and an explicit test-only session boundary.
create table public.agent_setup_runs (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 agent_id uuid not null references public.agents(id) on delete cascade, pack_version integer not null default 1,
 revision integer not null default 1, snapshot_hash text not null, request_key uuid not null,
 tool_id uuid references public.tool_definitions(id), tool_revision_id uuid references public.tool_revisions(id),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(workspace_id,agent_id), unique(workspace_id,request_key)
);
create table public.setup_preview_sessions (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 setup_id uuid not null references public.agent_setup_runs(id) on delete cascade,
 actor_id uuid not null references auth.users(id), setup_revision integer not null, snapshot_hash text not null,
 request_key uuid not null, session_id uuid unique references public.conversations(id) on delete cascade,
 bundle_id uuid references public.runtime_bundles(id), status text not null default 'preparing' check(status in ('preparing','ready','failed')),
 expires_at timestamptz not null default now()+interval '15 minutes', created_at timestamptz not null default now(),
 unique(setup_id,request_key)
);
alter table public.agent_setup_runs enable row level security;
alter table public.setup_preview_sessions enable row level security;
grant select on public.agent_setup_runs,public.setup_preview_sessions to authenticated;
grant all on public.agent_setup_runs,public.setup_preview_sessions to service_role;
create policy "admins read enquiry setup" on public.agent_setup_runs for select to authenticated using(public.is_workspace_member(workspace_id,'admin'));
create policy "admins read preview sessions" on public.setup_preview_sessions for select to authenticated using(public.is_workspace_member(workspace_id,'admin'));

create function public.begin_enquiry_setup(_ws uuid,_actor uuid,_request uuid,_agent uuid,_name text,_config jsonb,_hash text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s agent_setup_runs; a uuid;
begin
 if not release_actor_is_admin(_ws,_actor) then raise exception 'Workspace admin required'; end if;
 perform pg_advisory_xact_lock(hashtext('enquiry-setup:'||_ws::text));
 select * into s from agent_setup_runs where workspace_id=_ws and (request_key=_request or agent_id=_agent) limit 1;
 if found then return to_jsonb(s); end if;
 if _agent is null then
  insert into agents(workspace_id,name,description,config) values(_ws,_name,left(_config->'enquiry_business'->>'brief',300),_config) returning id into a;
 else
  perform 1 from agents where id=_agent and workspace_id=_ws and status='draft' and live_version is null for update;
  if not found then raise exception 'Use a new draft for this inbox preview'; end if;
  if exists(select 1 from agent_tool_bindings where agent_id=_agent) or exists(select 1 from agent_knowledge_bases where agent_id=_agent) then raise exception 'This draft already has connected resources. Create a new enquiry assistant.'; end if;
  a:=_agent;
  update agents set name=_name,config=_config,description=left(_config->'enquiry_business'->>'brief',300) where id=a;
 end if;
 insert into agent_setup_runs(workspace_id,agent_id,created_by,request_key,snapshot_hash) values(_ws,a,_actor,_request,_hash) returning * into s;
 return to_jsonb(s);
end $$;

create function public.save_enquiry_setup(_ws uuid,_setup uuid,_actor uuid,_revision integer,_name text,_config jsonb,_hash text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s agent_setup_runs;
begin
 if not release_actor_is_admin(_ws,_actor) then raise exception 'Workspace admin required'; end if;
 select * into s from agent_setup_runs where id=_setup and workspace_id=_ws for update;
 if not found or s.revision<>_revision then raise exception 'Setup changed. Reload before saving.'; end if;
 perform 1 from agents where id=s.agent_id and workspace_id=_ws and status='draft' and live_version is null for update;
 if not found then raise exception 'This assistant is no longer an editable preview draft'; end if;
 update agents set name=_name,description=left(_config->'enquiry_business'->>'brief',300),config=_config where id=s.agent_id;
 update agent_setup_runs set revision=revision+1,snapshot_hash=_hash,updated_at=now() where id=s.id returning * into s;
 return to_jsonb(s);
end $$;

create function public.claim_enquiry_preview(_ws uuid,_setup uuid,_actor uuid,_revision integer,_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s agent_setup_runs; p setup_preview_sessions;
begin
 if not release_actor_is_admin(_ws,_actor) then raise exception 'Workspace admin required'; end if;
 select * into s from agent_setup_runs where id=_setup and workspace_id=_ws for update;
 if not found or s.revision<>_revision or s.tool_revision_id is null then raise exception 'Save and prepare this draft before testing'; end if;
 select * into p from setup_preview_sessions where setup_id=s.id and request_key=_request;
 if found then
  if p.actor_id<>_actor or p.setup_revision<>s.revision or p.snapshot_hash<>s.snapshot_hash then raise exception 'Test belongs to a different draft or owner'; end if;
  if p.status='failed' and p.session_id is null then
   update setup_preview_sessions set status='preparing',expires_at=now()+interval '15 minutes' where id=p.id returning * into p;
   return jsonb_build_object('claimed',true,'preview',to_jsonb(p));
  end if;
  return jsonb_build_object('claimed',false,'preview',to_jsonb(p));
 end if;
 if exists(select 1 from setup_preview_sessions where setup_id=s.id and status in ('preparing','ready') and expires_at>now()
   and (session_id is null or exists(select 1 from conversations c where c.id=session_id and c.status='active'))) then
  raise exception 'A preview is already running. End it before starting another.';
 end if;
 insert into setup_preview_sessions(workspace_id,setup_id,actor_id,setup_revision,snapshot_hash,request_key)
 values(_ws,s.id,_actor,s.revision,s.snapshot_hash,_request) returning * into p;
 return jsonb_build_object('claimed',true,'preview',to_jsonb(p));
end $$;

revoke all on function public.begin_enquiry_setup(uuid,uuid,uuid,uuid,text,jsonb,text),public.save_enquiry_setup(uuid,uuid,uuid,integer,text,jsonb,text),public.claim_enquiry_preview(uuid,uuid,uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.begin_enquiry_setup(uuid,uuid,uuid,uuid,text,jsonb,text),public.save_enquiry_setup(uuid,uuid,uuid,integer,text,jsonb,text),public.claim_enquiry_preview(uuid,uuid,uuid,integer,uuid) to service_role;
