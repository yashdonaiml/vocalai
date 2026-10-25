
-- RBAC
create table public.permissions (key text primary key);
create table public.roles (id uuid primary key default gen_random_uuid(), org_id uuid references public.organizations(id) on delete cascade, name text not null, created_at timestamptz not null default now(), unique nulls not distinct (org_id, name));
create table public.role_permissions (role_id uuid not null references public.roles(id) on delete cascade, permission_key text not null references public.permissions(key) on delete cascade, primary key (role_id, permission_key));
create table public.role_assignments (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, role_id uuid not null references public.roles(id) on delete cascade, scope_type text not null check (scope_type in ('org','workspace')), scope_id uuid not null, granted_by uuid, expires_at timestamptz, created_at timestamptz not null default now(), unique (user_id, role_id, scope_type, scope_id));
grant select on public.permissions, public.roles, public.role_permissions, public.role_assignments to authenticated;
grant all on public.permissions, public.roles, public.role_permissions, public.role_assignments to service_role;
alter table public.permissions enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.role_assignments enable row level security;
create policy "perm read" on public.permissions for select to authenticated using (true);
create policy "roles read" on public.roles for select to authenticated using (org_id is null or public.is_org_member(org_id));
create policy "role perms read" on public.role_permissions for select to authenticated using (exists (select 1 from public.roles r where r.id = role_id and (r.org_id is null or public.is_org_member(r.org_id))));
create policy "assignments read" on public.role_assignments for select to authenticated using (user_id = auth.uid() or (scope_type='org' and public.is_org_member(scope_id, 'admin')) or (scope_type='workspace' and public.is_workspace_member(scope_id, 'admin')));

insert into public.permissions(key) values
 ('connector.read'),('connector.create'),('connector.update'),('connector.pause'),('connector.delete'),('credential.manage'),
 ('tool.read'),('tool.approve'),('tool.revoke'),('tool.policy.edit'),('tool.test.mock'),('tool.test.sandbox'),('tool.test.live'),
 ('tool.execution.read'),('tool.decision.read'),('agent.bind_tools'),('agent.publish'),('workflow.bind_tools'),('workflow.publish'),('delegation.manage');
insert into public.roles(org_id, name) values (null,'Owner'),(null,'Admin'),(null,'Builder'),(null,'Reviewer'),(null,'Operator'),(null,'Viewer');
insert into public.role_permissions select r.id, p.key from public.roles r, public.permissions p where r.org_id is null and r.name='Owner';
insert into public.role_permissions select r.id, p.key from public.roles r, public.permissions p where r.org_id is null and r.name='Admin' and p.key <> 'delegation.manage';
insert into public.role_permissions select r.id, p.key from public.roles r, public.permissions p where r.org_id is null and r.name='Builder' and p.key in ('connector.read','tool.read','tool.execution.read','tool.test.mock','tool.test.sandbox','agent.bind_tools','workflow.bind_tools');
insert into public.role_permissions select r.id, p.key from public.roles r, public.permissions p where r.org_id is null and r.name='Reviewer' and p.key in ('connector.read','tool.read','tool.execution.read','tool.approve','tool.revoke','tool.decision.read');
insert into public.role_permissions select r.id, p.key from public.roles r, public.permissions p where r.org_id is null and r.name='Operator' and p.key in ('connector.read','tool.read','tool.execution.read','connector.pause');
insert into public.role_permissions select r.id, p.key from public.roles r, public.permissions p where r.org_id is null and r.name='Viewer' and p.key in ('connector.read','tool.read','tool.execution.read');

