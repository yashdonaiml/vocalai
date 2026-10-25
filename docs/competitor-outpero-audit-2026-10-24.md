# Outpero: product, services, business model and implementation audit

Audit date: 24 October 2026, America/Chicago. Prepared from official public material, current signed-in UI observations, and clearly labelled historical repository research. This is competitive product research, not a backend security audit or a live-call benchmark.

## Executive assessment

Outpero combines two businesses: a prepaid, self-service Indian-language calling application and a project-based automation/web agency. The self-service product sells completed business jobs—lead qualification, receptionist work, campaigns and booking—rather than exposing a large collection of speech/model infrastructure choices. The agency sells implementation, integrations and optional ongoing management. That distinction explains why some pages say “no setup fee” while others quote substantial build fees: they describe different offers.

Its strongest lesson for VocollAI is the packaging of onboarding, a number, a useful conversation and a business result into one journey. Its public feature documentation also exposes material limits. We should preserve our immutable deployment and Tool Gateway design, fix the launch blockers already identified, and productize one reliable receptionist/callback or booking workflow before adding campaigns.

## Evidence and action boundaries

- **UI-A:** this agent inspected the existing signed-in account today: dashboard, existing fictional Chitra employee, script, Actions, Settings, inbound checklist, API overview and billing. The employee remained paused. No records were created or changed.
- **UI-R:** root agent reported additional same-day read-only verification: account Settings, account webhooks, billing, phone-number/calling rules.
- **DOC:** official website or documentation describes a capability. This establishes its published contract or claim, not execution correctness.
- **HIST:** October 21/23 repository audits. The October 23 audit created a fictional draft and exercised one text rehearsal for ₹0.20; no phone calls or purchases. Details were not all repeated today.
- **INF:** explicitly labelled interpretation. No proprietary backend design is inferred from a UI alone.

No purchases, calls, campaign launches, paid tests, OAuth integration grants, API-key creation, account changes or external messages occurred in this audit. Existing Outpero login worked; no signup was needed. The resumed child browser later became unavailable, so root supplied additional UI observations. No native-browser input was used to interfere with concurrent Vapi/Retell work.

## 1. Business model and commercial offers

### Self-service calling

