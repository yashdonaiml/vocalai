# Vapi competitive audit — October 24, 2026

## Scope and evidence

This report covers Vapi's public product, implementation surface, commercial offer, limitations, and lessons for VocollAI. Research used official Vapi pages and documentation accessed October 24, 2026. Authenticated observations were collected by the root agent in the user's account and supplied to this research agent. No calls, purchases, integrations, evaluation runs, publishing, or configuration changes were initiated for this audit.

Evidence labels:

- **UI observed:** a control/value visible in the authenticated account; it establishes presentation and entitlement display, not successful execution.
- **Documented:** an official description or API contract; not independently exercised.
- **Inference:** analysis of positioning or implications, not a claim about Vapi's private implementation or financial results.
- **Unresolved:** conflicting or incomplete evidence that needs vendor/account confirmation.

The original browser signup screen was directly inspected by this child agent. Later Google OAuth, onboarding and signed-in exploration were performed centrally by root because browser automation was unavailable in the child session. Account-specific details below contain no credentials or personal identifiers.

## Executive assessment

Vapi competes as a developer platform and managed conversational runtime, rather than only an agent editor. Its offer combines modular speech/model providers, phone and browser delivery, business tools, synthetic testing, production monitoring, and a commercial system for funding usage and buying capacity. Its partner channel adds implementation services around that platform. [Product introduction](https://docs.vapi.ai/quickstart/introduction), [partner program](https://vapi.ai/partnerships).

For VocollAI, the immediate competitive problem is reliable execution of existing controls: evaluations, privacy, limits, delivery, costs, and call control. A comparable number of tabs is insufficient. Our intended immutable deployments and governed tools can differentiate us if their enforcement is complete. This is an inference from Vapi's public offer and the preceding local code audit.

## 1. Customers, outcomes, and route to market

**Documented customer segments:** developers embedding voice in products; internal engineering teams automating business calls; ISVs; enterprises requiring capacity/governance/support; agencies and systems integrators delivering client implementations. Official customer stories cover inbound support, automotive sales/reminders, healthcare scheduling, insurance lead qualification, recruiting/screening, freight operations, and a consumer sleep-coaching application. Story metrics are vendor/customer claims, not results independently verified by this audit. [Customers](https://vapi.ai/customers), [developer FAQ](https://docs.vapi.ai/faq).

**Inference — commercial funnel:** free credits and a managed inbound number reduce initial friction; templates/presets establish first value; usage monetizes deployment; support/capacity/compliance packages expand the relationship; partners deliver vertical expertise. Public evidence does not establish revenue, gross margin, average contract value, retention, conversion rates, or the share of sales through partners.

**Documented partner offer:** Solution Partners design and implement client agents; Technology Partners contribute infrastructure/integrations. Program benefits advertise enablement, co-selling, dedicated partner management, architecture reviews, templates/demo assets, technical checkpoints, and joint marketing. No public commission schedule, revenue-share percentage, exclusivity requirement, or guaranteed lead allocation was established. [Partnerships](https://vapi.ai/partnerships), [directory](https://vapi.ai/partnerships/directory).

Agency wrappers are separately documented in the ecosystem, including Vapify, Voicerr AI, and VoiceAIWrapper. Their branded dashboards/billing are third-party products; do not represent them as native Vapi white-label functionality or proof of reseller rights. [Vapify](https://docs.vapi.ai/providers/vapify), [Voicerr AI](https://docs.vapi.ai/providers/voicerr-ai), [VoiceAIWrapper](https://docs.vapi.ai/providers/voiceaiwrapper).

## 2. Authenticated account observations

**UI observed by root:**

| Surface | Observation | What it does not prove |
|---|---|---|
| Authentication/onboarding | Google OAuth completed; prefilled name onboarding; agent builder offers Inbound, Outbound, Support, conversational setup, and Skip to dashboard | Quality of generated agents |
| Assistant | Riley, v1 Published; traffic control displays v1 at 100%; visual/code prompt editing | Traffic splitting or rollback execution |
| Configuration estimates | Approximately $0.09/min and 1,530 ms estimated latency for the displayed setup | Actual billed cost or measured call latency |
| Presets | Balanced, High Intelligence, Ultra Fast, Cost Saver | Preset quality in our use cases |
| Advanced behavior | Voice/STT fallbacks; endpointing/interruption settings; silence 30 seconds; maximum duration 600 seconds | Timer/fallback behavior on live calls |
| Data controls | Recording/logging/transcript switches on; enterprise consent-plan control; HIPAA/ZDR disabled and requiring add-ons in inspected UI | Compliance effectiveness or cross-plan availability |
| Webhooks | 20-second timeout; static-IP option | Retry semantics or delivery success |
| Evaluations | Empty Evals page; Create Evaluation and mock-conversation explanations | An eval run or scoring accuracy |

Observed account billing at [Billing](https://dashboard.vapi.ai/settings/billing): $5 credits; Package None; monthly fees $0; organizations 1/2; managed numbers 0/1; four shared subscription call lines; one concurrent chat simulation per organization; 200 API requests/minute/organization; 14-day history. These are the inspected account's displayed entitlements, not universal service guarantees.

## 3. Service catalog

### Assistants, conversation design, and Squads

**Documented:** an Assistant combines prompts, model, transcriber, voice, tools, and analysis. Templates cover support, qualification, scheduling, and information collection. Presets choose components for quality/speed/cost; customers may customize them. [Assistant quickstart](https://docs.vapi.ai/assistants/quickstart), [presets](https://docs.vapi.ai/assistants/model-intelligence/presets).

Persistent assistants are stored and reusable by ID. Transient assistants supply configuration inline per request for personalization/testing; they do not have the same dashboard management experience. Dynamic variables and call-time overrides supply context. These are product/API capabilities, not evidence of underlying database design. [Transient/permanent configurations](https://docs.vapi.ai/assistants/concepts/transient-vs-permanent-configurations), [variables](https://docs.vapi.ai/assistants/dynamic-variables).

Squads compose specialist assistants with context-preserving handoffs. This differs from transfer to an external human number. Vapi explicitly retired its previous visual Workflows on August 18, 2026; workflows stopped running August 19. Its migration explanation says specialized assistants produced more reliable results than models maintaining graph-node awareness. This notice is already past relative to this audit date. [Squads](https://docs.vapi.ai/squads), [workflow migration](https://docs.vapi.ai/workflows/legacy-migration).

### Phone, browser, raw audio, chat, and SMS

| Service | Documented implementation and bounds |
|---|---|
| Inbound PSTN | Managed US inbound number or imported carrier number; assign an assistant/Squad. [Phone quickstart](https://docs.vapi.ai/quickstart/phone) |
| Managed free number | US area codes; inbound only; number is free but usage consumes credits; port-out unsupported. First included number does not require a payment method. [Restrictions](https://docs.vapi.ai/free-telephony) |
| Carrier import/BYO telephony | API supports Twilio, Vonage, Telnyx, Vapi, and BYO-number configurations; SIP guides extend provider coverage. Country/feature support is configuration-specific. [Phone-number API](https://docs.vapi.ai/api-reference/phone-numbers/create) |
| Outbound calls | Single, batch, scheduled calls; destination, phone-number and assistant configuration through APIs/dashboard. [Outbound calling](https://docs.vapi.ai/calls/outbound-calling) |
| Campaigns | Contacts, variables, scheduling, voicemail, pre-dial checks, webhooks and outcomes; up to 10,000 contacts; dashboard scheduling up to seven days ahead. Launch creates an immediate/scheduled run, not an editable draft. Configuration locks; duplicate for changes/re-runs. [Campaign overview](https://docs.vapi.ai/outbound-campaigns/overview) |
| Browser/mobile | Web SDK and mobile integration options; server SDK for backend operations. Live transcripts/call events can drive application UI. [Web calls](https://docs.vapi.ai/quickstart/web) |
| Raw audio | Bidirectional WebSocket transport with selectable audio formats; distinct from listening to a call. [WebSocket transport](https://docs.vapi.ai/calls/websocket-transport) |
| Live call operations | Control URL supports live interventions; listen URL exposes audio streaming. Access must be handled as sensitive call access. [Live call control](https://docs.vapi.ai/calls/call-features) |
| Text chat | Assistant-backed streaming/non-streaming chat, persistent sessions or previous-chat context, OpenAI-compatible interface. Requires payment setup on usage subscriptions; new subscriptions under 30 days also need a completed purchase. Voice is exempt. [Chat quickstart](https://docs.vapi.ai/chat/quickstart), [streaming](https://docs.vapi.ai/chat/streaming) |
| SMS conversation | Customer-initiated only; 10DLC-approved Twilio number; provider alternatives not supported for this feature; default session expiry 24 hours. Billing failures can leave received SMS without a reply or dashboard error. [SMS chat](https://docs.vapi.ai/chat/sms-chat) |
| Embeddable widget | Configurable voice/text widget via script or React component using a public API key and assistant ID. [Widget](https://docs.vapi.ai/chat/web-widget) |

Phone-call tools include transfer to E.164/SIP destinations, hangup, voicemail handling, and SIP messaging. Transfer modes and fallbacks need testing against the actual transport; a handoff between assistants is a separate operation. [Transfer tool](https://docs.vapi.ai/tools/transfer-call), [tool catalog](https://docs.vapi.ai/tools).

### Knowledge and business actions

Knowledge bases attach uploaded documents to retrieval/query tools. Supported formats include PDF, Word, text/Markdown, CSV and structured text. Custom retrieval endpoints let the customer use its own search/vector system. This does not establish Vapi's own embedding/index implementation. [Knowledge bases](https://docs.vapi.ai/knowledge-base), [query tools](https://docs.vapi.ai/knowledge-base/using-query-tool), [custom retrieval](https://docs.vapi.ai/knowledge-base/custom-knowledge-base).

Business actions can use direct API Request tools, Function tools handled by a customer backend, or MCP servers that discover tools at runtime. Static parameters and aliases inject/chains trusted values outside model-generated arguments; rejection plans and field encryption add controls. Scope and authorization still depend on destination services. [Tools](https://docs.vapi.ai/tools), [static parameters](https://docs.vapi.ai/tools/static-variables-and-aliases/static-parameters), [MCP](https://docs.vapi.ai/tools/mcp), [argument encryption](https://docs.vapi.ai/tools/encryption).

Official business-service guides cover Google Calendar, Google Sheets, Slack, GoHighLevel, Make, and n8n. Some are prebuilt connections; others are standard HTTP/MCP patterns. A marketing integration count must not be interpreted as identical depth or guaranteed operations for every named service. [Integration patterns](https://docs.vapi.ai/tools/integrations).

## 4. Implementation and architecture options

**Documented external architecture:** transport feeds a voice pipeline with STT, orchestration, LLM, and TTS. Providers can use platform access, customer keys, or supported custom endpoints. Vapi's proprietary orchestration remains on Vapi infrastructure even with customer models/storage. The public data-flow guide explicitly lists endpointing, interruption detection, noise/voice filtering and other conversational processing as Vapi-controlled. Custom storage does not move all processing into the customer's infrastructure. No private microservice, database, queue, autoscaling, or tenancy implementation was established. [Data flow](https://docs.vapi.ai/security-and-privacy/data-flow).

Provider defaults enable initial setup without provider accounts. BYOK sends provider charges to the customer's provider account; it does not remove Vapi hosting charges. Custom LLMs use OpenAI-compatible endpoints; custom STT/TTS have their own transport contracts. [Provider integrations](https://docs.vapi.ai/providers/integrations), [provider keys](https://docs.vapi.ai/customization/provider-keys).

Implementation choices:

1. Dashboard/template for an initial agent and browser/phone test.
2. Server REST API or TypeScript/Python SDK for resource management and calls; private credentials remain on the backend.
3. Web/mobile SDK or widget for embedded voice; public keys can restrict origins and assistant access.
4. SIP/BYO carrier for PBX/contact-center connections and owned numbers.
5. Server URLs for real-time events, function execution and dynamic inbound configuration.
6. Custom retrieval/model/storage endpoints where business data/control require it.
7. CLI, MCP, agent skills and GitOps for developer workflows.

Sources: [web/server SDK examples](https://docs.vapi.ai/quickstart/web), [API keys](https://docs.vapi.ai/security-and-privacy/api-keys), [Server URLs](https://docs.vapi.ai/server-url/), [CLI](https://docs.vapi.ai/cli), [MCP server](https://docs.vapi.ai/sdk/mcp-server), [agent skills](https://docs.vapi.ai/agent-skills).

Server URL selection has organization, number, assistant, and function-tool levels, with event-specific priority. It is not simply a broadcast to every configured URL. Custom credentials support authentication. [URL priority](https://docs.vapi.ai/server-url/setting-server-urls), [authentication](https://docs.vapi.ai/server-url/server-authentication).

## 5. Versions, release, tests and observability

**Documented:** assistant edits remain drafts until publication; numbered versions support history/restore. Tools are independently versioned; an assistant can pin a numbered tool version or follow Latest. Restoring an assistant does not freeze tools that still follow Latest. [Tool/assistant version interaction](https://docs.vapi.ai/assistants/versioning/versioning-with-assistants-and-tools).

The production guide says published versions can take traffic before simulations rerun. It recommends controlled real calls and GitOps for testing before promotion. Root saw a 100% traffic control but did not exercise splitting. Our mandatory evaluation gates should be compared with this documented procedure, not assumed to exist in Vapi. [Production path](https://docs.vapi.ai/quickstart/path-to-production).

GitOps stores assistants/Squads/tools/outputs/tests as files, resolves resource names to environment-specific IDs, syncs organizations, snapshots changes, and runs branch simulations with mocks. Its comparison table still contains older save-goes-live language inconsistent with current draft/version docs; use current versioning behavior plus the inspected published UI as stronger evidence. [GitOps](https://docs.vapi.ai/config-as-code).

| Quality layer | What it establishes | Boundary |
|---|---|---|
| Evals | Selected model decisions, response patterns, tool arguments using mock conversation context | Does not exercise speech or PSTN. [Evals](https://docs.vapi.ai/observability/evals-quickstart) |
| Simulations | Synthetic caller journeys in chat/voice; repeatable scenarios, personalities, criteria, tool mocks | Unmocked tools execute for real; conversation claims are not proof of external bookings. [Simulations](https://docs.vapi.ai/observability/simulations-quickstart) |
| Structured outputs | Schema-defined extraction after calls; reusable definitions and configurable extraction model | AI extraction can be wrong. [Structured outputs](https://docs.vapi.ai/assistants/structured-outputs) |
| Scorecards | Rules award points from boolean/numeric structured outputs after calls | API-oriented setup; source labels can be wrong; high score cannot negate critical failure. [Scorecards](https://docs.vapi.ai/observability/scorecard-quickstart) |
| Boards | Custom charts, calculated metrics, filters and dashboard layouts | Meaning depends on recorded data and definitions. [Boards](https://docs.vapi.ai/observability/boards-quickstart) |
| Monitors/issues | Scheduled analytics thresholds generate issues; email/Slack/webhook notification and investigation | Retained data required; ZDR organizations do not receive monitor evaluations. A notifier emits once per issue creation, not on every update/resolution. [Monitoring](https://docs.vapi.ai/observability/monitoring-quickstart) |
| Logs | Separate Calls, Chat, Sessions, Webhooks and API surfaces; call artifacts include cost/latency where available | Generation, history visibility and deletion are separate; session expiry is not retention expiry. [Logs](https://docs.vapi.ai/observability/logs/overview) |

No live quality, uptime, artifact latency, retry, or support-response benchmark was performed. UI latency estimates and marketing sub-second claims should not be presented as measured results.

## 6. Commercial model and economics

### Public pricing observed

The published new-customer offer combines prepaid usage with optional Success Packages; package charges do not replace consumption charges. Public pricing lists $0.05/minute hosting and provider charges at cost. [Pricing](https://vapi.ai/pricing).

| Package | Public package price | Calls / organizations / included numbers | Raw history | Support/governance |
|---|---|---|---|---|
| Usage only | $0 package fee | 4 / 2 / 1 | 14 days | Email/community; no response/uptime SLA |
| Core | $29/month | 10 / 2 / 5 | 30 days | Two-business-day response; ZDR listed |
| Pro | 10% of hosting spend, $999/month minimum | 30 / 10 / 10 | 180 days | One-business-day response; 99% uptime; Slack; basic RBAC/ZDR |
| Premier | Negotiated | Custom | Custom | One-hour P0 response; 99.9% uptime; custom RBAC/SSO, dedicated team/SIP |

The package rules and subscription scope are explained separately in [Success Packages](https://docs.vapi.ai/billing/pricing-and-success-packages). Concurrent call lines are shared across organizations in the subscription; campaign concurrency is a limiter, not reserved capacity. Legacy accounts have different per-organization arrangements. [Concurrency](https://docs.vapi.ai/calls/call-concurrency), [legacy concurrency](https://docs.vapi.ai/billing/purchase-call-concurrency).

Public add-ons list HIPAA at $2,000/month, extra concurrency at $10/line/month, and organizations at $20/organization/month. The pricing page's illustrative carrier rates include Twilio inbound $0.008/min, outbound $0.014/min, Telnyx $0.0055/min, and Vonage $0.00814/min; Vapi SIP/WebSocket transport is listed free. These are Vapi's displayed transport examples, not universal carrier quotes or total per-minute costs. [Pricing](https://vapi.ai/pricing).

### Cost responsibility

**Inference — useful estimation formula:** total customer cost = Vapi hosting + provider consumption + carrier/transport charges + optional package/add-ons + customer-owned integration/storage costs. Provider usage may depend on tokens, characters, audio, caching and actual talk time, so a static per-minute estimate does not establish an invoice. Avoid adding public example rates as though every route always incurs them.

Validated BYOK means the provider bills that component directly; do not double count it as Vapi pass-through. Our comparable offer needs clear responsibility for carrier rental, call duration, model usage and failed calls. [BYOK billing](https://docs.vapi.ai/customization/provider-keys).

Credits are USD prepaid subscription funds. Usage drains credits; auto-reload purchases funds at configured thresholds. With no balance and reload off, new billable activity is frozen. Recurring add-on funding can trigger additional credit purchases. Billing provides payment methods, statements and invoices. These behaviors were documented, not exercised. [Billing/credits](https://docs.vapi.ai/billing/manage-billing-and-credits).

**Revenue-model inference:** hosting consumption, recurring support/governance packages, capacity/compliance add-ons, and negotiated enterprise contracts are identifiable revenue streams. Pass-through provider charges should not be assumed to be high-margin model resale. Partner implementation revenue may accrue to partners; Vapi's contractual share is unknown. Public data does not justify a company revenue estimate.

## 7. Security, privacy and enterprise boundaries

- **API access:** public client keys may restrict origins/assistants; private keys are organization-wide and must stay server-side. Empty origin restrictions allow any origin. Fine-grained private-key scopes were not established. [API keys](https://docs.vapi.ai/security-and-privacy/api-keys).
- **Identity/roles:** SAML/OIDC SSO is Enterprise/Premier. SSO docs list Admin, Editor and Viewer, and explicitly state SCIM is unsupported. Basic package docs say Usage/Core members are all admins; do not assume enterprise role controls at entry level. [SSO/RBAC](https://docs.vapi.ai/security-and-privacy/sso), [packages](https://docs.vapi.ai/billing/pricing-and-success-packages).
- **SOC 2:** Vapi claims Type II attestation covering security, availability and confidentiality, applicable across plans. The underlying report was not obtained or independently audited here. [SOC documentation](https://docs.vapi.ai/security-and-privacy/soc).
- **HIPAA:** official setup requires paid eligibility, signed BAA, organization-wide mode and compatible providers; incompatible settings are rejected according to docs. This does not make an arbitrary customer deployment compliant. [HIPAA](https://docs.vapi.ai/security-and-privacy/hipaa).
- **Consent:** Enterprise recording-consent plans insert a consent assistant and start recording after consent, using verbal or stay-on-line patterns and configured decline handling. Legal suitability remains use-case/jurisdiction-specific. [Consent plan](https://docs.vapi.ai/security-and-privacy/recording-consent-plan).
- **ZDR:** docs say call content is not retained after the interaction, but history/cost/performance metadata remain; custom storage must be configured separately. Structured-output overrides deserve review. HIPAA and ZDR are mutually exclusive. Eligibility is inconsistent across sources; see unresolved findings. [ZDR](https://docs.vapi.ai/security-and-privacy/zero-data-retention).
- **Storage:** customer buckets are supported for artifacts; provider-key guide names S3/GCP/R2/Azure. This is artifact export/control, not complete removal of Vapi from processing. [Provider/storage keys](https://docs.vapi.ai/customization/provider-keys).
- **EU residency:** Premier-only EU organization region uses separate dashboard/API/SIP endpoints and region-specific outbound addresses. Provider-specific processing residency still needs contractual review. [EU region](https://docs.vapi.ai/security-and-privacy/eu-region).
- **Network controls:** optional static outbound IPs allow webhook/tool destination allowlisting. They supplement, rather than replace, authentication and destination authorization. [Static IPs](https://docs.vapi.ai/security-and-privacy/static-ip-addresses).
- **Payment data:** PCI documentation describes configurable data-handling modes, provider selection and selectively disabling artifacts during payment portions. No PCI assessment report or payment flow was tested. Treat marketing compliance language as vendor claims requiring scope verification. [PCI](https://docs.vapi.ai/security-and-privacy/pci).
- **Data-use contracts:** current Terms distinguish subprocessors, optional providers and customer-managed providers; BYOK/provider data practices require separate evaluation. Do not infer zero provider training/retention from Vapi ZDR alone. [Terms](https://vapi.ai/terms-of-service), [Privacy](https://vapi.ai/privacy).

## 8. Material limitations and inconsistent evidence

1. **API Request retries:** official guide says non-2xx/timeouts do not automatically retry even when a backoff plan is configured. Timed-out writes can still complete upstream. Customer services need outcome checking/idempotency. This differs from webhook delivery semantics. [Tool reliability](https://docs.vapi.ai/tools/api-request/reliability).
2. **Provider fallback is not universal:** model fallback is currently limited to OpenAI/Anthropic Bedrock same-provider models; GPT-Live lacks model/voice fallback. [Model fallback](https://docs.vapi.ai/customization/model-fallback-plan).
3. **Native realtime compatibility differs:** GPT-Live docs exclude native Telnyx/Vonage, support Vapi SIP/native Twilio/browser, and limit transfers to blind phone/SIP transfers on supported routes. Warm transfer, exact prerecorded speech and some keypad operations differ. These are Vapi mode restrictions, not general carrier limitations. [GPT-Live compatibility](https://docs.vapi.ai/gpt-live/configuration), [migration](https://docs.vapi.ai/gpt-live/migrate).
4. **ZDR eligibility conflict:** ZDR guide says no separate purchase; package docs/pricing list inclusion with paid packages, and root's inspected controls were add-on gated. Do not assert free ZDR for the inspected account without vendor confirmation. [ZDR guide](https://docs.vapi.ai/security-and-privacy/zero-data-retention), [add-ons](https://docs.vapi.ai/billing/manage-packages-and-add-ons).
5. **History versus deletion:** pricing advertises raw-data retention; log docs distinguish history windows from separately billed content-deletion settings, and exclude API/webhook logs from that deletion control. Ask for exact deletion policy and backup scope. [Logs](https://docs.vapi.ai/observability/logs/overview).
6. **Chat webhook wording:** chat guide says voice-style server events are unsupported but separately lists chat.created/deleted. Interpret this as a restricted chat event set, not universal webhook parity. [Chat](https://docs.vapi.ai/chat/quickstart).
7. **Legacy guidance:** old billing defaults, former Workflows, older HIPAA wording and GitOps save semantics remain discoverable. Current account UI and newest feature-specific docs should take precedence, with conflicts documented rather than silently combined.
8. **Campaign mutability:** launched/scheduled campaign config is fixed; cancellation/duplication replaces edit-and-resume expectations. [Campaigns](https://docs.vapi.ai/outbound-campaigns/overview).
9. **Tests are imperfect evidence:** mocks and synthetic callers cannot prove external booking/payment state, PSTN quality, consent legality or production safety. [Simulation practice](https://docs.vapi.ai/test/simulations-best-practices).
10. **Trust/marketing claims not independently proven:** uptime SLA is contractual, not measured uptime; customer case-study gains, latency claims, compliance, integration counts and model quality were not independently benchmarked.

## 9. Prioritized implications for VocollAI

These recommendations combine this competitor research with the preceding repository audit; they are not claims that Vapi implements our proposed internal design.

| Priority | Action | Rationale |
|---|---|---|
| P0 | Make privacy/access/retention controls executable and remove unsupported promises | Trust controls are part of the sold product, not decorative settings |
| P0 | Lock evaluation results and gate policy; run tests against immutable versions | Trusted release evidence is a potential advantage over publish-then-test workflows |
| P0 | Close every outbound-fetch bypass | A single governed tool path is meaningful only when all relevant execution uses it |
| P1 | Enforce concurrency, duration, idle and spend limits | Entry plans already expose finite operational entitlements |
| P1 | Capture provider usage and show estimate versus actual | Cost visibility and funded usage are core commercial infrastructure |
| P1 | Add durable event/workflow/webhook delivery with outcome visibility | Business actions must survive outages and retries |
| P1 | Implement actual end-call/human transfer and capability validation | Customers buy completion and escalation, not just conversation |
| P1 | Provide tested presets and a first-call checklist | Reduce configuration burden without pretending all provider combinations work |
| P1 | Monitor failures and latency, alert operators, turn incidents into regression cases | Production confidence requires a feedback loop |
| P2 | Add SDK/widget/API write paths and stable event contracts | Enable developers and partners to embed and extend the platform |
| P2 | Consider specialist handoffs separately from business workflow graphs | Visual prompt flow is not a deterministic workflow engine |
| P2 | Define partner and commercial packages from actual service capabilities | Avoid copying fees/tiers before support and reliability exist |

Recommended initial scope: controlled, invoiced inbound pilot; supported tested runtime combinations; truthful callback capture; governed reads and explicitly supported writes; human fallback only when implemented; documented operational runbooks. Expansion to campaigns/SMS/agency white-label should follow production correctness, not delay it.

## 10. Outstanding validation

- Real call audio, barge-in, latency distribution, provider failure behavior and transfer success.
- Evaluation and simulation execution, judge reliability, version-specific traffic behavior and rollback.
- Successful and failed webhook/tool deliveries, duplicates and outcome reconciliation.
- Actual invoice details, chat/simulation billing, package transition timing, country-specific carrier pricing and negotiated enterprise terms.
- ZDR entitlement/deletion semantics, data exports, provider/subprocessor contracts, residency and audit-report scope.
- Partner economics/resale rights and whether any advertised service is region/account gated.

No evidence in this report establishes Vapi's private source code, database topology, queue guarantees, infrastructure cost, staffing ratios or profitability. Recheck commercial terms before a purchase or contractual commitment.
