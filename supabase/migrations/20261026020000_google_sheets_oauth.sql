-- Workspace-scoped Google Sheets authorization. OAuth tokens and one-time
-- authorization state are service-only; browsers receive safe summaries.

create table public.google_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  account_subject text not null check (char_length(account_subject) between 1 and 255),
  account_email text not null check (char_length(account_email) between 3 and 320),
  granted_scopes text[] not null default '{}',
  access_token_ciphertext text,
  refresh_token_ciphertext text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  status text not null default 'active' check (status in ('active','reconnect_needed','disconnected')),
  error_code text,
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  disconnected_at timestamptz,
  unique (workspace_id),
  unique (id, workspace_id)
);
create index google_connections_org on public.google_connections(org_id);

create table public.google_oauth_states (
  id uuid primary key default gen_random_uuid(),
  state_hash text not null unique check (state_hash ~ '^[0-9a-f]{64}$'),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  pkce_verifier_ciphertext text not null,
  return_to text not null check (return_to ~ '^/assistant-setup/[0-9a-f-]{36}$'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index google_oauth_states_expiry on public.google_oauth_states(expires_at) where consumed_at is null;

alter table public.google_connections enable row level security;
alter table public.google_oauth_states enable row level security;

-- Deliberately no authenticated policies or grants. OAuth rows include secrets
-- and are accessed only by permission-checked server functions.
revoke all on public.google_connections from public, anon, authenticated;
revoke all on public.google_oauth_states from public, anon, authenticated;
grant all on public.google_connections to service_role;
grant all on public.google_oauth_states to service_role;

create policy "google connections service" on public.google_connections for all to service_role using (true) with check (true);
create policy "google oauth states service" on public.google_oauth_states for all to service_role using (true) with check (true);

