# Outpero signed-in product audit vs VocollAI

Audit date: 23 October 2026. Scope: accessible signed-in screens, a fictional employee build and one text rehearsal, compared with VocollAI's current implementation. This supplements the earlier public-site analysis.

## What was actually exercised

- Built one fictional **Demo Research** inbound receptionist named **Chitra**, using the job-description builder. It generated a greeting, three conversation steps and callback capture fields. The employee remains **Draft / Not published**.
- Ran one text rehearsal asking for consultation pricing and explicitly requesting no arrangements or messages. The answer acknowledged that pricing was unknown. It also offered to connect the caller with the team, despite no connected action; this is a wording risk, not evidence that a transfer was attempted.
- Verified the billing ledger charged **₹0.20 from existing trial credit**, reducing the balance from ₹50 to ₹49.80. There were zero phone calls and zero call minutes.
- Inspected every main navigation area available to this account, employee configuration sections and relevant setup dialogs. Viewed a campaign wizard without saving or launching it.
- Made no purchases, top-ups, phone calls, calendar/WhatsApp connections, API keys or webhook endpoints. Imported no contacts and launched no campaign. No VocollAI application code or settings changed during this audit.

## Evidence levels

**Exercised** means an action completed and its result was observed. **Visible** means the signed-in UI exposes configuration; execution remains unverified. **Gated** means prerequisites or account restrictions prevented testing. Public API documentation describes a contract, not verified endpoint behavior.

## Outpero's actual product surface

| Area | Observed behavior | Evidence / limits |
|---|---|---|
| Employee builder | Describe a job, choose category/language, answer follow-up questions; generates script and capture fields. Industry templates include healthcare, real estate, coaching and dealerships. | Exercised with fictional software consultation business. |
| Script editor | Literal opening line, reorderable steps, FAQ section, variables, strictness slider, hang-up rules, JSON copy/paste and an English enhancement toggle. | Generated script inspected; no live voice execution tested. |
| Publishing/testing | One go-live switch, browser Talk, text Chat and phone Test call. Version history described for publishing/category changes. | Chat exercised. Employee remains unpublished. Talk/phone tests not run. |
| Training | Teach with text, photos or speech; review extracted facts/rules. Shows taught facts and issues from calls. | Visible; no files uploaded, training saved or real-call issue detection verified. |
| Languages/voices | Primary language plus constrained additional-language selection, voice search/filter/sample controls, standard and premium tiers, ambient sound controls. English-primary setup permits up to two Indian languages; Indian-primary setup includes English plus one additional Indian language. | Configuration inspected. No multilingual speech or audio quality comparison performed. |
| Inbound readiness | Inbound Desk checklist: obtain number, hire receptionist, attach working employee to active number. Our draft does not satisfy readiness. Employee inbound view shows open/resolved items and call outcomes. | Visible; no active number/call, so ticket lifecycle unverified. |
| Managed numbers | Number inventory and routing inside the product; mobile/landline inventory modal and purchase buttons. | Inventory observed. No purchase, assignment or KYC execution tested. |
| Google Calendar | Connect-with-Google flow advertised for checking availability and booking during calls. | Connection dialog inspected; no access granted or booking performed. |
| WhatsApp | Interakt, AiSensy, Meta Cloud API and other-provider options under employee actions. | Configuration visible; no provider connected or message sent. |
| Custom API actions | Name/description, GET or POST, URL, headers, query/body parameters, lead variables or AI-selected values, test tab. Global API-action enable checkbox defaults off. | Unsaved editor inspected. No request sent. |
| Post-call capture | Generated lead name, phone and callback reason fields; configurable labels/types/options. Post-call webhook with call-status conditions and recording/transcript metadata. UI says capture changes apply immediately without publishing. | Fields generated and inspected. No real-call extraction or webhook delivery verified. |
| Lead inbox | Contact-oriented list/card/pipeline views, hot/qualified/pending-callback counters, employee/channel/outcome/time filters and CSV export control. | Empty account; pipeline behavior and classification quality unverified. |
| Caller memory/follow-up | Account setting bundles caller-history memory with exact-time automatic callback redial. | Default off; not enabled or exercised. |
| Instant lead calling | Webhook-led response workflow and outcome funnel. | Gated on an Instant Lead Calling employee. No webhook generated/call initiated. |
| Bulk campaigns | CSV/paste/list contact import, calling windows, weekdays/holidays, DNC/recent-contact exclusions, retries, scheduled and recurring runs, consent attestation. | Wizard inspected without saving. Own number and bulk employee required; channel allocation controls disabled pending activation for this account. |
| Conversations | Call records, recording/transcript/summary filters, hang-up reasons, duration/cost sorting and export. | Empty account. UI states recordings retained 90 days and transcripts/summaries for account lifetime; retention not independently tested. |
| Performance | Calls, answer/conversion metrics, outcome funnel, channel/hour charts, employee leaderboard and exports. | Visible with zero data; metric accuracy unverified. |
| Billing | Wallet, number subscription, standard/premium rates, transaction ledger, usage, CSV statement and GST invoice area. | ₹0.20 rehearsal debit exercised; no paid transaction. |
| Developers | API keys, examples, request activity, account webhooks, deliveries/retry guidance and public OpenAPI/Postman links. | UI/docs inspected. No key created or authenticated API called. |
| Account settings | Saved reusable integration credentials, DNC management, lead export, disclosure/recording settings, consent records and support-mediated deletion/privacy workflow. | Read-only inspection. No settings or credentials changed. |

