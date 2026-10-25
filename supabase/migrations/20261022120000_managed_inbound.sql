-- Platform-managed inbound numbers. All mutations are server-only.
alter table public.phone_numbers add column management_mode text not null default 'external' check (management_mode in ('external','managed'));
alter table public.phone_numbers add column verified_at timestamptz;
alter table public.phone_numbers drop constraint phone_numbers_e164_key;
create unique index phone_numbers_current_e164 on public.phone_numbers(e164) where status <> 'released';

create table public.managed_number_quotes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  e164 text not null check (e164 ~ '^\+1[0-9]{10}$'),
  currency text not null default 'USD' check (currency = 'USD'),
  monthly_cents integer not null check (monthly_cents >= 0),
  setup_cents integer not null check (setup_cents >= 0),
  inbound_rate text not null check (inbound_rate ~ '^[0-9]{1,3}(\.[0-9]{1,6})?$' and inbound_rate::numeric <= 100),
  carrier_monthly_cents integer not null check (carrier_monthly_cents >= 0),
  carrier_setup_cents integer not null check (carrier_setup_cents >= 0),
  expires_at timestamptz not null default now() + interval '5 minutes',
  created_at timestamptz not null default now()
);
create table public.managed_number_orders (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id),
  quote_id uuid not null unique references public.managed_number_quotes(id),
  number_id uuid not null unique references public.phone_numbers(id),
  state text not null default 'reserved' check (state in ('reserved','ordering','activation','routing','ready','error','review','releasing','released','failed')),
  connection_ref text, carrier_order_ref text, carrier_number_ref text,
  submitted_at timestamptz, activated_at timestamptz, carrier_released_at timestamptz,
  lease_token uuid, lease_at timestamptz, error text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index managed_carrier_order_unique on public.managed_number_orders(carrier_order_ref) where carrier_order_ref is not null;
create unique index managed_carrier_number_unique on public.managed_number_orders(carrier_number_ref) where carrier_number_ref is not null;
create index managed_orders_reconcile on public.managed_number_orders(state, updated_at);

create table public.phone_verifications (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  number_id uuid not null references public.phone_numbers(id), agent_id uuid not null references public.agents(id),
  environment_id uuid not null references public.environments(id), agent_version integer not null,
  requested_at timestamptz not null default now(), verified_at timestamptz,
  conversation_id uuid references public.conversations(id)
);
create index phone_verification_recent on public.phone_verifications(number_id, requested_at desc);
create table public.managed_number_charges (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  order_id uuid not null references public.managed_number_orders(id), period integer not null check (period >= 0),
  currency text not null default 'USD', amount_cents integer not null check (amount_cents >= 0),
  description text not null, created_at timestamptz not null default now(), unique(order_id, period)
);
create table public.managed_call_charges (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  order_id uuid not null references public.managed_number_orders(id), conversation_id uuid not null unique references public.conversations(id),
  currency text not null default 'USD', amount_cents integer not null check (amount_cents >= 0),
  description text not null default 'Inbound call usage', created_at timestamptz not null default now()
);

alter table public.managed_number_quotes enable row level security;
alter table public.managed_number_orders enable row level security;
alter table public.phone_verifications enable row level security;
alter table public.managed_number_charges enable row level security;
alter table public.managed_call_charges enable row level security;
grant select on public.managed_number_quotes, public.managed_number_orders, public.phone_verifications, public.managed_number_charges to authenticated;
grant all on public.managed_number_quotes, public.managed_number_orders, public.phone_verifications, public.managed_number_charges to service_role;
grant select on public.managed_call_charges to authenticated;
grant all on public.managed_call_charges to service_role;
create policy managed_quotes_read on public.managed_number_quotes for select to authenticated using (public.is_workspace_member(workspace_id));
create policy managed_orders_read on public.managed_number_orders for select to authenticated using (public.is_workspace_member(workspace_id));
create policy phone_verifications_read on public.phone_verifications for select to authenticated using (public.is_workspace_member(workspace_id));
create policy number_charges_read on public.managed_number_charges for select to authenticated using (public.is_workspace_member(workspace_id));
create policy call_charges_read on public.managed_call_charges for select to authenticated using (public.is_workspace_member(workspace_id));