Retail pricing is Standard ₹5 and Premium ₹6.80 per connected minute. Signup supplies 50 free credits without a card; one credit equals ₹1 and unused credits do not expire. A dedicated +91 number costs ₹649/month with one concurrent channel; each extra channel is ₹649/month. Prices exclude GST. The public page says all seven languages and the main calling/integration features are available across voice tiers; the tier primarily changes voice quality. Public custom pricing starts as low as ₹3.50/min, subject to quotation. [Pricing](https://outpero.com/pricing).

UI-A/UI-R additionally verified 30-second billing blocks, no charge for ringing/busy/unanswered attempts, the same minute rate for inbound, and approximately ₹0.20 for AI drafting, suggestions and chat rehearsal. Number rental renews from the wallet. UI-R saw an enterprise card advertising 200+ simultaneous calls, volume rates and a dedicated account manager; its displayed floors were ₹3.60 Standard and ₹5.50 Premium. These are observed prices, not a promise of negotiated terms. [Billing UI](https://app.outpero.com/#billing).

**Revenue interpretation (INF):** retail connected-minute consumption, recurring number/channel rental, metered AI assistance, and negotiated enterprise contracts. Actual revenue, margins, COGS, carrier discounts, utilization and customer counts are unknown. “Trusted by 5,000+ businesses” is marketing, not independently verified revenue evidence.

### Agency implementation and management

The agency offers scoped AI automation, voice-agent and web work, with discovery, written scope/price, build and deployment. It advertises a roughly two-week system delivery process and standalone solutions from ₹14,999. Listed customer groups include real estate, healthcare, coaches/consultants, D2C, legal firms, e-commerce and SaaS. These are commercial claims rather than observed project outcomes. [Agency](https://outpero.com/agency).

| Packaged service | Published starting build price | Management / delivery detail |
|---|---:|---|
| Revenue Capture | ₹60,000 | Optional ₹15,000/month; voice, WhatsApp, CRM sync, follow-up, analytics |
| Ops Efficiency | ₹1,00,000 | Custom scope; process mapping, 3–5 automations, n8n/Make logic, training/check-in |
| Web Capture | ₹50,000 | Optional ₹8,000/month; landing pages, capture, WhatsApp and CRM follow-up |

Agency platform expenses—including messaging APIs, hosting and voice infrastructure—are billed separately at cost. Do not apply the self-service minute price as an all-inclusive agency implementation quotation. [Revenue systems](https://outpero.com/revenue-systems).

### Complete published standalone catalogue

The 19 offerings are: WhatsApp Business Automation; AI Lead Qualification; Appointment Booking Automation; Follow-up Sequence Automation; Cart Abandonment Recovery; Invoice & Payment Reminder; Internal Workflow Automation; Custom AI & Automation; Inbound AI Voice Agent; Outbound AI Voice Agent; Custom Voice Agent; Business Website; Landing Page; Website Redesign; Website + Lead Pipeline; E-commerce Store; Custom Web Solution; Business Automation Audit; Conversion & Website Audit. The catalogue quotes an overall starting point, not a separate verified price for each item. [Solutions](https://outpero.com/solutions).

### Enterprise, agency customers and partners

Enterprise rates and builds/integrations are discussed against volume, concurrency, reporting and compliance requirements; specific entitlements must be agreed in writing. [Enterprise explanation](https://www.outpero.com/questions/is-there-an-enterprise-or-custom-plan-for-ai-voice-agents-in-india).

Outpero explicitly says its published self-service offer has **no white-label program, reseller console, custom-branded dashboards or multi-client subaccounts**. Agencies can sell setup/tuning/reporting services around client usage, and ask about high-volume help. This is not evidence of a revenue-share/affiliate program. [White-label position](https://outpero.com/white-label-ai-voice-agent).

## 2. Service modes, customers and use cases

| Mode | Customer workflow | Evidence / boundary |
|---|---|---|
| Instant lead calling | New enquiry triggers a call through an employee-specific intake URL; lead variables personalize the conversation. | DOC; UI control exists. No real lead submitted. |
| Bulk campaigns | Import/paste contacts, choose employee, schedule windows/retries, run through a list using purchased capacity. | HIST wizard inspected; no campaign saved/launched. |
| Inbound receptionist | Purchase number, attach working employee, receive calls and review results. | UI-A desk showed not ready, 0/3 checklist complete. |
| Voice broadcast | Play a fixed recording or synthesized announcement, then hang up; no two-way reasoning. | DOC; employee option was disabled in inspected draft. |
| Bespoke agency solutions | Integrate workflows, messaging, CRM and web capture for a customer. | DOC commercial offer, not hands-on implementation. |

Inbound pages advertise 24/7 answering, calendar booking, WhatsApp and human transfer. Some recent language guides still describe inbound as launching; account availability should be confirmed. [Inbound product](https://outpero.com/product/inbound), [Tamil limits](https://outpero.com/blog/tamil-voice-bot-for-business).

Instant calling markets under-30-second lead-to-ring response, subject to source delivery and normal conditions. This is separate from conversational turn latency. [Instant leads](https://outpero.com/product/instant-leads). Campaign pages present list processing, capacity and outcome tracking, not a guarantee that every contact answers. [Campaigns](https://outpero.com/product/campaigns).

Examples span property qualification/site visits, clinics and appointments, admissions/counselling, automotive test drives/service, insurance/renewals, payment reminders, COD confirmation, feedback/NPS, reactivation and recruitment screening. These are proposed jobs, not verified customer conversion results. Start with one measurable outcome; a friendly call or model-generated summary is not proof of a booking or payment. [Use-case overview](https://outpero.com/blog/ai-voice-agent-use-cases-india).

Broadcast is described as cheaper than conversational minutes, but the exact broadcast tariff is not published consistently; confirm in-account before budgeting. A use-case calculator displaying general AI rates does not settle the broadcast rate. [Broadcast explanation](https://outpero.com/blog/best-voice-broadcasting-service-india), [announcement use case](https://outpero.com/ai-voice-agents/use-case/voice-broadcast-announcements).

## 3. Customer journey, agent construction and releases

UI-A verified job-first onboarding: describe the business job, choose language/category, select an industry preset, and build an employee. The existing receptionist has an opening line, three steps and FAQ editor; steps can be reordered. It supports pre-call variables, strictness levels, a rewrite assistant and an enhancement toggle. A separate Outcomes surface configures captured fields. Browser Talk, text Chat and telephone Test call controls are visible. The existing draft remains paused; no execution was triggered. [Employee UI](https://app.outpero.com/#employee/404c94a2-2302-462a-b25c-a99f0bac5e08).

UI-A version history says a version is saved when going live or changing category. Some configuration applies immediately rather than awaiting publication (notably capture fields in DOC/HIST). No environment/canary/evaluation promotion gate was exposed in inspected UI. This does not prove such mechanisms do not exist internally. The category-switch explanation mentions clearing call history; migration/retention effects need clarification before use.

UI-A employee Settings exposes a hard duration limit, observed at 600 seconds, preset lengths and an optional final message. It separately exposes recording notice, AI disclosure and power prompting. Duration enforcement was not tested. Our acceptance test should validate the timer survives model/tool activity and ends gracefully rather than merely saving a setting.

## 4. Voice, languages and model positioning

Current positioning focuses on Hindi, Telugu, Tamil, Marathi, Kannada, Malayalam and Indian English, including English mixing. The voice page claims native-speaker review, hundreds of auditions, many test calls, ambient audio, acknowledgements, interruption handling and language-specific enhancement. Its sample conversations disclose that both sides are AI. None of the “most natural” or latency claims was independently benchmarked. [Voices](https://outpero.com/voices).

Feature explanations constrain an individual agent more narrowly than a seven-language marketing label: one opening Indian language, English and at most one extra Indian language; English-primary configuration historically permits two additional Indian languages. They make no per-dialect training promise, and unsupported languages include Bengali, Gujarati, Punjabi, Odia, Urdu and Assamese. [Tamil guide](https://outpero.com/blog/tamil-ai-calling-agent-explained), [white-label/language limits](https://outpero.com/white-label-ai-voice-agent).

DOC describes a streaming speech-recognition → language-model → synthesis pipeline and average conversational delay of 0.8–1.3 seconds. “Swara” is a branded orchestration/voice positioning, not evidence that they trained a proprietary foundation model. [Pipeline explanation](https://www.outpero.com/blog/how-ai-voice-agents-work).

HIST public-client research found provider names including Sarvam, Cartesia, Smallest, Inworld and Soniox. That establishes names represented in shipped client code at that time, not current backend routing, exact model versions, fallback order or vendor contracts. No current BYOK/model-selection contract, voice cloning entitlement, on-prem deployment, dedicated model hosting or SIP/BYOC API was verified. [Historical architecture research](./outpero-public-analysis.md).

## 5. Knowledge and memory

Official training docs describe typed text, photos, voice notes and webpage URLs, with extracted facts/rules reviewed by the owner. Published caps: 1,000 characters per taught item, 500 items, 30,000 total taught characters, 200 materials per employee. No PDF upload is offered. Roughly up to 10,000 characters is included directly in instructions; larger knowledge is searched as short passages, described around 700 characters. This is a documented product explanation, not independently inspected retrieval code. Sandbox chat is the proposed validation method. [Training](https://outpero.com/ai-voice-agents/features/knowledge-base-training).

Caller memory is opt-in per employee/phone, documented to retain name, count, last outcome, up to 25 facts and five recent summaries. UI-R confirmed Smart follow-ups bundles memory with exact-time automatic callback redial and is off. Some material describes memory for outbound only, while a broader pipeline blog describes inbound memory; confirm scope rather than assuming parity. [Memory](https://outpero.com/ai-voice-agents/features/caller-memory), [pipeline blog](https://www.outpero.com/blog/how-ai-voice-agents-work).

## 6. Integrations: what is native versus an HTTP recipe

### Lead sources and automation tools

Integration documentation explicitly distinguishes **setup guides from native connectors**. Zapier, Make, Pabbly, n8n and CRM guides configure HTTP POSTs to `/lead-intake/{slug}` with `X-Outpero-Lead-Secret`. Examples include Meta leads, Zoho, LeadSquared, Sell.Do, IndiaMART, JustDial, WordPress, Wix and Sheets bridges. Defaults: 120 requests/min/account, 1,000 leads/day/endpoint, five-minute deduplication; duplicate window configurable 1–1,440 minutes. CSV/paste accepts 5,000 contacts/request and 50,000/campaign; not direct Excel. Instant leads require an owned purchased number; only Indian mobile numbers are dialled. [Lead intake](https://outpero.com/ai-voice-agents/features/lead-intake-api-and-integrations).

### Google Calendar

One connected Google account per employee; IST only. Booking supports duration, business hours, overlap policy and required name. It does not list available slots, reschedule or cancel. A requested occupied time is discovered by a failed booking attempt; the agent then proposes another. No caller confirmation message/invitation is automatically sent; WhatsApp requires a separate action. UI-A verified the connection tile but granted no access. [Calendar limits](https://outpero.com/ai-voice-agents/features/google-calendar-booking).

### WhatsApp

Uses the customer's Meta Cloud API, Interakt or AiSensy account; another vendor can be wired through Custom API. Sends approved text templates during or after a call to the lead's dialled number, with mapped variables. Does not provide free-form chat, reply handling, images, PDFs, location pins, buttons or between-call scheduled messaging. The messaging provider's charges stay on the customer's bill. UI-A verified tiles, not delivery. [WhatsApp limits](https://outpero.com/ai-voice-agents/features/whatsapp-messages-during-and-after-calls).

### Custom APIs and Sheets/CRM actions

UI-A verified GET/POST custom-action configuration and master API-actions switch. DOC describes literal/saved-credential headers, lead placeholders, up to eight AI-collected parameters, one attempt and ten-second timeout. Raw response text is passed to the model; it recommends a small wrapper returning caller-safe content rather than a large internal JSON object. The test button sends a real request, so it was not used. Native approval/revision binding, exact readback confirmation, idempotency or egress protection for these actions was not established. [Custom actions](https://outpero.com/ai-voice-agents/features/custom-api-actions).

Broad marketing mentions live Sheets/CRM reads/writes. Distinguish these business outcomes from a verified built-in connector: the current inspected action list contained Calendar, WhatsApp and generic API surfaces, and lead integration docs explicitly describe HTTP guides. Dedicated Salesforce/HubSpot connector behavior was not verified.

## 7. Customer API and two webhook surfaces

UI-A Developer overview showed `https://api.outpero.com/v1`, API keys, activity, webhooks, language examples, dry-run call creation and `Idempotency-Key`. Its contract says API calls retain number, hours, DNC and credit rules. No key or request was created. [Developer UI](https://app.outpero.com/#developers).

HIST OpenAPI inspection counted 37 operations/30 templates spanning identity/balance, employees/numbers list/detail, create/list/detail/cancel calls, campaign lifecycle/contact management, leads/inbound/events, DNC and webhook lifecycle/delivery/resend/secret rotation/testing. It did not expose general employee-creation/configuration mutations. Specification availability was not freshly confirmed by web extraction today. [OpenAPI](https://docs.outpero.com/developers/openapi.json), [API docs](https://docs.outpero.com/#api), [Postman](https://docs.outpero.com/developers/outpero-v1.postman_collection.json).

**Do not merge these contracts:**

| Surface | Evidence | Delivery guarantee described |
|---|---|---|
| Employee post-call webhook | DOC feature page | Single POST; five-second timeout; no retries; connected calls only; optional timestamped HMAC; recording link valid 24h |
| Account Developer webhooks | UI-R today | Signed events, retries for up to a day if receiver is down; no endpoint existed to inspect delivery behavior |

[Employee webhook docs](https://outpero.com/ai-voice-agents/features/post-call-webhooks), [account UI](https://app.outpero.com/#developers). These may be distinct generations/products; ask which events and replay guarantees each supports. Marketing `call.ended` examples and HIST API `call.completed` naming should likewise be treated as contract-specific.

## 8. Calling governance, capacity and follow-up

Capacity is sold as channels: one simultaneous call each. UI-R confirmed own-number/extra-line purchase controls, fixed bulk hours 09:00–21:00 and instant hours 06:00–22:00, consent language and warnings against scraped lists. No capacity enforcement or number order was tested.

DOC retry rules cap instant and bulk attempts at ten. Voicemail detection is primarily tuned to English; regional greetings may be mistaken for a person. No automatic SMS/WhatsApp fallback is part of retry logic. Callback rescheduling requires Smart follow-ups. [Retry/window limits](https://outpero.com/ai-voice-agents/features/call-retries-and-calling-windows).

Official DNC documentation describes account-level checks on import, intake and dial, confirmation before automatic opt-out addition, and no automated national NDNC scrub. However UI-R Settings describes skipping opted-out contacts conditional on a campaign option, and agency copy loosely says it screens against DND. **Unresolved discrepancy:** private account opt-outs and national screening are different; do not treat either broad phrase as verified universal enforcement. [DNC documentation](https://outpero.com/ai-voice-agents/features/do-not-call-and-consent-controls), [agency positioning](https://outpero.com/white-label-ai-voice-agent).

Human transfer is advertised in public product pages. No transfer tool, live transfer, staff availability check, fallback path or transfer cost was exercised. Saving callback details, notifying a human, assigning ownership and actually placing a redial are separate outcomes; current evidence does not verify the full chain.

## 9. Reporting, operations and testing

UI-A/HIST show a contact-oriented lead pipeline, callback/qualified counters, filtering, CSV export, conversation records and Performance charts. DOC describes outcomes, summaries, sentiment, typed capture fields and callback/DNC flags. Capture fields apply on save; types include text, choice, boolean, number and date. Call detail offers transcript/audio, talk ratio and credits used. It explicitly says there is no per-call quality score; classification failure can leave summary/outcomes empty while retaining audio/transcript. [Call results](https://outpero.com/ai-voice-agents/features/call-data-capture-and-summaries).

No automated scenario runner, adversarial test suite, quality-score gate, CI integration, staged environment promotion, percentage rollout, rollback transaction or production alert routing was verified. Their absence from the inspected UI is not proof of backend absence. Public “recovers mid-call,” “never calls twice” and load claims require fault-injection evidence before being used as comparative guarantees.

Useful acceptance tests for both products: background noise and interruption; unknown facts; mixed-language names/amounts; API timeout; duplicate lead; occupied booking; paused number; exhausted balance; failed webhook; worker/media disconnect; call duration limit; opted-out queued retry; changed configuration during an active call; and export/deletion reconciliation.

## 10. Privacy, security and terms

The privacy policy distinguishes account/visitor fiduciary processing from customer-directed call-data processing. It lists carrier, hosting, speech/AI, messaging, payments and monitoring provider categories; processing may occur outside India. It states transit encryption, staff access controls and monitoring, not a certified implementation guarantee. Call data retention is described generally as customer/account lifetime, which is less specific than the UI's 90-day audio statement. [Privacy policy](https://outpero.com/privacy-policy).

UI-A employee Settings says calls are recorded regardless of the notice switch and retained 90 days. UI-R account Settings offers lead CSV export and support-email deletion; no account retention or transcript-role controls were visible. HIST security disclosure names Supabase/Razorpay and a containerized/private database/cache model, but this was not re-audited today. No SOC 2/ISO certificate, independent penetration report, DPA/subprocessor schedule, at-rest key design, granular RBAC, SSO, tenant isolation tests, self-hosting or data-residency option was verified. A public sales-agent comparison acknowledges no enterprise certifications to show procurement. [Published limitation](https://outpero.com/blog/best-ai-sales-agents-india).

Terms allocate consent, recording, sector rules and list responsibility to customers, allow pausing calls/paid features for insufficient credit and possible number suspension after notice for unpaid rental. This report summarizes vendor terms, not legal advice. [Terms](https://outpero.com/terms-and-conditions).

Paid unused credits may be refundable on closure if requested within 180 days of the latest top-up, less unrecoverable gateway charges; promotional/consumed credits and current-month number/channel fees are not refundable. Billing faults have a 30-day reporting window. Support-mediated approved refunds target the original payment method. [Refund policy](https://outpero.com/refund-policy).

## 11. Defensible implementation picture

```text
Lead source / uploaded list / incoming telephone call
  -> Outpero employee + calling policy + number/channel capacity
  -> Documented streaming STT -> LLM -> TTS conversation
       -> knowledge facts/passages
       -> Calendar / customer WhatsApp / HTTP action
  -> call transcript + recording + classification/captured fields
  -> lead pipeline / performance / wallet ledger / webhook results

Agency implementations additionally connect forms, websites,
CRM and n8n/Make workflows around these business processes.
```

This is a product/data-flow interpretation supported by documentation. It does **not** identify their internal language, queue, database schema, media framework, deployment topology or carrier failover mechanism. HIST client code represented Vobiz/VoiceLink provisioning and a browser WebSocket audio protocol; neither proves the current active carrier or telephone media implementation. Customer SIP trunk/BYOC, LiveKit, Pipecat and a customer-deployable worker were not established. [Historical technical evidence](./outpero-public-analysis.md).

## 12. Cost model and ambiguities to resolve

For a self-service estimate, use per-call rounded connected duration, chosen voice tariff and total channels, plus metered assistance and applicable taxes. An illustrative 1,000 calls each lasting 40 seconds are billed as 1,000 minutes at the observed 30-second granularity, not 667 minutes. At Standard and one number/channel, that is ₹5,649 before GST and assistance; two channels total would be ₹6,298. This is our arithmetic from observed rates, not a vendor quote. WhatsApp provider costs and agency build/management expenses are separate.

Open questions before selecting Outpero or asserting parity:

1. Which enterprise floor applies, ₹3.50 public versus ₹3.60/₹5.50 observed, and what minimum volume/commitment?
2. What is the exact broadcast tariff and is that mode enabled for the account?
3. Is inbound fully available for the intended number/language/channel class?
4. Which DNC checks are unconditional, and is any national registry screening actually performed?
5. Which webhook surface should new integrations use; exact event names, retry schedule, expiry, replay and deduplication contract?
6. Does caller memory work inbound, outbound or both, and how is it deleted independently of auto-redial?
7. Can customers disable recording, set retention, export all call data and verify erasure across subprocessors?
8. What transfer methods, costs, failed-transfer fallback, callback ownership and staff notification receipts exist?
9. What SLA, support escalation, security evidence, data location and dedicated capacity accompany enterprise contracts?
10. Are current model/carrier choices disclosed, portable, or customer-selectable? Is BYOC/SIP supported by contract?

## 13. Priorities for VocollAI

1. Fix the security, privacy, eval, outbound-fetch, workflow durability and billing controls in the launch audit before adding competitor breadth.
2. Finish one actual inbound call with a truthful, durable callback or booking receipt and human follow-through.
3. Introduce a job-first onboarding/readiness journey over existing platform primitives.
4. Enforce call time, concurrency and budget controls and expose accurate failure states.
5. Add one production Calendar integration with availability, timezone and conflict handling; separate WhatsApp templates from a chat product.
6. Provide typed business outcomes, contacts and callback ownership, while retaining raw evidence for review.
7. Use one coherent API/webhook catalog and durable delivery contract; distinguish documented behavior from executed tests.
8. Preserve immutable releases and governed tools; simplify their customer presentation.
9. Add outbound only with central consent/opt-out checks, scheduling, limits, recovery and cost attribution.
10. If targeting India, evaluate carrier/number/KYC support independently; our US Telnyx setup is not equivalent to a managed +91 offer.

## Related local evidence

- [Prior signed-in audit, October 23](./outpero-product-audit-2026-10-23.md)
- [Prior public architecture research, October 21](./outpero-public-analysis.md)
- [Public endpoint inventory](./outpero-endpoint-inventory.csv)
- [Public page inventory](./outpero-public-pages.csv)

Private account contact details, keys and screenshots are intentionally excluded. No application code was edited.
