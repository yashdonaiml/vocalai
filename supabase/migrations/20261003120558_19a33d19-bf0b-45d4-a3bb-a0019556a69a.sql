create or replace function public.is_staff(_uid uuid) returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.user_roles where user_id = _uid and role in ('admin','operator')) $$;

create table public.platform_incidents (id uuid primary key default gen_random_uuid(), title text not null, severity text not null default 'minor', status text not null default 'investigating', notes text not null default '', created_by uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
grant select, insert, update on public.platform_incidents to authenticated; grant all on public.platform_incidents to service_role;
alter table public.platform_incidents enable row level security;
create policy "staff read incidents" on public.platform_incidents for select to authenticated using (public.is_staff(auth.uid()));
create policy "staff create incidents" on public.platform_incidents for insert to authenticated with check (public.is_staff(auth.uid()) and created_by = auth.uid());
create policy "staff update incidents" on public.platform_incidents for update to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

create table public.support_access_requests (id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade, requested_by uuid not null, reason text not null, duration_hours int not null check (duration_hours between 1 and 24), status text not null default 'pending', approved_by uuid, expires_at timestamptz, created_at timestamptz not null default now());
grant select on public.support_access_requests to authenticated; grant all on public.support_access_requests to service_role;
alter table public.support_access_requests enable row level security;
create policy "staff read access requests" on public.support_access_requests for select to authenticated using (public.is_staff(auth.uid()));

create table public.internal_audit_events (id uuid primary key default gen_random_uuid(), actor_id uuid not null, action text not null, target text, metadata jsonb not null default '{}', created_at timestamptz not null default now());
grant select on public.internal_audit_events to authenticated; grant all on public.internal_audit_events to service_role;
alter table public.internal_audit_events enable row level security;
create policy "staff read internal audit" on public.internal_audit_events for select to authenticated using (public.is_staff(auth.uid()));