## Prices displayed to this account

- Standard voice calls: **₹5/minute**; premium: **₹6.80/minute**.
- Billing in **30-second blocks**, per the billing screen. Unanswered/ringing/busy calls described as free; inbound described at the same per-minute rate.
- Own number: **₹649/month**, with one concurrent call included; additional lines available.
- The text rehearsal cost **₹0.20/message**, verified in the account ledger. Other AI assistance actions are also described as metered when used.
- These are observed account prices, not proof of carrier costs, margins, tax treatment, enterprise discounts or future pricing. No inference about their underlying vendors can be made from the voice labels alone.

## Comparison with VocollAI today

| Capability | Outpero | VocollAI current state | Practical gap |
|---|---|---|---|
| Business onboarding | Job-first builder with generated script/capture fields and readiness checklist. | Agent studio, knowledge, tools, versions, environments and deployment screens. | A guided business profile → receptionist → voice → test journey, with meaningful readiness checks. |
| Useful receptionist | Generated FAQ/script and lead capture configuration. | Factual receptionist draft, multilingual runtime controls, confirmed native callback saving and callback inbox implemented. | Publish/test the new configuration; verify a complete multilingual voice callback flow and inbound carrier call. |
| Calendar booking | Dedicated Google Calendar connection surface. Execution untested. | No dedicated availability/booking integration in current receptionist. | OAuth, availability lookup, timezone handling, confirmed booking, conflict handling and durable receipts. |
| Callback follow-through | Lead pipeline, open items, memory/redial setting. Notification delivery not verified. | Confirmed callback persistence exercised through Tool Gateway; inbox visible. No staff notification delivery or automatic callback calling. | Durable notification outbox, retries, delivery status, ownership and open/resolved workflow. |
| Messaging | Dedicated WhatsApp provider configuration. | Generic governed external-tool capability; no packaged WhatsApp setup. | Productized channel setup, templates, delivery receipts and consent controls. |
| Telephony onboarding | Managed Indian number catalog and attachment workflow. Purchase/first call untested. | Managed US Telnyx/LiveKit provisioning code exists, purchases disabled; first PSTN inbound call unverified. | Complete and verify routing and call readiness while preserving the purchase gate. Different countries are a market constraint, not interchangeable inventory. |
| Leads/outcomes | Contact pipeline, captured fields, hot/qualified/callback views and conversion charts. | Conversations, tags, operational analytics and callback inbox. Analytics currently counts completed calls and points to workflow tags for custom outcomes. | A durable contact/lead model, typed outcomes, follow-up states and business conversion reporting. |
| Outbound growth | Instant lead triggers and bulk campaign scheduling/retry/import controls. | No packaged campaign/lead-calling product. | A later phase requiring consent, DNC, scheduling, rate/concurrency limits and attribution. |
| Training | Text/photo/speech teaching and call-issue surface. | Knowledge ingestion/retrieval, instructions, visual flows and text/voice tests. | A simpler teach-and-review experience and a feedback loop from failed calls. |
| Integrations/API | Public docs cover calls, campaigns, leads, DNC, numbers, events and webhook lifecycle. | Public REST API currently reads agents/versions, deployments, conversations/turns and usage; non-GET requests return 405. Separate internal/server capabilities do not equal public mutation endpoints. | Documented write API, idempotency, pagination, webhook contracts and usable examples. |
| Change control | Simple go-live and some version history. Capture fields can change immediately. | Immutable versions, checksummed deployment bundles, environments, canaries and production eval gates; Tool Gateway confirmations and audit; scoped tenant access and provider registry. | Retain these controls, but simplify the customer journey. Do not infer Outpero lacks controls merely because its UI did not expose them. |
| Commercial experience | Packaged rates, wallet, subscriptions and account ledger. | Provider usage and managed telephony building blocks exist; not equivalent to a verified customer billing lifecycle. | Cost attribution, customer plan/metering, invoices and reliable payment/credit handling before commercial scale. |

