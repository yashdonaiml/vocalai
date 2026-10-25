
drop view public.tool_credentials_public;
grant select (id, workspace_id, connector_id, auth_kind, header_name, hint, status, secret_version, created_at, rotated_at) on public.tool_credentials to authenticated;
create policy "read meta" on public.tool_credentials for select to authenticated using (public.has_permission('connector.read', workspace_id));
create view public.tool_credentials_public with (security_invoker = true) as
  select id, workspace_id, connector_id, auth_kind, header_name, hint, status, secret_version, created_at, rotated_at from public.tool_credentials;
grant select on public.tool_credentials_public to authenticated;
