-- Managed carrier cost, order internals, and verification records are server-only.
revoke select on public.managed_number_quotes, public.managed_number_orders,
  public.phone_verifications, public.managed_number_charges, public.managed_call_charges
  from authenticated;

alter table public.phone_verifications
  add column challenge text;
alter table public.phone_verifications
  add column expires_at timestamptz;

-- Existing tests predate challenges. Give them a deterministic phrase but expire them at
-- their original request deadline instead of granting a fresh verification window.
update public.phone_verifications
set challenge = 'AVIROH ' || upper(substr(md5(id::text), 1, 6)),
    expires_at = requested_at + interval '30 minutes';
alter table public.phone_verifications
  alter column challenge set not null,
  alter column expires_at set not null,
  alter column expires_at set default now() + interval '30 minutes',
  add constraint phone_verifications_challenge_format check (challenge ~ '^AVIROH [A-F0-9]{6}$');

create or replace function public.confirm_phone_verification(_workspace uuid, _number uuid, _test uuid, _conversation uuid)
returns void language plpgsql security definer set search_path = public as $$
declare n public.phone_numbers; t public.phone_verifications; c public.conversations;
begin
  select * into n from public.phone_numbers where id = _number and workspace_id = _workspace for update;
  if not found or n.status not in ('routed','active') then raise exception 'Phone route changed'; end if;
  select * into t from public.phone_verifications where id = _test and workspace_id = _workspace and number_id = n.id;
  if not found or t.agent_id is distinct from n.agent_id or t.environment_id is distinct from n.environment_id then raise exception 'Phone route changed'; end if;
  if t.expires_at <= now() then raise exception 'Phone test expired'; end if;
  if exists(select 1 from public.phone_verifications where workspace_id = _workspace and number_id = n.id and requested_at > t.requested_at) then raise exception 'Start the latest phone test'; end if;
  if not exists(select 1 from public.deployments where workspace_id = _workspace and agent_id = t.agent_id and environment_id = t.environment_id and status = 'active' and canary_percent = 100 and agent_version = t.agent_version) then raise exception 'Deployment changed'; end if;
  select * into c from public.conversations where id = _conversation and workspace_id = _workspace and phone_number_id = n.id and channel = 'pstn'
    and agent_id = t.agent_id and environment_id = t.environment_id and agent_version = t.agent_version and started_at >= t.requested_at and started_at <= t.expires_at and status = 'completed';
  if not found then raise exception 'Complete the phone test first'; end if;
  if not exists(select 1 from public.conversation_turns where conversation_id = c.id and workspace_id = _workspace and role = 'user' and length(trim(content)) > 0 and position(lower(t.challenge) in lower(content)) > 0)
    or not exists(select 1 from public.conversation_turns where conversation_id = c.id and workspace_id = _workspace and role = 'assistant' and length(trim(content)) > 0) then raise exception 'Say the test phrase and complete speech in both directions'; end if;
  update public.phone_verifications set verified_at = now(), conversation_id = c.id where id = t.id;
  update public.phone_numbers set verified_at = now() where id = n.id;
end $$;