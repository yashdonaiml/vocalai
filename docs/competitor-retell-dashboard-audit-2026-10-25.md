# Retell authenticated dashboard audit

Date: 25 October 2026, America/Chicago. This addendum supersedes the login-blocked status in the 24 October reports. Google OAuth is complete and the workspace dashboard was inspected directly. This is a configuration/UI audit, not a call-quality, billing-enforcement, security or load test.

## Actions and evidence boundaries

The account initially contained no agents. Selecting Single prompt and Build from scratch created one blank draft named **Single-Prompt Agent**, ID `agent_c353b0a24ac421f33215471202`. It remains Draft V0 and was not published, attached to a number, or tested. No calls, simulations, AI-generation requests, purchases, integration connections, API keys, contacts, alerts or campaigns were submitted. Existing billing/security/limit settings were inspected without saving changes. Onboarding walkthroughs were dismissed. The draft is retained as the inspectable audit fixture.

Source entry: [Workspace](https://dashboard.retellai.com/org_0dL7pUdBAB0pVIDd/home). [Audit draft](https://dashboard.retellai.com/org_0dL7pUdBAB0pVIDd/agents/agent_c353b0a24ac421f33215471202).

## Verified dashboard findings

| Surface | Direct observation | Limit of the observation |
|---|---|---|
| Home/onboarding | Conductor chat with build/test/debug/analyze/Q&A entry points; checklist from first agent through test, transcript, number, real call, teammate, simulation and QA | No assistant request submitted |
| Agent creation | Voice and Chat choices; voice Single prompt and Conversational flow modes; blank/prompt-generated setup; templates for reception, sales/reactivation, appointments, qualification, support, back-office, collections, IVR/DTMF and translation | Flow canvas and chat editor were not created or exercised |
| Agent editor | Agent, Workflow and Simulation tabs; environment control; V0 version menu; Publish; Audio/LLM test panels | No publish/test actions executed |
| Runtime estimate | Default displayed model GPT 5.6 Terra, voice Cimo, English US; estimated $0.134/min and 820–1290ms latency; token estimate 814–3k | Configuration-specific estimates, not invoice or measured latency |
| Functions/knowledge | Default end_call function; Add functions; KB attachment/advanced settings; Use contact's memory checked | No tool or KB attached and no external action tested |
| Call controls | Voicemail detection on with hangup selected; keypad detection on; silence cutoff 10 minutes, max call duration one hour, ring duration 30 seconds; IVR hangup and phone-screening controls | Observed defaults for this draft; enforcement not tested |
| Privacy | Storage options Everything, Everything except PII, Basic Attributes Only; Everything selected with Retention: Keep forever; separate PII categories and guardrail setup; DNC handling; optional signed URLs expiring 24h | No storage mode changed; deletion/redaction/access enforcement not tested |
| Voice fallback | Automatic fallback selected but disabled in displayed configuration; manual fallback also disabled | Cannot generalize support across models or accounts |
| Webhooks | Agent-level URL, event selection and timeout; default 5 seconds with 1–30 second range; workspace webhook page also shows 5 seconds | No endpoint configured; retry behavior remains documented rather than exercised |
| Workflow | Pre-call lookup → agent → post-call memory/extraction/functions; memory save off; displayed memory update price $0.005/run; extraction defaults Call Summary, Call Successful, User Sentiment | A lifecycle workflow, separate from conversation-flow dialogue; no execution run |
| Simulation | Test Cases and Batch Testing History; import and test-case creation; case columns User Prompt, Success Criteria and Edited by | Empty suite; mocks, scoring and execution not tested |
| Versions | Versions drawer identifies Draft V0 and environment controls | No published version existed; immutability/rollback remain documentation-backed |

## Integrations verified in the available catalog

The Connected/Available interface lists eleven connection cards with Connect actions:

- HubSpot, Salesforce, Microsoft Dynamics 365, GoHighLevel and Zoho CRM.
- Zendesk support tickets/comments/notes.
- Google Drive (Docs/Sheets), Microsoft OneDrive and Notion knowledge sources.
- Calendly and Cal.com bookings/availability.

These are stronger UI evidence than a marketing logo, but no OAuth scopes, data synchronization, operation success, retries or error handling were exercised. Source: [Integrations](https://dashboard.retellai.com/org_0dL7pUdBAB0pVIDd/integrations).

## Billing, capacity and enterprise packaging

- Billing shows **$10.00 credit** and **$0.00 upcoming invoice**. Auto-recharge, Buy credits and Budget Setting are available. The budget dialog is off/unlimited and says unlimited does not trigger spending alerts/notifications. No budget was saved; a hard cutoff is not proven from this dialog alone.
- Limits show **20 concurrent calls**. Inbound reservation is **Not Set**, so inbound, outbound and web calls share capacity.
- **Concurrency Burst is on** in the inspected account. UI describes up to 3× normal limit, capped at 300 extra calls, for **$0.10/minute**; this is not evidence that a free trial can actually consume every advertised burst slot.
- Telnyx, Twilio and custom telephony each show **1 CPS**. LLM token limit is **32,768**.
- Conductor grants **30 free credits per user per day**; paid continuation is off in the inspected account.
- Reliability offers a stable server cluster running a delayed release for **+$0.02/minute**. The switch is disabled for this account; reason/eligibility was not established.
- Batch form displays **$0.005/dial**, source-number selection, CSV upload up to 50MB, immediate/scheduled sends and run windows. Default form reserves **5** slots for other calls and allocates **15** to the batch. Save draft and Send exist; neither was used. A number and recipient list were not supplied.

Sources: [Billing](https://dashboard.retellai.com/org_0dL7pUdBAB0pVIDd/billing), [Limits](https://dashboard.retellai.com/org_0dL7pUdBAB0pVIDd/settings/limits), [Reliability](https://dashboard.retellai.com/org_0dL7pUdBAB0pVIDd/settings/reliability), [Batch calls](https://dashboard.retellai.com/org_0dL7pUdBAB0pVIDd/batchCall).

## Roles and outbound governance

Roles screen lists **Admin**, **Developer**, **Member**. Admin describes billing/team/full control; Developer describes building/testing/raw data/analytics without billing or user management; Member describes read-only resources and scrubbed history. Add Role is disabled. Visibility of these definitions does not establish role-assignment entitlement or permission enforcement.

The workspace Compliance page is specifically Federal/State DNC registration, asking for FTC organization ID and Subscription Account Number. It says campaigns using those checks can launch only after FTC verification. This page is not a HIPAA/GDPR certification panel. No registration data was supplied.

Contacts expose phone, names, tags, contact ID, related/latest conversations, DNC status and external ID. No contact was created. Sources: [Workspace](https://dashboard.retellai.com/org_0dL7pUdBAB0pVIDd/settings/workspace), [DNC setup](https://dashboard.retellai.com/org_0dL7pUdBAB0pVIDd/settings/compliance), [Contacts](https://dashboard.retellai.com/org_0dL7pUdBAB0pVIDd/contacts).

## Operations and reporting

- Call History has **0 sessions**. Visible columns include cost, duration, end reason/status/outcome, sentiment, direction, endpoints and end-to-end latency. Show PII and view/filter/action controls are available; not activated against real data.
- Live Monitoring says No Ongoing Calls. Listen/takeover behavior cannot be verified without an active call.
- Analytics separates Call and Chat dashboards with date/filter/breakdown/custom-chart controls. Metrics include count, duration, latency, concurrency, success/pickup/transfer/voicemail and disconnection reasons. Observed account metrics are zero.
- AI QA exposes creation/configuration, overview/detailed-call tabs, audio/language/performance dimensions and **first 100 minutes of analysis free** messaging. The page also displays historical metric examples despite zero account sessions; these are not evidence of account performance or completed analysis.
- Alerting exposes cadence/window, threshold versus previous-cycle comparison, metric/agent filters and email/webhook notification fields. Four rule cards were visible. Their active/real-delivery status was not established; no rule saved or notification sent.
- Knowledge and phone-number inventories are empty. Their ingestion/routing execution could not be inspected from existing records.

Sources: [Call history](https://dashboard.retellai.com/org_0dL7pUdBAB0pVIDd/call-history), [Live monitoring](https://dashboard.retellai.com/org_0dL7pUdBAB0pVIDd/live-monitoring), [Analytics](https://dashboard.retellai.com/org_0dL7pUdBAB0pVIDd/analytics), [QA](https://dashboard.retellai.com/org_0dL7pUdBAB0pVIDd/quality-assurance), [Alerts](https://dashboard.retellai.com/org_0dL7pUdBAB0pVIDd/alerting).

## What changes in the comparison

Retell's integrated operating lifecycle is now supported by direct dashboard observations, not just documentation. Its distinguishing product design is the separation of live agent configuration, lifecycle automation and regression simulation, tied to contacts, traces, QA, capacity and funding.

Our launch priorities remain enforced privacy, executable/trusted evals, durable events/workflows/webhooks, atomic releases and real metering/limits. Additional product lessons: separate memory read/save permission; reserve inbound capacity from campaigns; show add-on prices at the control; avoid indefinite retention by accident; distinguish illustrative dashboards from customer results.

Remaining runtime validation: voice quality/latency; function correctness and confirmation; safe simulation isolation; published-version and tool/knowledge pinning; real traffic splitting; redaction/deletion; budget/concurrency/duration enforcement; webhook retry/replay; live takeover; provider/carrier failure recovery. No private backend implementation can be inferred from these screens.
