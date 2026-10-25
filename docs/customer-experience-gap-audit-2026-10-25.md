# Customer activation and competitive gap audit

October 25, 2026. Target: C:/Projects/Vocal AI. This is a read-only product/architecture audit, not a completed security assessment or live-call benchmark. Only this report was added.

## Assessment

The platform has useful infrastructure for safe versioned agents, but its primary customer path still resembles an engineering console. A nontechnical owner cannot reliably reach an integrated live agent in minutes using the current flow. More settings or generic integration templates will not solve that.

The recent unified Integrations work is a usable front end to HTTP contracts, not a native application integration product. It reduces schema entry but still requires someone to supply compatible endpoints. That distinction must remain explicit in product claims.

This audit inspected current onboarding, navigation, agent creation/studio, generated instructions, integrations, tool governance and execution, runtime bundles/worker, evals, deployments, knowledge ingestion, telephony documentation and migration/test inventory. It also refreshed official competitor documentation and consulted the earlier dated signed-in dashboard reports. No new competitor OAuth grants, purchases, calls, or paid tests were performed. Published competitor behavior is not proof of their proprietary backend or measured reliability. Existing local test success from the implementation turn does not establish activation speed or usability; no new target code was executed during this audit.

## Competitor advantages and documented implementation patterns

| Competitor | Relevant advantage | Documented pattern | Opportunity for us |
| --- | --- | --- | --- |
| Retell | Managed build/test/phone journey and reusable app accounts | Templates or prompt generation; draft browser testing; purchase/assign number. Integrations connect an account once and expose provider operations, CRM logging and knowledge sync. | Put the entire first outcome in one assistant setup flow, including connection, test evidence and launch. |
| Vapi | Runnable presets plus concrete native tools | Templates include model presets. Google Calendar connects via authorization, then exposes availability/event operations attached to an assistant. | Generate the correct tools and instructions automatically from the chosen business task, avoiding separate tool creation. |
| Outpero | Job-first packaging for Indian-language business calling | Describe the job, language/voice tier, captured fields, actions, lead source/list and test. Its public integration story also includes automation intermediaries. | Match the job-first language while making supported native actions and their receipts explicit. Do not imply every advertised integration is a direct native connection. |

