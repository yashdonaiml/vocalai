alter table public.workflows add column published_version_id uuid references public.workflow_versions(id);
alter table public.conversations add column runtime_bundle_id uuid references public.runtime_bundles(id);
alter table public.workflow_runs add column workflow_version_id uuid references public.workflow_versions(id);

-- Version publication now snapshots tool bindings in an authenticated server function.
revoke insert on public.agent_versions from authenticated;

-- Pending actions created by the old gateway contain plaintext arguments. They must
-- never be resumed by the encrypted pending-action reader.
update public.tool_invocations set status = 'cancelled', ended_at = now()
where id in (select invocation_id from public.tool_pending_actions where status = 'pending');
update public.tool_pending_actions set status = 'invalidated', frozen_arguments = '' where status = 'pending';

-- Runs are reproducible from their version; published graphs cannot be edited.
create trigger workflow_version_immutable before update on public.workflow_versions
for each row execute function public.forbid_update();

-- Expired nonces are safe to remove; recent nonces remain unique across workers.
create or replace function public.prune_runtime_nonces() returns trigger
language plpgsql set search_path = public as $$
begin
  delete from public.runtime_nonces where expires_at < now();
  return null;
end $$;
create trigger prune_runtime_nonces before insert on public.runtime_nonces
for each statement execute function public.prune_runtime_nonces();
