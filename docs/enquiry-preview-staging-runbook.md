# Enquiry preview staging migration runbook

This runbook is for a non-production Supabase project. Do not infer the target from `.env.local`, and do not apply only the enquiry-preview migration to an older schema.

## 1. Prove the target

Record the staging project reference, Supabase URL, database host, and operator. The project reference must equal the first label in the URL (`https://<project-ref>.supabase.co`) and the database host. Confirm in the Supabase dashboard that the project is explicitly disposable staging, not production. Stop on any mismatch.

The repository currently contains inconsistent local identifiers: `supabase/config.toml` and the project-ID variables name one project, while the configured Supabase URL names another. Neither is safe evidence that a remote project is staging.

## 2. Back up and inspect

Take a recoverable database backup using the confirmed staging project's database connection or dashboard backup facility. Record the backup identifier and verify it can be restored to a separate project or database before continuing.

Inspect the current schema and migration history. The active URL observed on October 25, 2026 was missing every incremental follow-up marker, including `conversations.privacy_purged_at`, `eval_suites.revision`, and the enquiry setup tables. Its only application environment was named `local test` with kind `development`; that does not establish that the Supabase project is staging.

Review retention policies and affected row counts before the privacy migration. `20261025110000_privacy_enforcement.sql` can irreversibly mask or purge expired content when it is committed. A transaction rollback cannot recover committed content; the verified backup is the recovery point.

## 3. Apply the complete incremental chain

Apply each file exactly once and stop on the first error:

1. `supabase/migrations/20261025110000_privacy_enforcement.sql`
2. `supabase/migrations/20261025120000_evals_atomic_deployments.sql`
3. `supabase/migrations/20261025170000_environment_kind_constraint.sql`
4. `supabase/migrations/20261025180000_managed_inbound_privacy_and_test_challenge.sql`
5. `supabase/migrations/20261025190000_successful_action_webhook_events.sql`
6. `supabase/migrations/20261026010000_enquiry_preview.sql`
7. `supabase/migrations/20261026020000_google_sheets_oauth.sql`
8. `supabase/migrations/20261026030000_enquiry_google_destination.sql`

Do not use `supabase db push` until SQL-Editor-applied versions have been reconciled with the CLI migration history. Do not rerun the fresh-schema initializer against an existing project.

## 4. Verify the schema and authority boundary

Require all of these markers before deploying the matching console and runtime worker:

- `conversations.privacy_purged_at`
- `eval_suites.revision`
- `eval_runs.agent_id`, `suite_revision`, `agent_checksum`, `runner_kind`, `snapshot`, and `error`
- `phone_verifications.challenge` and `expires_at`
- `webhook_deliveries.domain_event_id`
- `domain_events.delivery_token` and `delivery_lease_at`
- tables `agent_setup_runs` and `setup_preview_sessions`
- service-only tables `google_connections` and `google_oauth_states`
- destination columns and the workspace-scoped Google connection foreign key on `agent_setup_runs`
- functions `release_actor_is_admin`, `promote_agent_deployment`, `begin_enquiry_setup`, `save_enquiry_setup`, and `claim_enquiry_preview`

Verify privileges, not only object existence:

- `anon` and `authenticated` cannot execute the three enquiry setup functions.
- `service_role` can execute them.
- An authenticated workspace admin can select setup rows only for their own workspace.
- A non-admin member and a user from another workspace cannot read those rows.
- The two setup tables have row-level security enabled.

Run `supabase/setup/02-verify-vocollai.sql` only where its assumptions match the initialized schema, then run the application regression suite. A successful schema check is not proof that real audio works.

## 5. Deploy and exercise staging

Deploy the console and runtime from the same source revision. Configure both with the confirmed staging Supabase project, the same LiveKit project, and the same `RUNTIME_SHARED_SECRET`. The worker control-plane URL must be the deployed console origin, not localhost.

Use a staging workspace admin and fictional enquiry data. Complete this sequence:

1. Create the enquiry assistant and save the brief.
2. Start one browser voice preview.
3. Decline once and verify no callback row or successful receipt is created.
4. Start a new preview, correct one field, confirm the exact readback, and verify one inbox receipt tied to the exact session and tool invocation.
5. Repeat the confirmation and reconnect once; verify no duplicate callback is created.
6. Revoke membership or edit the draft and confirm the old preview fails closed.
7. Let a preview expire and confirm it cannot execute.

Capture the session ID, bundle checksum, tool revision, invocation ID, receipt timestamp, worker revision, and pass/fail evidence. Do not proceed to Google Sheets until every check passes or has an explicit resolved defect.

## Recovery

If a migration fails before commit, retain the first error and stop; do not skip the file or manually patch around it. If a committed migration causes data damage, isolate the staging application, preserve logs, and restore the verified backup to a separate target before changing the original. If only the application deployment fails, roll back the console and worker together; do not run the new console against an old worker or the new worker against an old schema.
