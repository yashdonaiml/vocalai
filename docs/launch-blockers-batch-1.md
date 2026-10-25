# Launch blockers: first implementation batch

Implemented locally on October 25, 2026. Production migrations and deployments have not been applied.

## Security

Customer-controlled destinations use a shared HTTPS transport that validates all resolved addresses, pins the connection to a public address, blocks redirects, and limits response size and duration. Knowledge ingestion, webhooks, workflow HTTP actions and connector checks use that transport. Legacy tool creation, editing and execution paths fail closed so they cannot bypass governance. See [egress details](launch-security-egress-2026-10-25.md).

## Privacy

Database triggers apply enabled email and phone/card-pattern masking before persisted conversation and artifact writes. Restrictive policies enforce administrator-only access and retention, with equivalent service-role API and callback inbox checks. Cleanup deletes expired transcripts, tags and encrypted callback details and clears linked tool/workflow payloads while retaining accounting records. Recording controls are disabled because worker recording is unavailable. Masking does not detect all personal information. See [operations and limitations](privacy-operations.md).

## Evaluations and releases

Evaluation runs freeze the published agent configuration and suite cases/revision. Only server-controlled completion can record typed per-case evidence and calculate aggregates. Production promotion requires a passing run for each current gating suite on the exact agent version/checksum and suite revision. Canary deployments retain their exemption.

The executable console runner is a one-turn text regression using the configured composable LLM, without external tools or knowledge retrieval. It does not validate voice quality or complete tool workflows. Native realtime configurations fail closed in that runner and require runtime evidence. The signed runtime result path accepts per-case evidence for a frozen runtime run; an automated voice evaluation dispatcher/runner remains future work.

Promotion validates tenant/version/bundle references, serializes release-policy changes, and supersedes/inserts the deployment and updates the live version in one database transaction. A unique index permits only one active full deployment per agent/environment. Published versions and runtime bundles reject updates. Live knowledge retrieval uses the session's pinned bundle and validates knowledge ownership rather than reading mutable draft associations.

## Release procedure and validation

Follow [migration order](../supabase/setup/README.md). The baseline SQL initializer does not contain the new incremental migrations. The privacy migration irreversibly masks/purges affected content, so review current policies and take a recoverable backup first. Apply the migrations and deploy the updated console as a coordinated release, then configure authenticated hourly retention cleanup. Verify staging with a real configured provider and a signed runtime session before production rollout.

Local checks passed: full Node regression suite (94 tests), main TypeScript check, console production build, and separate runtime build. Database tests execute the new migrations in PostgreSQL through PGlite with fixtures, including RLS, malformed evidence, stale suites, failed promotion rollback and expiry. They do not establish production infrastructure readiness, real multi-connection concurrency behavior, provider quality, or migration compatibility with untracked remote schema changes.