Sources: [Retell quickstart](https://docs.retellai.com/get-started/quick-start), [Retell integrations](https://docs.retellai.com/integrations/overview), [Vapi quickstart](https://docs.vapi.ai/assistants/quickstart), [Vapi Google Calendar](https://docs.vapi.ai/tools/google-calendar), [Outpero no-code journey](https://outpero.com/no-code-ai-voice-agent). Retell also documents [Conductor](https://docs.retellai.com/conductor/overview), which proposes changes in context for review. This supports assisted setup, not an assumption that unconstrained AI should control publication or purchases.

The shared implementation lesson is opinionated defaults plus reusable authenticated provider adapters. We cannot infer their source code, transaction design, unit costs or operational reliability from these materials.

## Prioritized gaps

### P0: native default cannot complete confirmation-required business actions

Evidence: `src/lib/agent-config.ts:104` selects native realtime by default. `runtime/src/agent.ts:85-95` refuses confirmation execution unless the engine is composable and the prompt language is English or the specific Telugu-English style. Guided lead/ticket actions are writes and require confirmation.

Consequence: a customer can configure, test in the console and approve an action, yet their default voice agent cannot execute it during a call. A console test proves HTTP execution, not voice capability. Fail-closed behavior is appropriate; letting the UI offer an incompatible combination is the product defect.

Fix: introduce a capability resolver consumed by setup, agent readiness, bundle compilation and tests. Choose a managed, validated voice preset compatible with selected tasks/language. Explicitly block or explain unsupported combinations before approval/attachment. Independently implement exact readback confirmation for other engines/languages before enabling them. Keep the existing confirmation protection.

Acceptance: fresh accounts completing each supported pack pass a real voice call, exact confirmation, one provider-side result and a saved receipt. An incompatible engine/language is rejected before deployment.

### P0: saved call controls do not reach the worker

Evidence: `src/components/agent-studio-extras.tsx:15-36` offers duration, silence, transfer, voicemail and after-hours controls. `src/lib/runtime/bundle.server.ts:45-60` compiles prompt/runtime/knowledge/tools without `callBehavior`; `runtime/src/control-plane.ts` likewise has no corresponding bundle field. The worker has no source references implementing these persisted settings. Handoff text is not a telephone transfer implementation.

Fix: make a capability inventory. Wire and verify duration/silence limits first; implement hours/timezone and transfer only with real runtime/carrier support. Disable or remove unsupported controls immediately. Correct templates that suggest a human transfer exists.

Acceptance: changing a supported control changes observed worker behavior on the pinned deployment. Unimplemented controls cannot be saved as effective features.

### P0 for open paid signup: accounting is not payment enforcement

Evidence: `docs/managed-inbound-onboarding.md` explicitly states that number/usage ledgers do not collect payments, debit a prepaid wallet or issue invoices. Source searches found managed charge accrual, not an implemented checkout/payment enforcement path.

Fix: integrate payment collection, verified payment events, spending limits and insufficient-credit behavior before unrestricted paid number ordering. A controlled invoiced pilot remains a separate operating option. Platform provisioning/worker/cron readiness must also be verified in staging; local source cannot establish deployed configuration.

Acceptance: no unapproved paid allocation; repeated payment events do not duplicate credit/charges; running calls have a documented bounded-spend policy; reconciliation remains reliable after browser exit.

### P1: native app connections are missing

Evidence: `src/routes/_authenticated/tools.tsx:364` explicitly says direct app sign-in is unavailable; around line 434 customers enter an action endpoint. `src/lib/integration-tasks.ts` generates three fixed HTTP contracts. No provider OAuth/token-refresh integration layer was found in the reviewed source.

Fix: one native provider at a time, behind the existing gateway. Implement authorization/callback state, encrypted token storage, refresh/revoke handling, account/resource discovery, typed operation mapping and structured receipts. Let the owner select an actual calendar, CRM list or destination instead of entering IDs/paths. Preserve generic HTTP/MCP as advanced escape hatches.

Acceptance: supported setup requires no API URL, schema, token copying or external automation construction. The connected account survives access-token expiry and clearly requests reconnection on revocation.

### P1: setup ends at an unpublished draft

Evidence: `src/routes/onboarding.tsx:108-207` creates a draft, optionally indexes one URL and configures a webhook. The completion screen explicitly stops before deployment. `src/components/app-shell.tsx:79-115` exposes 18 navigation destinations; the studio has ten tabs at `agents.$id.tsx:187-196`. Integration setup adds an action to a draft, after which users must publish and deploy elsewhere.

Fix: one resumable assistant-scoped activation flow: business/job → knowledge review → connected destination → test → number/forwarding → launch. Default workspace/environment and platform-funded model settings internally. A server activation coordinator should invoke the existing version/eval/promotion/provisioning services with idempotent stages, not duplicate their rules or bypass gates.

Acceptance: after refresh, customers return to the exact unfinished step; retries do not duplicate agents, number orders or actions. There is one primary next action and a clear explanation of any external wait.

### P1: templates promise outcomes without assembling their dependencies

Evidence: `src/routes/_authenticated/agents.index.tsx:56-62` supplies instruction templates for appointments, order status and support. `create()` only saves configuration; it does not provision scheduling/order lookup operations or validate their availability. Lead/ticket templates also require every declared field, including email, regardless of business collection policy.

Fix: versioned business packs combining collection rules, instructions, supported actions, outcome schema and acceptance checks. Start with inbound enquiry/callback capture and lead qualification. Offer booking only when a real calendar adapter, availability and conflict handling exist. Make optional contact fields explicit while retaining strict provider argument validation.

Acceptance: no template says it can book, transfer, notify or look up a record unless its dependencies are connected and validated.

### P1: evals and default model capabilities disagree

Evidence: `src/lib/evals.server.ts:17-41` runs a one-turn composable text test without tools/retrieval; native agents require a runtime eval runner. Once gating suites apply, a default native version lacks this console execution path. No-gate workspaces are a different case; they are not necessarily blocked.

Fix: build internal starter checks compatible with the selected managed preset, then real audio/tool tests for voice-dependent guarantees. Present a simple readiness result with actionable failures. Keep current gating-suite enforcement; do not label text-only tests as voice/integration validation or create fake passing runs.

### P1: market scope and notifications must match the actual service

Evidence: `docs/managed-inbound-onboarding.md` limits managed numbers to US local inbound calling. `docs/self-serve-setup.md` documents minimal successful-action webhook events and explicitly excludes configured SMS/email delivery. A callback saved in the native inbox is not evidence a person was notified.

Fix: choose the initial supported country and call direction explicitly. A competitive Indian-business offering needs local telephony support and its operational requirements; a multilingual model alone does not supply that. For the first pack, offer one supported owner-notification destination with clear pending/delivered/failed status. Preserve minimal webhook payloads and privacy controls; use authenticated native operations for business records instead of broadly exporting transcripts/contact data.

Acceptance: customers only see supported number regions and actions; every saved request distinguishes record creation from owner notification and never promises a callback occurred.

### P1: website knowledge needs review and refresh

Evidence: `src/lib/platform.functions.ts:33-47` fetches one bounded HTML page and strips tags. This is not a site crawl, dynamic-page renderer or recurring knowledge sync.

Fix: bounded same-site discovery of useful pages, safe redirect validation per hop, extraction preview, owner confirmation of hours/services/prices and refresh/status visibility. Support explicit corrections without prompting customers to tune embeddings.

Acceptance: the owner sees what the agent learned and which pages failed; a homepage is not presented as the whole website; stale or missing business facts have a clear recovery action.

### P1/P2: migration leftovers and misleading release concepts

- `agents.index.tsx:80-85` still duplicates legacy `agent_tools` associations while active execution uses gateway `agent_tool_bindings`. Replace with a scoped server-side duplicate operation that copies current bindings with reapproval/readiness as appropriate. Do not claim tools copied merely because an insert was attempted.
- `deployments.tsx:63,89,156` truthfully labels staged canaries as not serving calls; `runtime/session.server.ts:86` resolves full deployments only. Hide traffic percentages from the default customer path. Retain staged releases internally, or implement actual deterministic routing before calling them traffic canaries.
- `package.json:7` enumerates test files but omits `tests/workflow-graph.test.cjs`; the standard test command therefore does not cover that dedicated suite. Add an intentional test manifest/discovery strategy.
- `roadmap.md` mixes completed source features with stale unchecked gateway phases. Reconcile it against source and staging evidence; distinguish implemented, locally tested and operationally verified.

## What is over-engineered and what should stay

| Simplify or defer | Keep behind the scenes |
| --- | --- |
| Exposing org/workspace/environment choices to a one-owner business | Tenant scoping and RLS; create sensible defaults |
| Requiring model/provider selection before the first useful call | Vendor-neutral registry and a supported managed preset |
| Separate tool creation, approval, attachment, publication and deployment screens | Gateway governance, immutable versions, atomic promotion and explicit authorization |
| Prompt editor, flow editor and workflow canvas competing during initial setup | One effective configuration; expose advanced representations later |
| Canary percentages without traffic routing; more generic integration cards | Release integrity, rollback, durable recovery and honest capability checks |
| A full Conductor-style copilot before the guided path works deterministically | A bounded assistant that drafts/reviews configuration and asks only for missing business facts |

The primary excess is customer-facing configuration and partially wired breadth. The gateway itself is not the reason users cannot connect Google Calendar. Do not rewrite working tenant isolation or remove confirmations to shorten the wizard.

## Recommended sequence

1. **Capability and truth pass:** fix default engine/write compatibility; disable unwired controls; correct outcome templates; validate the pending-confirmation authorization candidate below.
2. **One completed onboarding path:** resumable setup with managed defaults, instant browser test and consolidated readiness. Use platform keys internally; BYOK is advanced.
3. **One native destination:** prioritize the first pilot customers' actual application. For booking-led businesses, Calendar availability/create is the first deep adapter; for lead capture, a CRM or spreadsheet destination is the first. Choose one initially, rather than building both shallowly.
4. **Safe activation and billing:** orchestrate the existing publish/promotion/number services, collect payment when required, surface external activation waits and recover without repeated purchases.
5. **Business outcomes and pilot:** store outcome, provider record ID/link and synchronization state separately from technical HTTP success. Track unresolved requests, confirmed bookings/leads and failures needing attention. Expand only after nontechnical owners complete the path without assistance.

## Differentiation and acceptance targets

Position around a working business outcome: describe the job, connect the supported app and verify the result. Fewer supported apps with resource pickers and working recovery can be more useful than a large catalog of generic connectors. Multilingual quality can be an advantage only for engine/language/task combinations actually validated; the current Telugu work is a useful foundation, not evidence of parity across all languages.

Proposed targets, not current measurements: median first browser conversation under five minutes; first integrated inbound call under fifteen minutes when accounts, payment and number activation are already eligible; at least eight of ten first-time pilot owners complete the supported path without engineering help. Measure abandonment by step, input/permission errors, time to first verified provider receipt, duplicate writes, incorrect success claims and cost per completed outcome. Report active setup time separately from KYC, OAuth approval or carrier waits. Arbitrary legacy systems cannot honestly carry the same minutes-to-live promise.

## Focused security follow-up

The assigned security agent used the Cloudflare skill in guidance mode and reported one source-grounded **needs-validation** candidate: `decideAction` checks original actor identity but does not visibly recheck current workspace membership/testing permission before a pending console write is executed. Actor removal/role revocation during the pending window may leave a write executable. Recheck the current context/mode permission at the last trusted execution point and validate with dummy users in an isolated sandbox. No severity is assigned here; this is not a reproduced or independently verified security finding, and this product audit is not comprehensive security coverage.
