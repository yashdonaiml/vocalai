# Outpero customer activation research

Date: October 25, 2026, America/Chicago. Common task: a nontechnical service-business owner creates an inbound enquiry agent, saves an enquiry to a connected system, tests it, activates a number, verifies the result and recovers failure.

## Method and confidence

Used the new `cx-competitive-research` skill and read the upstream REA routing instructions. Actual tools were official-web documentation retrieval and ordinary read-only repository inspection. REA MCP was unavailable and the supplied shell's Node 22.19 is below current REA requirements; no REA engine/CLI execution, installation, registration or decompilation was performed. Private Outpero backend design remains unknown.

Current evidence below is **Documented** official behavior or **Source** evidence in our code. Earlier signed-in findings in `docs/competitor-outpero-audit-2026-10-24.md` are **Historical observed** evidence, not newly reproduced. No current authenticated dashboard inspection, OAuth grants, test calls, purchases, messages or production changes occurred. No elapsed time or click counts were measured. Only this research note was written.

## Comparable journey

| Step | Owner action/decision | Behavior/result | Evidence | Unresolved fact | Transferable pattern |
| --- | --- | --- | --- | --- | --- |
| Business brief | Explain the job, language, captured information and actions | Product describes a job-first sequence that hides speech/model assembly | Documented, retrieved Oct 25: [no-code guide](https://outpero.com/no-code-ai-voice-agent) | Actual beginner completion rate | Business questions generate defaults; do not ask the owner to build a voice stack |
| Working draft | Edit greeting, steps and FAQ | Earlier dashboard inspection found an employee-oriented editor and test controls | Historical observed, Oct 24: local audit section 3 | Current UI and generated instruction quality were not rechecked | Keep one business brief as the initial editing surface |
| Connect business system | For lead intake, choose source/tool and map fields; for Calendar, authorize account and choose booking settings | Intake uses guided HTTP recipes; Calendar has a direct connection flow | Documented: [intake](https://outpero.com/ai-voice-agents/features/lead-intake-api-and-integrations), [Calendar](https://outpero.com/ai-voice-agents/features/google-calendar-booking) | Account authorization/refresh operation not exercised | Differentiate a native connection from an automation recipe visibly |
| Test integration | Send a sample intake payload or create/check a test Calendar event | Intake testing can avoid dialing; Calendar guide asks owner to verify the actual event | Documented, same two feature guides | Test cleanup and adverse-case behavior | Show receiver acknowledgement and business receipt separately |
| Activate inbound | Obtain local business number and attach employee | Inbound page documents number/KYC then employee assignment | Documented: [inbound](https://outpero.com/product/inbound) | Advertised KYC time and availability were not tested | Present provisioning as a managed progress state, not carrier setup |
| See outcome | Inspect call result and optional external delivery | Post-call webhook can carry outcome/summary/captured fields; earlier UI had outcome capture | Documented: [post-call webhooks](https://outpero.com/ai-voice-agents/features/post-call-webhooks); historical Oct 24 audit | Downstream CRM write correctness | One outcome card should link the conversation and destination record |
| Recover | Adjust script/training; inspect failed API or booking response | Features document constrained failure behavior rather than automatic universal recovery | Documented: Calendar, custom API and webhook guides | Retry/reconnect UX not observed | Explain the exact failed stage and keep safe retry/recovery scoped |

Outpero's publicly described job-first flow is an activation advantage. Its promise is same-day usability, not evidence of a measured minutes-to-complete integration benchmark. Its seven-language/two-voice-tier packaging is simpler than asking an owner to select separate speech vendors; quality parity across languages was not tested. [No-code guide](https://outpero.com/no-code-ai-voice-agent).

## Three strongest advantages

1. **Business vocabulary and curated defaults.** The owner explains the work and chooses language rather than selecting providers. We should adopt that decision model, with a capability-checked internal preset.
2. **Useful bounded native actions.** Calendar setup exposes meeting duration and business rules through a named action. The documented scope is one Google account per employee, IST only, create-only booking, with business-hour/conflict rejection. There is no free-slot browsing, cancellation or rescheduling. A test event is verified in the destination. We can outperform this with calendar discovery, explicit timezone selection, availability-first booking and a receipt, but only after implementing these correctly. [Calendar contract](https://outpero.com/ai-voice-agents/features/google-calendar-booking).
3. **A connected operational story.** An employee, number, enquiry, captured fields and call result are presented as parts of a business operation. This is an experience advantage even when an integration still needs an automation provider. It does not prove a superior private runtime.

## Friction and openings

- Lead-source breadth should not be mistaken for native integration breadth. The intake documentation explicitly calls these setup guides, not native connectors. Owners still copy a URL/secret and add an HTTP step elsewhere. Its documented phone-key schema, sample test and accepted/deduplicated/rejected activity are useful patterns; a direct app connection and resource picker would remove more work. The documented instant-lead service requires a purchased number, Indian mobiles and credits. [Lead intake](https://outpero.com/ai-voice-agents/features/lead-intake-api-and-integrations).
- Calendar's narrow scope provides a concrete opening for a better scheduling product, but adding rescheduling/cancellation before our initial write path works would widen failure modes.
- Post-call webhooks document one attempt, a five-second timeout and no retries. Our existing leased outbox with per-endpoint acknowledgement is a useful foundation for better delivery visibility. We must expose pending/delivered/failed states and safe replay while maintaining minimal/private data boundaries, rather than simply exporting more personal data. [Webhook delivery contract](https://outpero.com/ai-voice-agents/features/post-call-webhooks).
- Custom API actions still require URL/header/body configuration; the documented ten-second, single-attempt response is raw text for the model. Retain custom APIs as advanced options and use typed provider receipts in the normal owner flow. [Custom API actions](https://outpero.com/ai-voice-agents/features/custom-api-actions).
- Training lets owners review distilled facts from text, images or voice notes. The important pattern to borrow first is owner review/correction of business facts, not building every upload modality. [Knowledge training](https://outpero.com/ai-voice-agents/features/knowledge-base-training).
- Inbound telephony is packaged around India. Our current managed-number source is US-local inbound. Multilingual conversation does not supply equivalent number availability; choose a market explicitly before comparing activation promises. [Inbound positioning](https://outpero.com/product/inbound).

## Current source: what blocks us from delivering the same task

| Area | Current evidence | Customer consequence |
| --- | --- | --- |
| Native default versus write confirmation | `src/lib/agent-config.ts:104-106` defaults to native; `runtime/src/agent.ts:85-95` rejects confirmation-required execution outside specific composable/language combinations | A console test can pass while the default live voice configuration cannot save the lead |
| Integration setup | `src/routes/_authenticated/tools.tsx:364,434,492,550` states direct sign-in is unavailable, requests a path, authorizes tests separately, then attaches to draft | Better presentation of an HTTP contract still requires technical work and cross-page completion |
| Capture fields | `src/lib/integration-tasks.ts:25-35,63` requires every lead field, including email | A caller who only provides a phone number cannot complete this lead contract without inventing data or changing the schema |
| Onboarding end state | `src/routes/onboarding.tsx:108-207` finishes at an unpublished draft with optional website/webhook | The first customer journey does not reach a verified business action or activated number |
| Existing receptionist prototype | `src/lib/receptionist.server.ts:3-50`; repository search found no application caller of `configureReceptionist` | The saved callback foundation is not a generic owner-facing pack installer; it contains hardcoded VocollAI wording and direct human-approval insertion |
| Honest native receipt | `src/lib/callbacks.server.ts:21` returns `saved:true`, request ID and `notification_sent:false` | Preserve this truthfulness; add delivery proof rather than claiming a saved request notified anyone |
| Delivery foundation | `src/lib/events.server.ts:19-68` claims leases, records endpoint deliveries and skips prior acknowledged endpoints | Expose this infrastructure through business states; verify recovery in staging before marketing reliability |
| Region/billing | `docs/managed-inbound-onboarding.md` specifies US local inbound and accounting without payment collection | India outbound parity or unlimited paid self-service cannot be claimed from current implementation |

## Work packages for the unified plan

These are inputs to the coordinator's single critical path, not a separate competing roadmap.

**OUT-CX-01 — P0: one compatible enquiry pack.** Owner: runtime + product engineering. Depends on the capability matrix, platform-managed credentials and chosen initial language/region. Reuse `agent-config.ts`, bundle compiler, `runtime/agent.ts`, gateway and callback persistence. Create a versioned pack with business identity, optional email, required callback contact/reason and explicit write confirmation. Schema defaults must be strict and provider-specific; optional email must be genuinely optional, not filled with dummy content. Do not expose the receptionist prototype unchanged: move approval behind the existing permission-checked server boundary. Acceptance: a real supported voice call, denied confirmation saving nothing, confirmed action saving one record and returning one receipt, and incompatible engine settings blocked before activation. Non-goal: broad languages or booking lifecycle.

**OUT-CX-02 — P0: one resumable owner journey.** Owner: frontend + activation backend. Depends on OUT-CX-01. Combine current onboarding, guided integrations and managed inbound UI under the assistant: brief → facts → destination → test → activation → outcome. Persist setup stage and resource IDs server-side, idempotent per workspace/assistant; refresh/retry must not duplicate actions/numbers. Keep explicit authorization and prices in review while hiding provider/environment mechanics. Acceptance: a first-time owner completes without endpoint/schema entry on the supported native destination; interrupt each stage and resume accurately. Gate: instrumented staging activation before pilot rollout. Non-goal: a general AI dashboard copilot.

**OUT-CX-03 — P0 for the advertised connected-system outcome: one native destination.** Owner: integrations backend + frontend. Depends on scoped OAuth/app registration and chosen pilot destination. The existing `tools.functions.ts` catalog/gateway remain authoritative; add encrypted refreshable credentials, account/resource discovery and fixed typed operations with business-safe receipts. Prefer lead capture to one real CRM/sheet before Calendar if the pilot is enquiry-led. Acceptance: connect without token copying, confirm one test record in the correct destination, refresh an expired access token, recover revoked access via reconnect, and never duplicate an uncertain write. Non-goal: a long logo catalog or arbitrary custom field scripting.

**OUT-CX-04 — P1 after first verified capture: receipts and delivery recovery.** Owner: operations/backend + frontend. Reuse `callbacks.server.ts`, `events.server.ts`, action history and conversation detail. Model record creation separately from notification/destination synchronization. Preserve stable invocation/event IDs as dedupe references; staff should see what needs attention without interpreting raw JSON. Acceptance: receiver fails then recovers; only failed delivery repeats, saved enquiry stays single, and owner sees the receipt plus notification state. Gate: prove scheduler/reconciliation after browser exit. Do not equate network acknowledgement with downstream completion unless the adapter supplies a verified record ID.

## Smallest defensible advantage

One business task with a compatible preset, a native account/resource picker, a real test receipt, guided activation and clear recovery is a stronger customer proposition than more generic integration cards. Outpero's constraints suggest places to improve, but not a reason to advertise unbuilt scheduling or regional telephony support.

The first executable slice is OUT-CX-01 plus the shortest OUT-CX-02 path using our callback inbox. The first external-system promise additionally requires OUT-CX-03. Measure active setup time, abandonment, permission/field errors, first verified receipt, duplicates and unresolved writes; do not claim a completion-time advantage until novice-owner trials establish one.

## Skill forward-test feedback

The custom skill's evidence taxonomy and fallback guidance were sufficient for this assignment: it prevented treating current public documentation as current dashboard observation and avoided claiming REA execution. No concrete ambiguity requiring a skill change emerged. The source/market comparison made region and action compatibility first-order acceptance constraints rather than a feature-count comparison.