create or replace function public.has_permission(_perm text, _ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  with w as (select org_id from public.workspaces where id = _ws),
  base as (
    select case m.role when 'owner' then 'Owner' when 'admin' then 'Admin' else 'Builder' end as rname
    from public.org_members m, w where m.org_id = w.org_id and m.user_id = auth.uid()
  )
  select auth.uid() is not null and (
    exists (select 1 from base b join public.roles r on r.org_id is null and r.name = b.rname
            join public.role_permissions rp on rp.role_id = r.id and rp.permission_key = _perm)
    or exists (select 1 from public.role_assignments a join public.role_permissions rp on rp.role_id = a.role_id and rp.permission_key = _perm, w
               where a.user_id = auth.uid() and (a.expires_at is null or a.expires_at > now())
                 and ((a.scope_type='workspace' and a.scope_id=_ws) or (a.scope_type='org' and a.scope_id=w.org_id))
                 and exists (select 1 from public.org_members m where m.org_id = w.org_id and m.user_id = auth.uid()))
  )
$$;
revoke execute on function public.has_permission(text, uuid) from public, anon;
grant execute on function public.has_permission(text, uuid) to authenticated, service_role;

-- Connectors and credentials
create table public.tool_connectors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  type text not null check (type in ('http','mcp','webhook','openapi','native')),
  display_name text not null check (char_length(display_name) between 1 and 80),
  canonical_origin text not null check (canonical_origin ~ '^https://[^/?#@]+$'),
  endpoint_path text not null default '/',
  configuration jsonb not null default '{}'::jsonb,
  provider_label text,
  admin_enabled boolean not null default true,
  health text not null default 'not_checked' check (health in ('not_checked','checking','healthy','degraded','auth_invalid','auth_forbidden','schema_drift','unreachable','revoked')),
  protocol_version text,
  environment_class text not null default 'live' check (environment_class in ('live','sandbox')),
  sandbox_of uuid references public.tool_connectors(id) on delete set null,
  last_checked_at timestamptz, last_success_at timestamptz, next_check_at timestamptz,
  consecutive_failures int not null default 0,
  error_code text, discovery_etag text,
  archived_at timestamptz,
  revision int not null default 1,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id, display_name)
);
create table public.tool_credentials (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connector_id uuid not null references public.tool_connectors(id) on delete cascade,
  origin text not null,
  auth_kind text not null check (auth_kind in ('bearer','basic','header','query')),
  header_name text,
  ciphertext text not null,
  secret_version int not null default 1,
  hint text not null default '',
  status text not null default 'active' check (status in ('active','replaced','revoked')),
  created_by uuid, created_at timestamptz not null default now(), rotated_at timestamptz, revoked_at timestamptz
);
create unique index tool_credentials_one_active on public.tool_credentials(connector_id) where status = 'active';
create table public.tool_credential_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  credential_id uuid not null references public.tool_credentials(id) on delete cascade,
  event text not null check (event in ('created','rotated','revoked','used_failed')),
  actor uuid, at timestamptz not null default now()
);

-- Tools
create table public.tool_definitions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connector_id uuid not null references public.tool_connectors(id) on delete cascade,
  source_operation_id text not null,
  stable_slug text not null check (stable_slug ~ '^[a-z][a-z0-9_]{1,63}$'),
  state text not null default 'active' check (state in ('active','archived','unsupported')),
  unsupported_reason text,
  current_revision_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz,
  unique (connector_id, source_operation_id), unique (workspace_id, stable_slug)
);
create table public.tool_revisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  tool_id uuid not null references public.tool_definitions(id) on delete cascade,
  revision_no int not null,
  display_name text not null,
  description text not null default '' check (char_length(description) <= 2000),
  input_schema jsonb not null,
  output_schema jsonb,
  adapter_mapping jsonb not null default '{}'::jsonb,
  remote_annotations jsonb not null default '{}'::jsonb,
  review_hash text not null, invocation_hash text not null, normalizer_version int not null default 1,
  discovered_at timestamptz not null default now(),
  unique (tool_id, revision_no)
);
alter table public.tool_definitions add constraint tool_definitions_current_rev_fk foreign key (current_revision_id) references public.tool_revisions(id) on delete set null;
create table public.tool_approvals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  tool_revision_id uuid not null references public.tool_revisions(id) on delete cascade,
  risk_class text not null check (risk_class in ('read','write','sensitive','destructive','restricted')),
  allowed_contexts text[] not null default array['voice_session','text_test','workflow','console_test'],
  confirmation_minimum text not null default 'none' check (confirmation_minimum in ('none','voice','voice_readback','blocked')),
  idempotency_mode text not null default 'none' check (idempotency_mode in ('none','destination_supported','platform_dedup_only')),
  safe_to_retry boolean not null default false,
  drift_read_policy text not null default 'warn' check (drift_read_policy in ('warn','block')),
  status text not null default 'pending' check (status in ('pending','approved','rejected','revoked')),
  approval_source text not null default 'human' check (approval_source in ('human','legacy_migration')),
  approved_by uuid, approved_at timestamptz, review_required_by timestamptz,
  policy_revision int not null default 1,
  created_at timestamptz not null default now(),
  check (approval_source = 'legacy_migration' or status <> 'approved' or approved_by is not null),
  check (not safe_to_retry or risk_class = 'read' or idempotency_mode = 'destination_supported')
);
create table public.tool_policies (
  tool_id uuid primary key references public.tool_definitions(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  timeout_ms int not null default 8000 check (timeout_ms between 500 and 15000),
  rate_limit_per_min int not null default 60 check (rate_limit_per_min between 1 and 6000),
  sensitive_output text not null default 'mask_common' check (sensitive_output in ('none','mask_common','drop')),
  max_output_bytes int not null default 16384 check (max_output_bytes between 256 and 16384),
  revision int not null default 1, updated_by uuid, updated_at timestamptz not null default now()
);
create table public.tool_mocks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  tool_revision_id uuid not null references public.tool_revisions(id) on delete cascade,
  name text not null default 'default', reply jsonb not null,
  created_at timestamptz not null default now(), unique (tool_revision_id, name)
);
create table public.connector_discovery_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connector_id uuid not null references public.tool_connectors(id) on delete cascade,
  protocol_version text, catalog_hash text, status text not null check (status in ('running','succeeded','failed')),
  tool_count int not null default 0, drift jsonb not null default '{}'::jsonb, error_code text, actor uuid,
  started_at timestamptz not null default now(), finished_at timestamptz
);