Relevant local implementation: `src/lib/receptionist.server.ts`, `src/lib/callbacks.server.ts`, `src/routes/_authenticated/callbacks.tsx`, `src/lib/managed-telephony.server.ts`, `src/lib/tools/gateway.server.ts`, `src/routes/_authenticated/analytics.tsx`, `src/routes/api/public/v1/$.ts`.

## Recommended order

1. **Finish one dependable inbound receptionist:** complete the new draft's voice tests, verify confirmation/save/replay protections in conversation, verify multilingual output, and verify an inbound Telnyx → LiveKit → agent call. Keep purchases disabled.
2. **Make callbacks reach a person:** transactional notification outbox, email delivery adapter, retries and visible delivery status; callback ownership and resolved state. Say “saved” after persistence and “notified” only after confirmed delivery.
3. **Add real calendar booking:** start with one calendar provider. Availability, timezone/readback, explicit confirmation, idempotent creation, conflict retry and receipt. Never describe a slot as booked from an LLM response alone.
4. **Package onboarding:** business facts/hours/timezone, role template, language/voice preview, readiness checklist and one obvious test action. Expose a managed-number step while preserving the disabled purchase action until explicitly enabled.
5. **Add business reporting and follow-up:** lead/contact record, captured fields, outcomes, pending callbacks, notification status and conversion reports. Then caller memory and messaging with clear permissions.
6. **Add growth workflows later:** instant lead webhooks and outbound campaigns after the inbound/booking/notification loop is reliable. Include DNC, consent, calling windows, retries, concurrency and usage controls from the start.

The main lesson is to sell a completed business job with proof of execution. Adding more model providers or copying the number of navigation tabs would not close the current product gap.

## Evidence links

- [Draft employee and configuration](https://app.outpero.com/#employee/404c94a2-2302-462a-b25c-a99f0bac5e08)
- [Inbound Desk](https://app.outpero.com/#inbound), [numbers](https://app.outpero.com/#numbers), [leads](https://app.outpero.com/#leads), [campaigns](https://app.outpero.com/#bulk), [instant leads](https://app.outpero.com/#instant)
- [Conversations](https://app.outpero.com/#conversations), [performance](https://app.outpero.com/#performance), [billing](https://app.outpero.com/#billing), [settings](https://app.outpero.com/#settings), [developers](https://app.outpero.com/#developers)
- [Public OpenAPI contract](https://docs.outpero.com/developers/openapi.json)
- Local screenshots: `.outpero-rehearsal.local.png` and `.outpero-campaign.local.png` in the workspace root. These contain fictional audit content and account UI; keep them local.
