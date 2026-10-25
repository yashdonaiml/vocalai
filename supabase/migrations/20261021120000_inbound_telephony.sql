alter table public.phone_numbers
  add column provisioning_error text,
  add column provisioning_token uuid,
  add column provisioning_started_at timestamptz,
  add column last_call_at timestamptz;
alter table public.conversations
  add column phone_number_id uuid references public.phone_numbers(id) on delete set null,
  add column caller_number text;

-- Provisioning and routing now go through authenticated server functions.
revoke insert, update, delete on public.phone_numbers from authenticated;
create or replace function public.validate_phone_route() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.agent_id is not null and not exists (
    select 1 from public.agents where id = new.agent_id and workspace_id = new.workspace_id
  ) then raise exception 'Agent is outside this workspace'; end if;
  if new.environment_id is not null and not exists (
    select 1 from public.environments where id = new.environment_id and workspace_id = new.workspace_id
  ) then raise exception 'Environment is outside this workspace'; end if;
  return new;
end $$;
create trigger validate_phone_route before insert or update of agent_id, environment_id, workspace_id
on public.phone_numbers for each row execute function public.validate_phone_route();

-- A retried transcript batch must neither duplicate turns nor bill a call twice.
create table public.runtime_event_batches (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.runtime_event_batches enable row level security;
grant all on public.runtime_event_batches to service_role;

create or replace function public.ingest_runtime_events(_session_id uuid, _batch_id uuid, _events jsonb)
returns boolean language plpgsql set search_path = public as $$
declare c public.conversations%rowtype; ev jsonb; next_seq int; seconds int; batch_claim uuid;
begin
  select * into c from public.conversations where id = _session_id for update;
  if not found then raise exception 'Session not found'; end if;
  if jsonb_typeof(_events) <> 'array' or jsonb_array_length(_events) > 200 then
    raise exception 'Invalid runtime event batch';
  end if;
  insert into public.runtime_event_batches(id, workspace_id, conversation_id)
    values (_batch_id, c.workspace_id, c.id) on conflict do nothing returning id into batch_claim;
  if batch_claim is null then return false; end if;
  if c.status <> 'active' then return false; end if;
  select coalesce(max(seq) + 1, 0) into next_seq from public.conversation_turns where conversation_id = c.id;
  for ev in select value from jsonb_array_elements(_events) loop
    if ev->>'type' = 'turn' and length(trim(ev->>'content')) > 0 then
      if ev->>'role' not in ('user', 'assistant') then raise exception 'Invalid turn role'; end if;
      insert into public.conversation_turns(conversation_id, workspace_id, seq, role, content)
        values (c.id, c.workspace_id, next_seq, ev->>'role', left(trim(ev->>'content'), 8000));
      next_seq := next_seq + 1;
      if ev->>'role' = 'user' then
        update public.conversations set summary = left(ev->>'content', 160) where id = c.id and summary is null;
      end if;
    elsif ev->>'type' = 'usage' then
      insert into public.usage_events(workspace_id, conversation_id, kind, model, quantity, unit)
        values (c.workspace_id, c.id, ev->>'kind', ev->>'model', (ev->>'quantity')::numeric, ev->>'unit');
    elsif ev->>'type' = 'end' then
      seconds := greatest(0, round(extract(epoch from (now() - c.started_at)))::int);
      update public.conversations set status = case when ev->>'reason' = 'runtime_error' then 'failed' else 'completed' end,
        ended_at = now(), duration_seconds = seconds where id = c.id;
      update public.tool_pending_actions set status = 'invalidated'
        where workspace_id = c.workspace_id and session_id = c.id::text and status = 'pending';
      insert into public.usage_events(workspace_id, conversation_id, kind, model, quantity, unit)
        values (c.workspace_id, c.id, 'voice_minutes', 'session', greatest(seconds, 1) / 60.0, 'minutes');
      exit;
    end if;
  end loop;
  return true;
end $$;
revoke all on function public.ingest_runtime_events(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_runtime_events(uuid, uuid, jsonb) to service_role;