-- Bindings
create table public.agent_tool_bindings (
  agent_id uuid not null references public.agents(id) on delete cascade,
  tool_id uuid not null references public.tool_definitions(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  tool_revision_id uuid not null references public.tool_revisions(id),
  enabled boolean not null default true,
  requirement text not null default 'required' check (requirement in ('required','optional')),
  confirmation_mode text not null default 'policy_minimum' check (confirmation_mode in ('policy_minimum','always')),
  timeout_ms int check (timeout_ms between 500 and 15000),
  output_budget_bytes int not null default 2048 check (output_budget_bytes between 256 and 16384),
  input_mapping jsonb not null default '{}'::jsonb,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (agent_id, tool_id)
);
create table public.workflow_versions (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  version int not null, graph jsonb not null, published_by uuid, created_at timestamptz not null default now(),
  unique (workflow_id, version)
);
create table public.workflow_tool_bindings (
  workflow_version_id uuid not null references public.workflow_versions(id) on delete cascade,
  step_id text not null,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  tool_revision_id uuid not null references public.tool_revisions(id),
  execution_policy jsonb not null default '{"after_call_allowed": false}'::jsonb,
  primary key (workflow_version_id, step_id)
);
create table public.domain_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  type text not null, schema_version int not null default 1,
  payload jsonb not null default '{}'::jsonb check (pg_column_size(payload) <= 4096),
  created_at timestamptz not null default now(), processed_at timestamptz
);
create index domain_events_pending on public.domain_events(created_at) where processed_at is null;

-- Records
create table public.tool_invocations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  context_kind text not null check (context_kind in ('voice_session','text_test','workflow','console_test')),
  context_key text not null,
  invocation_key text not null,
  mode text not null default 'live' check (mode in ('mock','sandbox','live')),
  agent_id uuid, agent_version int, deployment_id uuid, conversation_id uuid, session_id text, turn_id text,
  workflow_id uuid, workflow_version_id uuid, workflow_run_id uuid, workflow_step_id text,
  tool_id uuid references public.tool_definitions(id) on delete set null,
  tool_revision_id uuid references public.tool_revisions(id) on delete set null,
  connector_id uuid references public.tool_connectors(id) on delete set null,
  acting_partner_org_id uuid, actor_user_id uuid, trace_id text,
  input_hash text, idempotency_key text,
  status text not null check (status in ('pending_confirmation','running','succeeded','failed','outcome_unknown','cancelled','expired','blocked')),
  error_code text, input_redacted jsonb, output_redacted jsonb,
  started_at timestamptz not null default now(), ended_at timestamptz, latency_ms int,
  unique (context_key, invocation_key)
);
create index tool_invocations_ws_time on public.tool_invocations(workspace_id, started_at desc);
create table public.tool_attempts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  invocation_id uuid not null references public.tool_invocations(id) on delete cascade,
  attempt_no int not null, destination_host text, status_code int, error_class text, retry_decision text,
  started_at timestamptz not null default now(), ended_at timestamptz, unique (invocation_id, attempt_no)
);
create table public.tool_pending_actions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  invocation_id uuid not null references public.tool_invocations(id) on delete cascade,
  session_id text, turn_id text,
  execution_scope jsonb not null default '{"kind":"live"}'::jsonb,
  tool_revision_id uuid not null references public.tool_revisions(id),
  frozen_arguments text not null, args_digest text not null, policy_revision int not null,
  summary text not null,
  status text not null default 'pending' check (status in ('pending','confirmed','executing','executed','denied','expired','invalidated')),
  expires_at timestamptz not null, evidence jsonb, executed_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.tool_policy_decisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  invocation_id uuid not null references public.tool_invocations(id) on delete cascade,
  stage text not null check (stage in ('request','confirmation','pre_execute','retry')),
  policy_revision int not null, decision text not null check (decision in ('allow','deny','confirm')),
  reason_codes text[] not null default '{}', risk_class text, required_confirmation text,
  pending_action_id uuid references public.tool_pending_actions(id) on delete set null,
  evaluated_at timestamptz not null default now()
);
create table public.partner_delegations (
  id uuid primary key default gen_random_uuid(),
  partner_org_id uuid not null references public.organizations(id) on delete cascade,
  client_org_id uuid not null references public.organizations(id) on delete cascade,
  allowed_actions text[] not null default '{}', resource_scope jsonb not null default '{}'::jsonb,
  granted_by uuid not null, expires_at timestamptz, revoked_at timestamptz, created_at timestamptz not null default now(),
  check (partner_org_id <> client_org_id)
);
create table public.runtime_nonces (nonce text primary key, expires_at timestamptz not null);

