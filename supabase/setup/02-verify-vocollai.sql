-- Read-only checks. Run AFTER 01-initialize-vocollai.sql has succeeded.
-- Every result in both tables below should say true.
SELECT name AS required_table,
       to_regclass('public.' || name) IS NOT NULL AS present,
       coalesce((SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.' || name)), false) AS rls_enabled
FROM unnest(ARRAY[
  'organizations', 'org_members', 'workspaces', 'environments',
  'agents', 'agent_versions', 'deployments', 'runtime_bundles',
  'phone_numbers', 'conversations', 'conversation_turns',
  'tool_definitions', 'tool_revisions', 'tool_pending_actions',
  'runtime_event_batches', 'managed_number_quotes', 'managed_number_orders',
  'phone_verifications', 'managed_number_charges', 'managed_call_charges'
]) AS name;

SELECT 'managed phone columns' AS check_name,
       count(*) = 2 AS passed
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'phone_numbers'
  AND column_name IN ('management_mode', 'verified_at')
UNION ALL
SELECT 'reserve managed number function',
       to_regprocedure('public.reserve_managed_number(uuid,uuid,uuid,uuid,uuid,integer)') IS NOT NULL
UNION ALL
SELECT 'confirm phone verification function',
       to_regprocedure('public.confirm_phone_verification(uuid,uuid,uuid,uuid)') IS NOT NULL
UNION ALL
SELECT 'managed assignment function',
       to_regprocedure('public.assign_managed_phone_route(uuid,uuid,uuid,uuid)') IS NOT NULL
UNION ALL
SELECT 'authenticated users cannot purchase directly in database',
       NOT coalesce(has_function_privilege('authenticated',
         to_regprocedure('public.reserve_managed_number(uuid,uuid,uuid,uuid,uuid,integer)'), 'EXECUTE'), true)
UNION ALL
SELECT 'authenticated users cannot write phone routes',
       NOT coalesce(has_table_privilege('authenticated', to_regclass('public.phone_numbers'), 'INSERT'), true)
UNION ALL
SELECT 'service role can purchase through server function',
       coalesce(has_function_privilege('service_role',
         to_regprocedure('public.reserve_managed_number(uuid,uuid,uuid,uuid,uuid,integer)'), 'EXECUTE'), false);
