# Retell AI competitor audit

Initial research date: October 24, 2026 (America/Chicago). Updated October 25 after authenticated dashboard inspection. Scope: official public product pages/documentation plus signed-in configuration screens. One blank audit draft was created to inspect the editor; no calls, paid tests, simulations, purchases, publishing, integration connections, API keys, contacts, alerts or campaigns were submitted.

## Evidence and access status

- **Authenticated inspection completed by the coordinating agent, 25 October:** home/Conductor, agent creation and editor, workflow, simulation, draft versions, integrations, billing/budget, workspace limits/reliability/roles/webhooks/DNC, phone/knowledge inventories, campaigns, contacts, call history, live monitoring, analytics, QA and alerting were inspected. See the [complete dashboard addendum](./competitor-retell-dashboard-audit-2026-10-25.md).
- **Observed fixture:** one blank Single-Prompt Agent, Draft V0, was created; it remains unpublished and unassigned. No runtime behavior was exercised.
- **Documented:** statements below remain documentation-backed unless confirmed in the addendum. UI observation establishes available configuration and displayed values, not execution correctness.
- **Inference:** commercial and implementation conclusions are labeled. Public interfaces do not reveal Retell's internal service topology, database, media substrate, tenant implementation, queue durability, or provider contracts.
- Authentication is now complete. Credentials and MFA codes were handled in the user-facing authentication UI, not included in the audit report.

### Authenticated corrections and additions

The account shows $10 credit, 20 concurrent calls, 1 CPS for each carrier category, no reserved inbound allocation, and paid concurrency burst enabled. Agent defaults store Everything with Keep forever retention, read contact memory but do not save it, and expose a separate $0.005/run memory-update charge. Workflow and Simulation are distinct from the live prompt. Native integration cards were verified. Role definitions are Admin/Developer/Member; custom role creation is disabled. Stable Server is disabled for this account and priced +$0.02/minute. Agent/workspace webhook timeout defaults are 5 seconds. Empty call history means QA example figures are not account performance evidence. These findings supersede corresponding login-blocked statements and qualify documentation-only entitlement claims; see the addendum for exact scope.

## Executive assessment

Retell competes as an integrated conversational operations platform: voice and chat agent building, managed telephony, testing, business-system actions, campaign execution, call history, analytics, and quality monitoring. It offers both dashboard-driven configuration and programmatic integration. Its main lesson for our launch is the completeness of operational controls around the conversation: admission limits, version targeting, test evidence, privacy settings, billing enforcement, and operator diagnostics.