-- Grants: browser reads only; server writes
grant select on public.tool_connectors, public.tool_credential_events, public.tool_definitions, public.tool_revisions, public.tool_approvals,
  public.tool_policies, public.tool_mocks, public.connector_discovery_runs, public.agent_tool_bindings, public.workflow_versions,
  public.workflow_tool_bindings, public.tool_invocations, public.tool_attempts, public.tool_policy_decisions, public.partner_delegations to authenticated;
grant all on public.tool_connectors, public.tool_credentials, public.tool_credential_events, public.tool_definitions, public.tool_revisions, public.tool_approvals,
  public.tool_policies, public.tool_mocks, public.connector_discovery_runs, public.agent_tool_bindings, public.workflow_versions,
  public.workflow_tool_bindings, public.domain_events, public.tool_invocations, public.tool_attempts, public.tool_pending_actions,
  public.tool_policy_decisions, public.partner_delegations, public.runtime_nonces to service_role;

alter table public.tool_connectors enable row level security;
alter table public.tool_credentials enable row level security;
alter table public.tool_credential_events enable row level security;
alter table public.tool_definitions enable row level security;
alter table public.tool_revisions enable row level security;
alter table public.tool_approvals enable row level security;
alter table public.tool_policies enable row level security;
alter table public.tool_mocks enable row level security;
alter table public.connector_discovery_runs enable row level security;
alter table public.agent_tool_bindings enable row level security;
alter table public.workflow_versions enable row level security;
alter table public.workflow_tool_bindings enable row level security;
alter table public.domain_events enable row level security;
alter table public.tool_invocations enable row level security;
alter table public.tool_attempts enable row level security;
alter table public.tool_pending_actions enable row level security;
alter table public.tool_policy_decisions enable row level security;
alter table public.partner_delegations enable row level security;
alter table public.runtime_nonces enable row level security;

create policy "read" on public.tool_connectors for select to authenticated using (public.has_permission('connector.read', workspace_id));
create policy "read" on public.tool_credential_events for select to authenticated using (public.has_permission('credential.manage', workspace_id));
create policy "read" on public.tool_definitions for select to authenticated using (public.has_permission('tool.read', workspace_id));
create policy "read" on public.tool_revisions for select to authenticated using (public.has_permission('tool.read', workspace_id));
create policy "read" on public.tool_approvals for select to authenticated using (public.has_permission('tool.read', workspace_id));
create policy "read" on public.tool_policies for select to authenticated using (public.has_permission('tool.read', workspace_id));
create policy "read" on public.tool_mocks for select to authenticated using (public.has_permission('tool.read', workspace_id));
create policy "read" on public.connector_discovery_runs for select to authenticated using (public.has_permission('connector.read', workspace_id));
create policy "read" on public.agent_tool_bindings for select to authenticated using (public.has_permission('tool.read', workspace_id));
create policy "read" on public.workflow_versions for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "read" on public.workflow_tool_bindings for select to authenticated using (public.has_permission('tool.read', workspace_id));
create policy "read" on public.tool_invocations for select to authenticated using (public.has_permission('tool.execution.read', workspace_id));
create policy "read" on public.tool_attempts for select to authenticated using (public.has_permission('tool.execution.read', workspace_id));
create policy "read" on public.tool_policy_decisions for select to authenticated using (public.has_permission('tool.decision.read', workspace_id));
create policy "read" on public.partner_delegations for select to authenticated using (public.is_org_member(partner_org_id) or public.is_org_member(client_org_id));

