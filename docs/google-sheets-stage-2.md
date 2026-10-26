# Google Sheets: customer-journey Stage 2

Implemented locally on October 26, 2026 as the next work package in `customer-experience-unified-plan.md`.

The guided assistant setup now supports one destination choice: the existing callback inbox or a native Google Sheets connection. A workspace admin connects Google, chooses an editable spreadsheet and visible worksheet by name, reviews the proposed enquiry-field mapping, explicitly approves two labeled safety columns when they are missing, and saves the destination without entering spreadsheet IDs, ranges, endpoints, schemas or tokens.

Google OAuth state is one-time, hashed, expiring, actor/workspace-bound and PKCE-protected. Refresh and access tokens are AES-GCM encrypted in service-only RLS tables. Browser code receives only a safe connection summary and authorization URL. Refresh revocation and API 401 responses mark only the exact connection that supplied the token, so a late failure cannot invalidate a replacement grant.

The Sheets adapter is a typed native Tool Gateway operation. Setup previews require the persisted `setup_preview` authority and caller readback confirmation. Preview rows are labeled `Test enquiry`; live rows use `Live enquiry`. Each invocation ID is written as a stable marker. A confirmed existing marker returns the original row receipt without another append. A sent request with an uncertain outcome is never blindly repeated; reconciliation performs a marker lookup and otherwise tells the owner to inspect the selected worksheet.

The immutable tool revision contains the reviewed spreadsheet, worksheet and field mapping. Changing the setup destination increments the setup revision, clears the prepared tool reference and invalidates older preview authority. The database foreign key binds a Google connection and setup to the same workspace.

## Deployment boundary

Apply migrations `20261026020000_google_sheets_oauth.sql` and `20261026030000_enquiry_google_destination.sql` after the enquiry-preview migration. Register the exact callback in `GOOGLE_OAUTH_REDIRECT_URI` and configure the OAuth client only on the console server. The staging preflight verifies the callback origin.

Google's Drive metadata scope used for server-side spreadsheet discovery requires the applicable Google verification/security review before unrestricted public launch. Until that is complete, operate this as an explicitly allowlisted pilot. No real OAuth grant, spreadsheet write, remote migration or deployment was performed by this local implementation.

## Local evidence

Focused tests cover state/PKCE/token secrecy, refresh and stale-401 races, service-only RLS, editable resource discovery, reviewed safety-column creation, test/live marking, exact receipts, duplicate suppression, uncertain-write reconciliation, column drift, revoked authorization and the actual confirmed setup-preview gateway dispatch. Production console/runtime builds and the complete regression suite remain required after integration changes.
