# Competitor audit: authenticated evidence

Date: 24 October 2026. This records root-agent UI inspection, separate from public documentation. Visible configuration and marketing claims do not establish execution or backend enforcement. No purchases, phone calls, integration connections, webhook deliveries, or production publishing were deliberately initiated during this inspection.

## Vapi

Google OAuth completed with the previously available account. Basic onboarding accepted the prefilled name and offered Inbound, Outbound, Support, a natural-language builder, and Skip to dashboard. The dashboard contained a Riley scheduling assistant, published version v1, and a 100% traffic indicator. The audit did not explicitly create or publish this assistant; whether it was automatically provisioned is unverified.

Observed assistant controls:

- Configurable STT, model, voice; Balanced, High Intelligence, Ultra Fast, Cost Saver presets; experimental GPT Live option.
- Estimated component costs totaling approximately $0.09/min and estimated latency approximately 1,530 ms for the displayed configuration. These are UI estimates, not measured results.
- Prompt code/visual modes, first-message configuration, file attachment selector, tools, traffic, logs, advanced settings.
- Voice and STT fallbacks; endpointing and interruption controls; silence timeout 30 seconds and maximum duration 600 seconds in the displayed configuration.
- Recording, logging, transcript switches; recording consent described as Enterprise; HIPAA and ZDR controls gated by add-ons in the displayed UI.
- Webhook endpoint, credentials, headers, 20-second timeout, optional static IP routing.
- Empty Evals area offers mock-conversation evaluation creation. No evaluation was executed.

Actual billing screen: Package None, $5 credit, $0 monthly fees, 2 organizations allowed (1 used), 1 managed phone number allowed (0 used), 4 concurrent call lines shared by subscription, 1 concurrent chat simulation per organization, 200 API requests/minute/organization, 14-day call history. These are this account's observed entitlements, not guaranteed universal allowances.

Sources: https://dashboard.vapi.ai/assistants ; https://dashboard.vapi.ai/settings/billing ; https://dashboard.vapi.ai/evals

## Outpero

Existing account remained available. Prior local audit contains one fictional draft and a text rehearsal; this pass did not repeat a paid rehearsal.

- Dashboard organizes the product around employees, instant lead calling, bulk campaigns, inbound, leads/results, conversations, training, numbers, performance, billing, developers.
- Seven primary language buttons and multiple industry templates appear in the job-description-first builder.
- Billing: 1 credit = INR 1, unused credits do not expire; Standard INR 5/min, Premium INR 6.80/min; 30-second billing blocks; ringing/busy/unanswered described as free; inbound has the same minute rate. AI drafting, suggestions, chat rehearsal described as approximately INR 0.20 per action.
- Number: INR 649/month, one concurrent channel; extra channels purchasable. Monthly renewal uses wallet credits.
- Enterprise card: 200+ concurrent calls, custom volume rates, dedicated account manager; displayed lower rates INR 3.60 standard and INR 5.50 premium. Public pricing's INR 3.50 custom starting claim differs.
- Calling rules: consent-only contacts; no purchased/scraped lists; bulk 9 AM–9 PM, instant callbacks 6 AM–10 PM; automatic opt-out insertion claimed. Enforcement was not tested.
- Account Settings couples caller memory and exact-time automatic redial under one Smart follow-ups checkbox, default off. Saved integration credentials can be reused across employees.
- Account DNC description scopes skipping to bulk campaigns with the skip-opt-out option enabled. Central enforcement across every entry path remains unverified.
- Privacy UI offers CSV export and support-assisted deletion. No configurable account retention/access controls were seen on this screen.
- Developer interface describes REST calls/campaigns and outcome webhooks, GET /me, dry_run calls, Idempotency-Key, Node/Python/cURL examples, Postman and OpenAPI.
- Account-level Webhooks page promises signed delivery with retries for up to one day. There were no endpoints, so failure/replay behavior was not exercised. Do not conflate this with legacy employee post-call webhook docs describing one attempt.

Sources: https://app.outpero.com/#billing ; https://app.outpero.com/#numbers ; https://app.outpero.com/#settings ; https://app.outpero.com/#developers/webhooks

## Retell

**Updated 25 October: authentication succeeded.** The authenticated Retell dashboard, agent/editor/workflow/simulation/draft versions, integrations, billing/budget, limits/reliability/roles/DNC/webhooks, contacts, call history, live monitoring, analytics, QA and campaign form were inspected. One blank Single-Prompt Agent Draft V0 was created as an audit fixture and remains unpublished/unassigned. No calls, simulations, purchases, external connections or operational configuration changes were submitted. The full [25 October dashboard addendum](./competitor-retell-dashboard-audit-2026-10-25.md) records source URLs, displayed defaults, account-specific entitlements and remaining untested behavior. The earlier login blocker is resolved.
