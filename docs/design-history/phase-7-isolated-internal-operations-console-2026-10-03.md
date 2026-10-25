# Phase 7: Isolated internal operations console

## Goal
A separate, staff-only area at `/internal` for aviroh's own team. It runs outside the customer console, has no inherited customer access, and never shows customer secrets.

## Who can enter
- Only accounts holding the platform `admin` or `operator` role (existing staff roles table). Workspace or org ownership grants nothing here.
- Everyone else gets a plain "Not authorized" page; no data is loaded.
- The first staff admin is granted manually by you (one-time step, I will give the exact instruction).

## Sections
1. **Platform health**: runtime shared secret, media layer (LiveKit), and platform provider keys shown as configured / missing (booleans only), plus counts of failed knowledge ingests, failed sessions and active sessions in the last 24h.
2. **Incidents**: staff can open, update and resolve incidents (title, severity, status, notes). Shown newest first.
3. **Organization lookup**: search orgs by name; redacted summary per org (created date, member count, workspace count, agent count, conversation count last 30 days, BYOK providers by name only). No transcripts, no keys, no member emails.
4. **Support access requests**: staff request time-limited access to an org with a written reason and duration (max 24h). An admin approves or denies; approved grants expire automatically. This release records and displays the grant only; it does not yet let staff open customer data.
5. **Internal audit**: every staff action (lookup, incident change, access request, approval) is written to an append-only internal audit log and listed here.

## Layout
Own shell (not the customer sidebar): compact top bar with "aviroh internal" badge, a warning tone, and tabs for the five sections. Same palette and card primitives, denser and quieter.

## Technical details
- Routes: `src/routes/_internal/route.tsx` (session + role gate via `has_role`, renders own shell) with children `internal.index` (health), `internal.incidents`, `internal.orgs`, `internal.access`, `internal.audit`.
- New tables (with GRANTs to authenticated/service_role, RLS restricted to `has_role(auth.uid(),'admin') or has_role(auth.uid(),'operator')`): `platform_incidents`, `support_access_requests` (org_id, requested_by, reason, duration, status, approved_by, expires_at), `internal_audit_events` (insert/select only, no update/delete).
- Org lookup and health counts run in `src/lib/internal.functions.ts` server functions: verify staff role through the user client first, then use the admin client only for redacted aggregate counts. Each call writes an internal audit row.
- Approvals require `admin` (not operator) and cannot be self-approved; enforced server-side.
- Record the boundary rule in AGENTS.md; mark the roadmap item done; add head() metadata with noindex.
- Verify: build clean, signed-out and non-staff users see no data, public routes unaffected.

## Not included
Impersonation or viewing customer data, finance/billing tools, fleet controls, staff invitation UI.
