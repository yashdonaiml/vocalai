# Enquiry preview: first implementation batch

Implemented locally on October 25, 2026. Entry: `/assistant-setup/new`, also linked from Overview. An existing editable draft can be prepared explicitly; published/connected drafts are rejected rather than overwritten.

The supported journey is business brief → saved English enquiry pack → explicitly authorized browser voice preview → caller readback/confirmation → exact persisted inbox receipt. Preferred time and email are not required. The UI states that no external application, notification, guaranteed callback, phone purchase or live deployment is included.

## Boundaries and recovery

- The new pack uses an English composable voice configuration. Existing agents' native and Telugu-English settings are preserved.
- Setup and draft saves use service-only PostgreSQL functions, admin checks, idempotent creation and optimistic revisions. A server-owned preview relation pins actor, draft hash, tool revision, bundle and expiry.
- A `setup_preview` tool grant is not a live-call grant. The gateway derives purpose from persisted state, rechecks current owner access and draft identity, and retains caller confirmation. Published bundle compilation rejects test-only grants.
- Receipts require the exact scoped session, current setup revision, successful saved action and executed confirmation. Captions/disconnect are not proof. Retention and admin access apply to reads. Preview events do not trigger live workflows or successful-live-action notifications.
- A lost join response can resume the same session using its request key. No join token is persisted. Setup progress and request IDs can survive re-entry. Failed preparation, microphone denial, unavailable providers and expired previews have explicit recovery states.
- Duration and silence limits now travel in new bundles and have worker-owned cleanup. Old pinned bundles without limits retain their existing behavior. Unimplemented transfer/voicemail/after-hours/recording/end-phrase controls are disabled rather than represented as working features.

## Deployment and validation

Apply `supabase/migrations/20261026010000_enquiry_preview.sql` after the existing incremental migrations. Deploy the matching console and runtime worker; a console build alone does not establish that an older deployed worker enforces the new controls. No remote schema or deployment was changed during implementation.

Local validation: 110 tests pass, including ten new preview tests and the workflow-graph suite now included in the standard manifest. The new SQL migration executes against PostgreSQL via PGlite fixtures. Tests cover stale/revoked/foreign authorization, confirmed single save, optional preferred time, test-only grants rejected for ordinary calls, exact receipts, live-workflow isolation and lost-join recovery. Main TypeScript, production console build and separate runtime build pass.

Real microphone/audio, provider responses, a deployed worker and remote migration compatibility still require staging validation. No real paid calls, OAuth grants, numbers or external records were created. This batch is an inbox-only preview implementation, not a production-readiness or external-integration claim.

Browser smoke check: the local setup route redirected an unauthenticated browser to sign-in while preserving `/assistant-setup/new` as its return path. Protected setup screens and real audio were not exercised with an authenticated staging account. Apply the new migration before using this feature against a remote database.

Two implementation agents exchanged their initial contracts and contributed runtime/UI files. Both subsequently reached account usage limits; the coordinator completed the backend, integration, recovery review and final checks. A recoverable source snapshot was retained under the user's `.codex/backups/vocal-ai` directory before the combined changes.