This is not proof that Retell implements every advertised safeguard flawlessly. The documented surface is a useful benchmark; enforcement still needs account-level and controlled runtime testing. The platform describes itself as running speech, telephony, and language-model layers so customers can configure rather than assemble those components. [Product introduction](https://docs.retellai.com/general/introduction)

## 1. Services and customer jobs

| Service | Customer job | Evidence |
| --- | --- | --- |
| Voice agents | Answer inbound calls; conduct outbound conversations; handle routing, appointments, intake, support, and transfers | [Build overview](https://docs.retellai.com/build/overview) |
| Chat and SMS | Deploy text conversations and use SMS around telephone interactions | [Chat/voice widget](https://docs.retellai.com/deploy/chat-widget) |
| Conversation-flow builder | Separate dialogue, tool actions, and transitions for structured handling | [Conversation flows](https://docs.retellai.com/build/conversation-flow/overview) |
| Managed numbers and SIP | Buy a number without a carrier account or connect existing telephony | [Number purchase](https://docs.retellai.com/deploy/purchase-number), [custom telephony](https://docs.retellai.com/deploy/custom-telephony) |
| Campaigns | Upload recipients and schedule batch outbound calls | [Batch calls](https://docs.retellai.com/deploy/make-batch-call) |
| Conductor | Build/refine agents, investigate conversations and knowledge, and work with analytics using an embedded assistant; review proposed changes before applying | [Conductor](https://docs.retellai.com/conductor/overview) |
| Pre/post conversation workflow | Retrieve context before the agent speaks and write outcomes or follow-up actions after a session | [Agent workflow](https://docs.retellai.com/agent/agent-workflow) |
| Contacts and memory | Carry a contact's useful context between calls/SMS, independently of a CRM | [Contact memory](https://docs.retellai.com/features/contact-memory) |
| Post Call Extraction | Produce summaries, success/sentiment classifications, and custom structured fields | [Post-call extraction](https://docs.retellai.com/features/post-call-analysis-overview) |
| AI QA | Evaluate sampled production calls and diagnose quality trends with transcript evidence | [AI QA](https://docs.retellai.com/ai-qa/overview) |
| Live operations | Follow transcripts, listen in, take over, or end ongoing calls | [Live monitoring](https://docs.retellai.com/features/live-monitoring) |

These are separate parts of a lifecycle rather than interchangeable features: conversation control governs the live dialogue; pre/post workflows operate around it; extraction produces business fields; QA evaluates quality.

## 2. Customer segments and solution positioning

Retell's site targets healthcare, financial services, insurance, logistics, retail, travel/hospitality, and debt collection. It also addresses builders/agencies that implement agents for clients and enterprises connecting AI to existing contact centers. These are marketed segments, not independently measured customer distribution. [Website](https://www.retellai.com/)

- **Healthcare:** scheduling, patient communication, intake, and operational calls, with HIPAA-oriented contracting. This is a product use case; it is not evidence that a particular deployment satisfies clinical or legal requirements. [Healthcare offering](https://www.retellai.com/industry/healthcare-industry)
- **Revenue teams:** speed-to-lead, qualification, and routing prospects into an appointment or follow-up process. [Lead qualification](https://www.retellai.com/use-cases/lead-qualification)
- **Service operations:** dispatch/intake and routing between callers and operational teams. [Dispatch offering](https://www.retellai.com/use-cases/dispatch-service)
- **Agencies/resellers:** build a branded experience on the API, manage client workspaces, and price their own service above platform usage. This is different from Retell providing the agency's entire branded application automatically. [White-label use case](https://www.retellai.com/use-cases/white-label-ai-voice-agents)

**Inference:** the go-to-market model combines self-service experimentation, developer adoption, partner-led delivery, and enterprise sales. Our most credible initial comparison is a narrow inbound receptionist/intake workflow, not parity with every contact-center use case.

## 3. Business and revenue model

Retell monetizes metered conversations plus optional capabilities and recurring resources. Voice usage combines infrastructure, selected models/voices, telephony, and add-ons; text is metered by AI message. Phone-number rental and purchased capacity provide recurring revenue. Testing and AI-assisted building can generate additional usage. Enterprise sales offer negotiated pricing/support/contract terms rather than a universally published rate card. [Pricing](https://www.retellai.com/pricing), [testing charges](https://docs.retellai.com/test/testing-pricing)

**Inference:** this creates expansion through call volume, more deployed workflows/channels, premium voice/model choices, QA coverage, and capacity. No public evidence reviewed establishes gross margin, carrier discounts, vendor passthrough percentages, customer acquisition cost, or actual revenue. Do not infer those from the retail component prices.

### Current price snapshot

Published prices are USD and configuration-dependent; they are a research snapshot, not a quote.

| Component | Public rate/example |
| --- | --- |
| Headline voice range | $0.07–$0.31/minute; detailed premium configurations can exceed it |
| Voice infrastructure | $0.055/minute |
| Platform/Cartesia/OpenAI voices | $0.015/minute listed |
| ElevenLabs Flash | $0.040/minute listed; other models differ |
| GPT-4.1 mini LLM | $0.0128/minute standard listed |
| Custom SIP telephony | No Retell telephony charge; external carrier charges remain |
| Standard displayed telephony | $0.015/minute; country/destination dependent |
| Knowledge retrieval | +$0.005/minute |
| Advanced denoising / guardrails | +$0.005/minute each |
| PII removal | +$0.01/minute |
| Batch dialing / branded call | +$0.005/dial / +$0.10/outbound call |
| SMS | $0.01/message listed |
| Extra concurrency | $8/slot/month after 20 included |
| Extra knowledge bases | $8/base/month after first 10 |

PAYG advertises full access and $10 trial credit. Enterprise lists negotiated pricing, SSO, contractual terms, enhanced support, and dedicated infrastructure/implementation add-ons. The table's exact entitlement markings need dashboard/sales verification. [Pricing and plans](https://www.retellai.com/pricing)

### Billing mechanics and cost controls

Current docs describe prepaid workspace balances; legacy non-enterprise monthly usage billing moved to credits on September 30, 2026. Enterprise can remain invoiced. Auto-recharge replenishes credits at a configured threshold. Recurring numbers, extra knowledge bases, CPS, and concurrency are separately card-billed. Usage stops at zero balance. Where Budget Setting is available, a monthly cap pauses calls/API requests at 100%; unused credit does not override that pause. Budget controls are not available on every workspace according to the documentation. Balances and payment methods are workspace-specific. Purchased credits are non-refundable. [Billing](https://docs.retellai.com/accounts/billing)

Testing is not a free sandbox in the dedicated pricing guide: text tests bill model messages; simulations include the simulated-user model; batch grading adds analysis usage. Audio tests use production voice rates, with telephony added for phone tests. Conductor has daily free allowances and optional paid usage enabled by an administrator. Quick-start wording calls browser testing free, so the account's actual entitlement must be checked rather than promising unlimited free tests. [Testing pricing](https://docs.retellai.com/test/testing-pricing), [quick start](https://docs.retellai.com/get-started/quick-start)

AI QA provides 100 analyzed minutes free per workspace, then lists $0.10 per analyzed minute. Coverage/sample rate therefore directly affects cost. [AI QA pricing](https://docs.retellai.com/ai-qa/overview)

## 4. Customer-visible technical implementation

### Supported integration approaches

1. **Managed dashboard agent:** configure a single prompt or flow, choose available model/voice settings, attach knowledge/actions, test, and bind telephony. No customer response server is required. The source describes capabilities, not Retell's underlying infrastructure. [Build overview](https://docs.retellai.com/build/overview)
2. **REST API and SDKs:** manage agents, calls, numbers, knowledge, and related resources programmatically. Official Node/TypeScript and Python clients handle authentication and structured errors. Our public API is currently read-only, so this is a substantive developer-platform gap. [SDK documentation](https://docs.retellai.com/get-started/sdk)
3. **Browser embedding:** website widget supports chat, voice, and callback experiences. Browser public keys can restrict domains and use reCAPTCHA; a private API key should not be exposed in a frontend. [Widget](https://docs.retellai.com/deploy/chat-widget), [public keys](https://docs.retellai.com/accounts/public-keys)
4. **Custom response server:** Retell opens a per-call WebSocket, sends transcript/context and response requests, and accepts streamed responses/actions. The customer owns reply logic; Retell retains telephony, transcription, turn-taking, and speech synthesis. [WebSocket protocol](https://docs.retellai.com/api-references/llm-websocket)
5. **Business-system functions/MCP:** connect native integrations or custom endpoints and remote MCP tools to live agents. MCP is an action integration, not proof of tenant isolation, approval governance, or immutable tool contracts. [MCP tools](https://docs.retellai.com/build/single-multi-prompt/mcp)
6. **SIP/BYOC:** import numbers and connect an existing carrier/contact-center stack. Documentation includes Twilio, Telnyx, Vonage, and established contact-center integrations. [Custom telephony](https://docs.retellai.com/deploy/custom-telephony)

### Custom LLM is not the same as universal BYOK

The documented custom-LLM path suits self-hosted models, proprietary retrieval/orchestration, or provider choices outside Retell's menu. The customer assumes response latency, uptime, and reconnection. It loses LLM Playground and simulation/batch testing; AI-agent transfer cannot target a custom-LLM agent; customer tool traces must be reported explicitly. Built-in agents receive features first. [Custom LLM overview](https://docs.retellai.com/integrate-llm/overview)

I did not verify a first-class arbitrary per-workspace LLM/STT/TTS BYOK registry equivalent to ours. BYO telephony and a custom response WebSocket do not establish universal credential substitution. This remains an explicit product/sales question.

### Telephony detail and Telnyx versus Twilio

Managed number purchase supports both carriers: Twilio US/Canada numbers are listed at $2/month, US toll-free $5/month; Telnyx supports US numbers at $2/month. Both can also connect as custom SIP providers. Retell therefore demonstrates that a platform can keep carrier choice separate from agent configuration. Number ownership, porting, caller-ID services, coverage, and carrier charges must be compared separately from AI minutes. [Managed numbers](https://docs.retellai.com/deploy/purchase-number), [Twilio setup](https://docs.retellai.com/deploy/twilio), [Telnyx setup](https://docs.retellai.com/deploy/telnyx)

KYC may be automatic, require Persona ID verification, or need manual review. The docs describe it as gating outbound calls, number purchase, and SMS; availability is country/risk dependent. Do not promise instant activation to every new customer. [KYC](https://docs.retellai.com/accounts/kyc)

## 5. Integrations, knowledge, and workflow behavior

### Integration catalog

Official docs list HubSpot, Salesforce, Dynamics 365, GoHighLevel, and Zoho CRM; Zendesk; Google Drive, OneDrive, and Notion knowledge sources; Calendly and Cal.com scheduling. Connections are workspace-level, with tools usable before/during/after conversations. CRM contact sync and analysis write-back are separate from tool availability. Multiple provider connections are possible, but only one CRM connection drives contact sync. Missing permission scopes may cause feature failure without marking the entire connection unhealthy. Tool requests have provider-dependent time budgets. [Integration overview](https://docs.retellai.com/integrations/overview)

The marketplace also presents automation-platform and business-app entry points. A marketing integration listing should not be treated as evidence of a native bidirectional connector until its authentication, supported operations, and failure handling are inspected.

### Knowledge and memory

Knowledge accepts URLs, documents, custom text, and synchronized content sources. Docs describe chunking, embeddings, vector retrieval, and transcript-derived query rewriting. Linked knowledge is retrieved during response generation; instructions can tune the rewritten query. This is documented behavior, not an independent retrieval-quality benchmark. Document synchronization and refresh are distinct from manually uploaded exports. [Knowledge base](https://docs.retellai.com/build/knowledge-base)

Contact memory is matched by phone number within a workspace and shared across agents. Reading and saving are separate switches; new agents default to reading on and saving off. It summarizes context rather than replacing structured fields. **Inference:** memory adds useful continuity but also makes shared-tenant access, deletion semantics, and incorrect identity matching important audit targets. [Contact memory](https://docs.retellai.com/features/contact-memory)

### Workflows

Pre-call/pre-chat functions can look up caller facts before the agent speaks; post-call/post-chat functions can log outcomes, create tasks, send messages, or save memory. Each slot is a dependency graph: independent functions can run concurrently, dependent functions consume predecessor output, and conditions can gate follow-ups. Examples include CRM lookup → ticket retrieval and booking receipt → confirmation. These are lifecycle graphs, separate from live conversation nodes. This documentation does not prove durable transactional delivery after process crashes. [Agent workflow](https://docs.retellai.com/agent/agent-workflow)

## 6. Testing, release, and operations

### Tests and tool safety

Simulation executes graded text scenarios and records batch/per-case results; APIs support CI orchestration and polling for completion. It does not validate actual audio. Important caveat: unmocked external functions can reach real systems, and MCP tools ignore configured mocks and invoke the real server. Transfers/SMS are simulated exceptions. Our explicit gateway modes can differentiate on safer default test isolation if verified. Never run an unknown existing Retell suite merely because its UI says simulation. [Simulation testing](https://docs.retellai.com/test/llm-simulation-testing)

### Release mechanics

Published versions are read-only; new drafts can branch from previous versions. Phone numbers can target versions or movable environment tags. Retell allows drafts as number targets too, so our immutable production-only policy can be stricter. Their version comparison surface is a useful review benchmark. [Versions](https://docs.retellai.com/agent/version)

Percentage A/B traffic distribution is documented for inbound/outbound voice and chat. This is stronger than merely storing a canary percentage: traffic must actually be routed according to it. [A/B testing](https://docs.retellai.com/deploy/ab-testing)

### Capacity, monitoring, and events

Workspace concurrency, calls-per-second, reserved inbound capacity, burst options, and inbound queue/fallback are documented. Default PAYG concurrency is 20 per workspace. These controls establish the product expectation that outbound workloads cannot consume all inbound capacity unchecked. [Limits](https://docs.retellai.com/deploy/concurrency)

Live operations expose transcript following, listen-in, takeover, and call ending. Existing call data can support diagnosis rather than relying solely on agent prompts. No feature was exercised in this audit. [Live monitoring](https://docs.retellai.com/features/live-monitoring)

Post-call extraction yields built-in and custom business fields; QA adds cohort sampling and evidence-backed diagnostics for hallucinations, KB correctness, overlaps, latency, sentiment, and tool usage. AI scores should be treated as model judgments requiring calibration, not objective proof. [Extraction](https://docs.retellai.com/features/post-call-analysis-overview), [QA](https://docs.retellai.com/ai-qa/overview)

Alert rules support metric thresholds, time windows, filters, and email/webhook delivery; metrics include cost, success, concurrency, API errors, and function/transfer failure. Webhooks separately retry up to three times when no 2xx arrives within ten seconds, requiring consumer idempotency. Transfer-attempt deduplication needs more than call ID alone. [Alerting](https://docs.retellai.com/features/alerting-overview), [webhooks](https://docs.retellai.com/features/webhook-overview)

Retell publicly claims greater than 99.9% uptime, autoscaling, resilience, and continuous monitoring. This is a vendor claim; contractual SLA, exclusions, compensation, region behavior, and real outage recovery were not independently verified. [Reliability](https://docs.retellai.com/reliability/reliability-overview)

## 7. Security, privacy, enterprise, and partners

Storage modes include everything, everything except PII, and basic attributes only. PII removal preserves specified operational fields; it is not total anonymization. Retell has no dedicated recording-disclaimer switch according to the docs: customers place a first utterance/static flow node, with interruption handling where appropriate. [Storage and PII](https://docs.retellai.com/accounts/privacy-disable)

Retention is per agent, defaults to indefinite storage, and deletes expired records daily. It covers recordings, transcripts, logs, retrieval logs, and dynamic context. It is distinct from preventing storage in the first place. Backup/subprocessor deletion behavior and exact policy-change retroactivity require further contractual verification. [Retention](https://docs.retellai.com/accounts/data-retention)

Retell claims SOC 2 Type 1/2, HIPAA and GDPR support; signed BAA/DPA/SCC agreements and correct configuration remain necessary. Docs say agreements carry no added signing fee and describe ZDR agreements with speech/model subprocessors. Retell's own no-training statement is explicitly framed around enterprise customers with an MSA; do not generalize it to every PAYG account. Audit reports were not retrieved. [Compliance](https://docs.retellai.com/general/compliance)

Workspace access docs describe Admin (including billing/team/raw data), Developer (build/test/raw data without billing/team), and Member (read-only/scrubbed). The page's introduction additionally names Analyst/Viewer, so role availability is inconsistent and needs UI verification. API keys support permission groups with No Access/Read/Edit; by default they have full supported endpoint access. Enterprise pricing separately lists RBAC and SSO, leaving precise self-service entitlements uncertain. [Roles](https://docs.retellai.com/accounts/access-control), [API scopes](https://docs.retellai.com/accounts/manage-api-keys)

The Solution Partner Program targets agencies, developers, and technology providers, offering referrals, directory visibility, co-marketing, support, and early access. Public partner listings use tiers, but qualification thresholds and commercial commitments were not verified. [Partner program](https://www.retellai.com/partners-program)

Affiliates earn a published 15% of referred revenue for 12 months, with a 90-day cookie and monthly payouts; active solution delivery is a separate relationship. We have not verified payout exclusions or a signed agreement. [Affiliate program](https://www.retellai.com/affiliate)

## 8. Important ambiguities and limitations

1. Browser tests are called free in quick start but explicitly metered in testing-pricing docs; trial credits may explain some language, but unlimited free testing is not established.
2. Headline voice range is not a universal maximum; premium model/voice selections and add-ons can exceed it.
3. Pricing says full access while Enterprise lists security/support entitlements; exact access by account needs checking.
4. Access-control role names are inconsistent within the official page.
5. No universal AI-provider BYOK registry was verified. Custom LLM and BYO SIP do not establish one.
6. Custom LLM loses several built-in testing/transfer capabilities.
7. Simulated tests can call production endpoints, particularly MCP.
8. Published versions do not guarantee that external knowledge or business tools are immutable; exact snapshot behavior was not established.
9. We have no independent benchmark for latency, multilingual quality, load behavior, or failure recovery.
10. No internal architecture, encryption-key design, database tenancy, tool-approval model, or transactional outbox implementation can be inferred from the dashboard/docs.

## 9. Prioritized implications for VocollAI

These recommendations are our analysis, not Retell claims.

| Priority | Work for our platform | Reason |
| --- | --- | --- |
| P0 | Enforce privacy/access/retention and close unsafe outbound URL paths | Baseline trust requirements cannot remain cosmetic |
| P0 | Protect authoritative eval results and implement executable suites | A production gate must evaluate real completed evidence |
| P1 | Durable call/workflow/webhook delivery and stale-session recovery | Customer outcomes and billing must survive failures |
| P1 | Concurrency/duration/budget enforcement and actual provider metering | Bound cost and noisy-neighbor impact |
| P1 | Atomic version promotion plus pinned knowledge scope | Preserve a reproducible release and rollback contract |
| P1 | First successful browser call before paid phone setup | Reduce onboarding friction and isolate audio/model issues |
| P1 | Per-call traces, costs, latency, explicit failure reasons, alerts | Make the service operable without reading server logs |
| P2 | Human transfer and useful native CRM/calendar templates | Add complete customer outcomes rather than more empty configuration |
| P2 | Actual PSTN traffic splits and richer write APIs/SDKs | Enable safe experimentation and developer adoption |
| Differentiate | Revision-pinned governed tools with isolated test modes | Potentially safer than production-reaching simulation defaults |

## 10. Authenticated acceptance matrix: updated status

1. **Onboarding/builder — UI inspected:** voice/chat and prompt/flow choices, template catalog, blank single-prompt editor, model/voice estimate, knowledge/functions and test entry points. A blank draft was created because no agents existed. Conversation-flow canvas and live audio remain untested.
2. **Release — partially inspectable:** Draft V0 history and environment/Publish controls observed. No published version existed; publication immutability, comparison and rollback execution remain untested.
3. **Testing — UI inspected:** separate Simulation Test Cases and Batch Testing History observed. No cases/results existed and no test ran; scoring and tool mocking remain documentation-backed.
4. **Runtime/privacy — UI inspected:** capacity, duration, storage, retention and role definitions observed. Enforcement, deletion and role isolation require controlled tests.
5. **Operations/billing — UI inspected:** credits, budgets, webhooks, alert form, analytics, QA, call history and live-monitoring inventory observed. Call history had zero sessions, so real traces, billed costs, QA accuracy, webhook retries and live takeover remain untested.

Passing this inspection establishes feature availability only. Runtime correctness requires controlled calls, failure injection, tenant-access tests, privacy checks, and reconciliation exercises. Those were not performed in this research.
