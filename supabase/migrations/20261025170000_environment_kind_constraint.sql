-- Environment kinds drive production release gates; reject unknown values at the database boundary.
update public.environments
set kind = 'development'
where kind not in ('development', 'staging', 'production');

alter table public.environments
  add constraint environments_kind_check
  check (kind in ('development', 'staging', 'production'));