-- A workspace lock serializes purchases across different request keys and quotes.
create function public.reserve_managed_number(_workspace uuid, _quote uuid, _agent uuid, _environment uuid, _request uuid, _limit integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare q public.managed_number_quotes; o public.managed_number_orders; n uuid;
begin
  perform 1 from public.workspaces where id = _workspace for update;
  if not found then raise exception 'Workspace not found'; end if;
  select * into o from public.managed_number_orders where id = _request;
  if found then
    if o.workspace_id <> _workspace or o.quote_id <> _quote then raise exception 'Purchase request already used'; end if;
    if not exists(select 1 from public.phone_numbers where id = o.number_id and agent_id = _agent and environment_id = _environment) then raise exception 'Purchase request already used with another assignment'; end if;
    return o.id;
  end if;
  select * into q from public.managed_number_quotes where id = _quote and workspace_id = _workspace and expires_at > now() for update;
  if not found then raise exception 'Quote expired. Search again.'; end if;
  if not exists(select 1 from public.agents where id = _agent and workspace_id = _workspace and status <> 'archived')
    or not exists(select 1 from public.environments where id = _environment and workspace_id = _workspace)
    or not exists(select 1 from public.deployments where workspace_id = _workspace and agent_id = _agent and environment_id = _environment and status = 'active' and canary_percent = 100 and bundle_id is not null)
    then raise exception 'Choose an agent with a full published deployment in this workspace'; end if;
  if _limit < 1 or (select count(*) from public.managed_number_orders where workspace_id = _workspace and state <> 'released' and not (state = 'failed' and submitted_at is null)) >= _limit then
    raise exception 'Managed number limit reached. Contact support.';
  end if;
  insert into public.phone_numbers(workspace_id,e164,carrier,agent_id,environment_id,management_mode,status)
    values(_workspace,q.e164,'telnyx',_agent,_environment,'managed','pending') returning id into n;
  insert into public.managed_number_orders(id,workspace_id,quote_id,number_id) values(_request,_workspace,_quote,n);
  return _request;
end $$;
revoke all on function public.reserve_managed_number(uuid,uuid,uuid,uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.reserve_managed_number(uuid,uuid,uuid,uuid,uuid,integer) to service_role;

-- Accounting ledger, not a payment processor. Period 0 includes setup and first month.
-- Run while holding the order lease; uniqueness also protects cron retries.
create function public.accrue_managed_number_charges(_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare o public.managed_number_orders; q public.managed_number_quotes; p integer := 0;
begin
  select * into o from public.managed_number_orders where id = _order for update;
  if o.activated_at is null then return; end if;
  select * into q from public.managed_number_quotes where id = o.quote_id;
  while o.activated_at + make_interval(months => p) <= coalesce(o.carrier_released_at, now()) loop
    insert into public.managed_number_charges(workspace_id,order_id,period,amount_cents,description)
      values(o.workspace_id,o.id,p,q.monthly_cents + case when p = 0 then q.setup_cents else 0 end,
        case when p = 0 then 'Number setup and first month' else 'Monthly number rental' end)
      on conflict(order_id,period) do nothing;
    p := p + 1;
  end loop;
end $$;
revoke all on function public.accrue_managed_number_charges(uuid) from public, anon, authenticated;
grant execute on function public.accrue_managed_number_charges(uuid) to service_role;

-- Assignment changes invalidate audio verification even if an older call completed.
create function public.reset_phone_verification() returns trigger language plpgsql set search_path = public as $$
begin
  if new.agent_id is distinct from old.agent_id or new.environment_id is distinct from old.environment_id then new.verified_at := null; end if;
  return new;
end $$;
create trigger reset_phone_verification before update on public.phone_numbers for each row execute function public.reset_phone_verification();
create function public.reset_deployment_phone_verification() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'DELETE' then
    update public.phone_numbers set verified_at = null where workspace_id = new.workspace_id and agent_id = new.agent_id and environment_id = new.environment_id;
  end if;
  if tg_op <> 'INSERT' then
    update public.phone_numbers set verified_at = null where workspace_id = old.workspace_id and agent_id = old.agent_id and environment_id = old.environment_id;
  end if;
  return null;
end $$;
create trigger deployment_phone_verification after insert or update or delete on public.deployments for each row execute function public.reset_deployment_phone_verification();

-- Commit inbound usage accounting with call completion, including failed calls that used time.
create function public.record_managed_call_charge() returns trigger language plpgsql security definer set search_path = public as $$
declare o public.managed_number_orders; rate numeric;
begin
  if new.phone_number_id is null or new.channel <> 'pstn' or new.status not in ('completed','failed') or new.ended_at is null then return new; end if;
  select * into o from public.managed_number_orders where number_id = new.phone_number_id and workspace_id = new.workspace_id;
  if not found or o.activated_at is null then return new; end if;
  select inbound_rate::numeric into rate from public.managed_number_quotes where id = o.quote_id;
  insert into public.managed_call_charges(workspace_id,order_id,conversation_id,amount_cents)
    values(new.workspace_id,o.id,new.id,ceil(greatest(coalesce(new.duration_seconds,0),0)::numeric / 60 * rate * 100)::integer)
    on conflict(conversation_id) do nothing;
  return new;
end $$;
create trigger managed_call_charge after update of status on public.conversations for each row execute function public.record_managed_call_charge();

create function public.confirm_phone_verification(_workspace uuid, _number uuid, _test uuid, _conversation uuid)
returns void language plpgsql security definer set search_path = public as $$
declare n public.phone_numbers; t public.phone_verifications; c public.conversations;
begin
  select * into n from public.phone_numbers where id = _number and workspace_id = _workspace for update;
  if not found or n.status not in ('routed','active') then raise exception 'Phone route changed'; end if;
  select * into t from public.phone_verifications where id = _test and workspace_id = _workspace and number_id = n.id;
  if not found or t.agent_id is distinct from n.agent_id or t.environment_id is distinct from n.environment_id then raise exception 'Phone route changed'; end if;
  if exists(select 1 from public.phone_verifications where workspace_id = _workspace and number_id = n.id and requested_at > t.requested_at) then raise exception 'Start the latest phone test'; end if;
  if not exists(select 1 from public.deployments where workspace_id = _workspace and agent_id = t.agent_id and environment_id = t.environment_id and status = 'active' and canary_percent = 100 and agent_version = t.agent_version) then raise exception 'Deployment changed'; end if;
  select * into c from public.conversations where id = _conversation and workspace_id = _workspace and phone_number_id = n.id and channel = 'pstn'
    and agent_id = t.agent_id and environment_id = t.environment_id and agent_version = t.agent_version and started_at >= t.requested_at and status = 'completed';
  if not found then raise exception 'Complete the phone test first'; end if;
  if not exists(select 1 from public.conversation_turns where conversation_id = c.id and workspace_id = _workspace and role = 'user' and length(trim(content)) > 0)
    or not exists(select 1 from public.conversation_turns where conversation_id = c.id and workspace_id = _workspace and role = 'assistant' and length(trim(content)) > 0) then raise exception 'Speech is required in both directions'; end if;
  update public.phone_verifications set verified_at = now(), conversation_id = c.id where id = t.id;
  update public.phone_numbers set verified_at = now() where id = n.id;
end $$;
revoke all on function public.confirm_phone_verification(uuid,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.confirm_phone_verification(uuid,uuid,uuid,uuid) to service_role;

create function public.assign_managed_phone_route(_workspace uuid, _number uuid, _agent uuid, _environment uuid)
returns void language plpgsql security definer set search_path = public as $$
declare o public.managed_number_orders;
begin
  select * into o from public.managed_number_orders where workspace_id = _workspace and number_id = _number for update;
  if not found or o.state <> 'ready' or o.lease_at is not null then raise exception 'Wait for number setup to finish'; end if;
  if not exists(select 1 from public.agents where id = _agent and workspace_id = _workspace and status <> 'archived')
    or not exists(select 1 from public.environments where id = _environment and workspace_id = _workspace)
    or not exists(select 1 from public.deployments where workspace_id = _workspace and agent_id = _agent and environment_id = _environment and status = 'active' and canary_percent = 100 and bundle_id is not null)
    then raise exception 'Choose a deployed agent in this workspace'; end if;
  update public.phone_numbers set agent_id = _agent, environment_id = _environment where id = _number and workspace_id = _workspace and management_mode = 'managed' and status in ('active','routed');
  if not found then raise exception 'Phone route is not ready'; end if;
end $$;
revoke all on function public.assign_managed_phone_route(uuid,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.assign_managed_phone_route(uuid,uuid,uuid,uuid) to service_role;