-- Safe credential view (no ciphertext)
create view public.tool_credentials_public with (security_invoker = false) as
  select c.id, c.workspace_id, c.connector_id, c.auth_kind, c.header_name, c.hint, c.status, c.secret_version, c.created_at, c.rotated_at
  from public.tool_credentials c where public.has_permission('connector.read', c.workspace_id);
grant select on public.tool_credentials_public to authenticated;

-- updated_at
create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = public as $$ begin new.updated_at = now(); return new; end $$;
create trigger touch before update on public.tool_connectors for each row execute function public.touch_updated_at();
create trigger touch before update on public.tool_definitions for each row execute function public.touch_updated_at();
create trigger touch before update on public.tool_policies for each row execute function public.touch_updated_at();
create trigger touch before update on public.agent_tool_bindings for each row execute function public.touch_updated_at();

-- Revisions are immutable
create or replace function public.forbid_update() returns trigger language plpgsql set search_path = public as $$ begin raise exception 'Tool revisions are immutable'; end $$;
create trigger immutable before update on public.tool_revisions for each row execute function public.forbid_update();

-- Audit
create trigger audit_tool_connectors after insert or update or delete on public.tool_connectors for each row execute function public.log_tenant_change();
create trigger audit_tool_definitions after insert or update or delete on public.tool_definitions for each row execute function public.log_tenant_change();
create trigger audit_tool_approvals after insert or update or delete on public.tool_approvals for each row execute function public.log_tenant_change();
create trigger audit_tool_policies after insert or update or delete on public.tool_policies for each row execute function public.log_tenant_change();
create trigger audit_agent_tool_bindings after insert or update or delete on public.agent_tool_bindings for each row execute function public.log_tenant_change();
create trigger audit_workflow_versions after insert or update or delete on public.workflow_versions for each row execute function public.log_tenant_change();

-- Legacy migration
do $$
declare t record; c uuid; d uuid; r uuid; o uuid; origin text; path text; schema jsonb; risk text;
begin
  for t in select * from public.tools loop
    select org_id into o from public.workspaces where id = t.workspace_id;
    origin := substring(t.endpoint_url from '^(https://[^/?#]+)');
    path := coalesce(nullif(substring(t.endpoint_url from '^https://[^/?#]+(.*)$'), ''), '/');
    risk := case when t.method = 'GET' then 'read' else 'write' end;
    insert into public.tool_connectors(org_id, workspace_id, type, display_name, canonical_origin, endpoint_path, configuration, health)
      values (o, t.workspace_id, 'http', t.name, origin, path, jsonb_build_object('legacy_tool_id', t.id), 'not_checked')
      on conflict (workspace_id, display_name) do update set display_name = excluded.display_name returning id into c;
    if t.auth_ciphertext is not null then
      insert into public.tool_credentials(org_id, workspace_id, connector_id, origin, auth_kind, header_name, ciphertext, hint)
        values (o, t.workspace_id, c, origin, 'header', 'Authorization', t.auth_ciphertext, coalesce(t.auth_hint, ''));
    end if;
    insert into public.tool_definitions(workspace_id, connector_id, source_operation_id, stable_slug)
      values (t.workspace_id, c, t.method || ' ' || path, t.name) returning id into d;
    schema := coalesce(t.parameters, '{"type":"object","properties":{}}'::jsonb);
    insert into public.tool_revisions(workspace_id, tool_id, revision_no, display_name, description, input_schema, adapter_mapping, review_hash, invocation_hash)
      values (t.workspace_id, d, 1, t.name, left(t.description, 2000), schema,
              jsonb_build_object('method', t.method, 'path', path, 'params', 'body_or_query'),
              encode(sha256(convert_to(t.name || t.description || schema::text, 'UTF8')), 'hex'),
              encode(sha256(convert_to(t.method || path || schema::text, 'UTF8')), 'hex'))
      returning id into r;
    update public.tool_definitions set current_revision_id = r where id = d;
    insert into public.tool_approvals(workspace_id, tool_revision_id, risk_class, confirmation_minimum, status, approval_source, approved_at, review_required_by)
      values (t.workspace_id, r, risk, case when risk = 'read' then 'none' else 'voice' end, 'approved', 'legacy_migration', now(), now() + interval '30 days');
    insert into public.tool_policies(tool_id, workspace_id, timeout_ms) values (d, t.workspace_id, least(t.timeout_ms, 15000));
    insert into public.agent_tool_bindings(agent_id, tool_id, workspace_id, tool_revision_id)
      select at.agent_id, d, at.workspace_id, r from public.agent_tools at where at.tool_id = t.id;
  end loop;
end $$;
