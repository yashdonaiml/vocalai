# Unified implementation plan: customer experience is P0

Owner decision, October 25, 2026: customer experience takes priority. This is the current implementation plan for the first supported business-owner journey. Earlier audits remain evidence/history; they are not competing roadmaps. Research and planning do not deploy application changes.

**Execution status, October 26, 2026:** CX-01 and the inbox-preview slice of CX-02 are implemented and locally validated. The CX-03 Google Sheets source slice is implemented in the same setup journey with encrypted OAuth, named resource selection, reviewed mappings, Tool Gateway execution and exact receipts. Real OAuth, real spreadsheet writes, remote migrations and hosted voice validation remain staging gates; CX-04–06 are not complete.

## Product contract

A nontechnical service-business owner can describe the job, choose a supported destination, talk to a working agent, see a real saved enquiry, and activate it on an eligible number without learning models, endpoints, schemas, environments or deployment percentages.

The first product is an **inbound enquiry assistant**. It answers from reviewed business facts and captures a caller-confirmed name, phone, reason and optional preferred time. Email is optional unless the selected destination requires it. A saved enquiry is not a booked appointment, notification, promised callback or completed sale.

Initial external destination: **Google Sheets**, with a document picker, sheet picker and automatic column mapping. This is a product sequencing choice, not evidence that all customers use Sheets. The built-in callback inbox remains a fallback. A customer using that fallback has not completed an external integration. CRM/calendar adapters follow the first pilot's demonstrated demand; arbitrary existing systems remain advanced/custom work.

Initial phone scope follows the current managed implementation: US local inbound numbers. English is the baseline supported voice/action combination. Telugu-English is offered only after the same end-to-end acceptance run. Other countries, outbound campaigns and additional languages must not inherit an unverified minutes-to-live promise.

## Customer journey

| Screen | What the owner does | What the platform does | Completion evidence |
| --- | --- | --- | --- |
| 1. Your business | Gives business name/site and describes the job | Creates default workspace/environment, imports a bounded fact preview, proposes greeting and collection rules | Owner confirms facts; missing hours/prices remain unknown |
| 2. Where enquiries go | Connects Google, chooses a spreadsheet/tab or chooses the inbox | Authorizes the actual account, lists permitted resources, generates mapping and versioned gateway actions | Connection and destination are accessible; no copied IDs/paths |
| 3. Try your assistant | Talks to it and reviews one sample enquiry | Uses a compatible managed preset and real gateway; identifies test records and presents exact write confirmation | Voice was heard; enquiry receipt exists in selected destination |
| 4. Turn on your assistant | Reviews price/actions, chooses an eligible number, authorizes launch | Saves snapshot, publishes, runs applicable checks, promotes atomically and resumes number provisioning | Agent/version/destination/number match; failed stages have a clear next action |
| 5. Your enquiries | Sees real outcomes and items needing attention | Links calls to receipts and connection health; separates save, synchronization and notification status | A record ID/link or honest failure/unknown result, not just HTTP 2xx |

The browser test precedes paid number allocation. First phone-call verification remains an explicit follow-up because web audio cannot prove telephone routing. External account approval, carrier activation and payment delays are shown separately from active setup time.

The main customer navigation becomes **Assistant, Enquiries, Connections, Billing**. Settings retains team/privacy controls. Advanced reveals the existing detailed console; existing URLs remain usable. Avoid building a second independent UI/configuration model.

## What we will do better

**Benchmark selection rule:** study exceptional customer-experience patterns, not random relevant competitors. New candidates must show a specific reduction in owner effort, a coherent brief/test/approve/result loop, or unusually clear recovery. Vendor scale, marketing polish and integration counts do not establish exceptional usability. Current focused candidates are **Goodcall GC4** and **Lindy's packaged assistant**; both still need authenticated same-task testing before an exceptional-quality verdict. Prior Vapi/Retell/Outpero research remains technical/product context rather than a reason to expand the shortlist.

- [Goodcall GC4](research/cx-goodcall-gc4-2026-10-25.md): investigate business-language changes with reviewed publication/rollback, audible practice cases and a continuous build/test/learn loop. The actual public entry was observed at Step 1 of 5, business lookup; the marketing demonstration is not proof of a one-step functional setup.
- [Lindy](research/cx-lindy-2026-10-25.md): investigate delegating a finished job, bounded receptionist booking and owner report-back. Its protected product was login-gated; actual execution was not tested. Do not copy its broad action-enablement model or infer that current packaged-assistant setup requires an older flow editor.

These candidates refine the interaction quality below, without changing the critical path or adding a broad competitor survey.

The product should own completion across steps. Connecting Google is incomplete until the selected destination is valid; an action is incomplete until it produces a receipt; activation is incomplete until the right version answers the number. Make that status visible and recoverable rather than leaving the owner to reconcile several screens.

The completed research wave identifies specific openings, rather than an assumption that competitors already have universal one-click setup:

| Evidence-backed opening | Our implementation decision | Boundary of the comparison |
| --- | --- | --- |
| Vapi's [Sheets guide](https://docs.vapi.ai/tools/google-sheets) documents OAuth followed by copied spreadsheet ID/range, tool creation and attachment | Named destination picker, generated mappings/binding and one reviewed activation | A documented manual path does not prove no assisted alternative exists anywhere in its current UI |
| Retell's [HubSpot setup](https://docs.retellai.com/integrations/hubspot) requires a private app token and notes that a basic connection check can pass without every operation's scope | Verify permission for the selected task and destination, not just a green connected label | This is provider-specific; other Retell integrations use OAuth |
| Retell's [CRM overview](https://docs.retellai.com/integrations/crm-overview) separates mappings, sync and logging; new-contact creation is an explicit choice | Ask whether new enquiries may create records, then test and show the actual receipt | Do not copy a full bidirectional CRM sync engine into the initial pack |
| Outpero's [post-call webhook contract](https://outpero.com/ai-voice-agents/features/post-call-webhooks) specifies a single five-second delivery attempt without retries | Expose our existing leased outbox and acknowledged delivery history as understandable recovery states | Better existing infrastructure is not a measured delivery-reliability advantage until staging validates it |
| Outpero's [lead integration guide](https://outpero.com/ai-voice-agents/features/lead-intake-api-and-integrations) distinguishes setup recipes from native connectors | A small list of working native destinations, with custom automation clearly labeled Advanced | Integration logos do not establish native operation support |
| Outpero's [Calendar contract](https://outpero.com/ai-voice-agents/features/google-calendar-booking) documents bounded booking functionality | Later calendar work must include timezone/resource discovery, availability and verified receipts if advertised | Calendar breadth is deferred; it does not enter the first enquiry pack |

Detailed evidence and implementation inputs: [Retell](research/cx-retell-2026-10-25.md), [Vapi](research/cx-vapi-2026-10-25.md), [Outpero](research/cx-outpero-2026-10-25.md). These source-grounded opportunities are not claims that we already outperform any competitor in measured customer outcomes.

Reuse each competitor's strongest pattern without claiming their private implementation: job-first language, managed presets, reusable provider accounts, immediate testing and contextual progress. Our differentiator is the smaller amount of work and uncertainty between those steps, measured with real owners.

## Ordered work packages

### CX-01 — P0: truthful, compatible capabilities

**Owner:** runtime + platform engineer. **Dependencies:** none. **Outcome:** anything setup offers can actually execute on the selected engine/language.

- Add a small shared capability resolver in `src/lib/runtime/capabilities.ts`, consumed by setup, publish readiness and bundle compilation. It describes supported engine/language/action/confirmation combinations; it is not a new plugin framework.
- Change the first pack's managed default to a validated composable preset. Keep provider access through the registry and platform keys; BYOK/model choice becomes advanced. Do not claim an exact model is universally best without measured pilot evidence.
- Resolve the current default-native/write mismatch in `agent-config.ts`, `runtime/src/agent.ts` and `tools/readiness.server.ts`. A console HTTP test must not stand in for voice confirmation support.
- Wire duration/silence settings through `runtime/bundle.server.ts` and `runtime/src/control-plane.ts` into the worker. Disable transfer, voicemail, after-hours and recording controls unless their actual runtime capability exists. Templates must not imply a transfer tool exists.
- Recheck the actor's current membership and mode-specific permission immediately before pending console writes execute (`tools.functions.ts:decideAction`, gateway execution). Validate the prior security candidate with dummy principals; do not call it a reproduced finding before validation.

**Acceptance:** one English voice test collects enquiry details, reads them back exactly, denies/corrects/confirms appropriately and writes once. A caller may decline a preferred time and still save the enquiry: align the gateway schema and callback parser on a documented absent/default value, without inventing a preference. Unsupported combinations are blocked before deployment. Saved duration/silence controls affect the pinned runtime. Revoked users cannot resume a pending write. No disabled feature appears as effective.

### CX-02 — P0: one resumable setup and one configuration

**Owner:** product/frontend + platform engineer. **Depends on:** CX-01 capability contract. **Outcome:** an owner always knows what is done, what is next and whether anything is live.

- Keep `src/routes/onboarding.tsx` as workspace bootstrap and deep-link into a protected assistant-specific setup route. Its current guard redirects workspaces with an agent to Overview, so merely extending the existing session-storage wizard would break resumption after draft creation. Reuse `agent-draft.functions.ts`, current draft saving and studio views; put the test alongside the brief.
- Persist setup progress server-side with agent/workspace scope. Minimal `agent_setup_runs` data: run ID, workspace, agent, pack version, current step, completed evidence references and last safe error. Put credentials in the existing encrypted credential path, not setup JSON/session storage.
- Store business facts and collection choices in the one effective agent configuration. AI proposes changes as a reviewable draft; deterministic code validates supported actions and capabilities. A prompt may not create permissions, purchase a number or declare readiness.
- Keep **brief → proposed change → hear a practice call → approve → inspect real outcomes → improve** together on the assistant page. An owner should be able to request a change in ordinary language, see the bounded old/new business rule and test it before publishing. Reuse draft generation and snapshot checks; this is not a prerequisite to build a general-purpose copilot.
- Create default tenant/environment context automatically. Advanced options stay available, but the first-run path never asks users to choose a deployment environment or model provider.
- Reduce the default shell without deleting advanced resources. Existing onboarding notification hooks remain usable in advanced setup; do not request a webhook signing implementation from a first-time owner.

**Acceptance:** a first-time owner completes business setup without API knowledge. Refresh/logout/re-entry resumes the exact saved step. Partial failures do not duplicate agents, knowledge sources or connections. Switching workspace cannot reuse another workspace's progress. Unknown facts are reviewable and never invented.

### CX-03 — P0: one real native connection, not more templates

**Owner:** integrations engineer. **Depends on:** workspace/auth contracts; can run in parallel with CX-02 after CX-01 decisions. **Outcome:** enquiries arrive in the owner's actual selected spreadsheet.

- Extend `tool_connectors`/encrypted credentials to represent a reusable Google account and its refresh/revocation state. Add only the provider metadata needed for this adapter; do not create a second integration gateway or general OAuth platform.
- Implement server routes/functions for authorization state, account linking, granted-resource discovery, refresh and disconnect. Bind authorization to the authenticated workspace/admin and validate the callback; never accept a browser-supplied account ID as proof of ownership.
- Offer a permitted-document picker and tab picker. Use the narrowest suitable provider scopes and consent/file-selection mechanism; verify the current provider contract before implementing. If application verification limits external users, label the pilot restriction and resolve it before public signup.
- Check the exact pack operation's permissions on the selected resource. Account sign-in or a successful read check is insufficient evidence of append/create rights; never mark the task ready solely because the token is valid.
- Add a typed Sheets operation through the existing gateway adapter dispatch. Generate safe column mappings from the enquiry pack. Show a preview; do not ask for spreadsheet IDs, ranges, schemas or URLs.
- Enforce current permissions at execution. Token refresh should not duplicate an external write. An expired/revoked grant moves the connection to reconnect-needed; it never falls back to another workspace's credential.
- Route any extraction/reuse of `receptionist.server.ts` through permission-checked governance functions. That hardcoded prototype must not become an automatic human-approval shortcut.

**Acceptance:** the owner connects a permitted account and selects a real destination without developer setup. Refresh, revocation, inaccessible documents, renamed tabs and missing columns produce actionable states. An enquiry is saved with a provider receipt and visible test marker. A revoked account cannot continue receiving writes.

### CX-04 — P0: verifiable outcomes and safe recovery

**Owner:** gateway/integrations + frontend engineer. **Depends on:** CX-03 for external receipt, usable inbox fallback earlier. **Outcome:** owners can tell what happened without reading JSON.

- Extend existing invocation results with a typed, bounded receipt: outcome kind, external record/reference, safe provider link, completion state and evidence timestamp. Validate it in the provider adapter. A 2xx acknowledgement alone is not a completed business result.
- Reuse `tool_invocations`, conversation links and the callback view to build the first Enquiries read model. Add structured metadata only where needed. Do not build a CRM, event analytics warehouse or second customer database for the first release.
- For uncertain writes, show **Needs checking**. Use a stable request marker and provider-supported deduplication/lookup where actually available; otherwise stop and reconcile rather than blindly appending a duplicate row. There is no blanket exactly-once promise across external APIs.
- Keep business-owner confirmation of live enablement explicit, but fold generated tool/binding details into one business-readable review. Preserve callers' confirmation for writes. Exact-version real-test evidence remains meaningful; editing configuration invalidates the corresponding readiness evidence.
- Let the conversational test satisfy guided live approval. The current `requireIntegrationTest()` accepts only `console_test` invocations, which would otherwise force the owner back through another technical screen. Extend the evidence contract to accept a completed authorized voice-test session with a successful gateway receipt and compatible runtime. Derive this evidence server-side from the signed runtime/session and invocation records, never a browser-supplied passed flag. Bind it to the workspace, action revision, selected destination/account and normalized tested draft/runtime snapshot; publishing the matching snapshot preserves its provenance, while relevant edits invalidate it. Retain an explicit owner live-approval step and keep mock evidence ineligible.
- Establish test-only voice authorization first. Current web tests and live calls both use `voice_session`; approving unrestricted live voice just to enable the first test would defeat the sequence. Persist the authorized session purpose/actor/revision on the server, distinguish test execution in gateway policy, reject test-only grants during production publication, and keep test sessions out of production workflows and success notifications. Never trust a browser/worker-supplied purpose flag without the persisted session boundary.
- Display **Saved**, **Sync pending/failed**, **Notification pending/delivered/failed** separately where implemented. Do not imply an inbox save notified staff.

**Acceptance:** successful, refused, expired, failed and unknown attempts have clear language and the correct state. Repeated clicks/reconnect/retries never intentionally repeat an unconfirmed write. Call details link to the same receipt. Privacy/redaction/retention rules apply to the read model and stored references.

### CX-05 — P0 release gate: one activation button over existing services

**Owner:** platform/telephony engineer. **Depends on:** CX-01–04 for the integrated journey; payment path for public paid signup. **Outcome:** the owner can activate the tested version without learning release infrastructure.

- Introduce an assistant-scoped activation command/status API. Reuse current draft save, `publishAgentVersion`, eval RPCs, `deployVersion` atomic promotion and managed telephony quote/order/reconciliation functions.
- Persist the immutable version, bundle checksum, destination binding, test evidence, accepted price and order references for each attempt. Reject stale setup revisions. Current database promotion remains transactional; external carrier operations remain resumable stages with their existing leases and reconciliation. Do not pretend the whole distributed launch is one database transaction.
- Run appropriate checks automatically and show **Ready**, **Needs your attention** or **Waiting for provider**, with an exact corrective action. Native/composable text-eval restrictions must not become a mysterious launch error. Never synthesize passing results or bypass a configured gating suite.
- Confirm prices before paid provisioning. Open paid signup requires working checkout/payment event processing, account eligibility and spend limits; the current assessment ledger does not collect money. A deliberately invoiced closed pilot is separate from open paid self-service.
- Offer the managed number path only when platform worker/carrier/cron readiness is established. Keep all secret/runtime configuration internal. After setup, guide the owner through a real PSTN call and save its verification against the deployed version.

**Acceptance:** double-click, refresh, network timeout and worker restart resume the same activation attempt/order. Failed promotion leaves the previous working deployment. No number is purchased without accepted charges/eligibility. Changing the deployment/destination invalidates the relevant verification. Existing calls remain pinned to their original bundle.

### CX-06 — P0 validation: prove that ordinary owners can finish

**Owner:** product + QA + operations. **Depends on:** complete supported journey. **Outcome:** the minutes-to-live statement has evidence.

- Add setup events and timing without business descriptions, contact data, transcripts or credentials. Measure both active setup and external waiting. Reuse current event/metrics infrastructure; do not build a separate analytics platform.
- Test at least ten first-time nontechnical owners on the supported pack. Watch where they stop or need an explanation; measure task completion, not whether they like the dashboard.
- Provide a small pack-specific practice set: an ordinary enquiry, missing contact detail, correction/refusal, and unavailable destination. Generate scenarios as proposals, keep expected outcomes explicit and let owners hear supported voice tests. Obtain authorization before external test writes. Never relabel the current text-only regression as an audio or integration test.
- Targets, not current claims: median first browser conversation under five minutes; median first externally saved test enquiry under ten minutes; median eligible integrated inbound activation under fifteen minutes. At least eight of ten complete the supported path unaided. Record distributions and failures, not only the median.
- Mandatory correctness evidence: all pilot success claims have a saved receipt; repeat-submit/retry scenarios do not create duplicate enquiries; blocked actions never claim success; cross-workspace cases fail closed. Small pilot results do not establish production-wide error rates.
- Include the currently omitted workflow-graph suite in the intentional test manifest, and maintain explicit layered validation: unit contracts, database boundaries, gateway/provider fixtures, browser journey, real voice and carrier staging. Passing local tests alone is not usability or launch proof.

**Release gate:** controlled pilot before open paid signup. No public minutes-to-live promise until the measured supported flow meets its targets and external-prerequisite caveats are visible.

## Critical path and sequencing

`CX-01 → CX-02 + CX-03 → CX-04 → CX-05 → CX-06`

CX-02 and CX-03 can proceed in parallel once the capability and identity contracts are agreed. Start the payment/telephony readiness work alongside them if public paid signup is required; it is a dependency, not a reason to expand the product scope.

The first executable slice is CX-01 plus a thin CX-02 browser journey: a fresh owner enters their business brief, talks to the compatible agent, confirms a callback and sees the real inbox receipt on the same screen. Clearly label this **inbox-only preview** until CX-03 connects the external destination. Keep phone acquisition off this slice. This tests the customer path without prematurely purchasing numbers or claiming complete integration.

## Sub-agent execution plan

This is an implementation assignment plan, not a claim that implementation has started. Two planning sub-agents independently reviewed current runtime and journey code; the coordinator defined integration/activation handoffs. Execution uses two delegated workers plus the coordinator, rotating the runtime worker into native integrations once the first gate passes. More simultaneous agents would create shared-file collisions rather than accelerate the first outcome.

### Stage 0: coordinator freezes the handoff contracts

Before parallel code edits, refresh source, preserve existing user changes and record a baseline test/build result. There is currently no Git history in this workspace; use a recoverable local source snapshot or an available managed checkout before significant edits. Do not reset files to an older research state.

The coordinator owns the shared setup/result types, session-purpose and approval policy, migration sequence and integration checklist. Freeze a small contract with consumers before implementation:

- `beginEnquirySetup(workspaceId, requestKey, business)` returns setup/agent IDs and revision; retries reuse the same intent.
- `saveEnquirySetup(setupId, expectedRevision, businessDraft)` validates membership, saves the canonical agent draft and returns its normalized snapshot hash. Credentials/contact records never enter setup JSON.
- `getEnquirySetup(workspaceId, agentId)` returns current revision, capabilities/readiness, last session/evidence references and one safe next action.
- `startEnquiryPreview(setupId, expectedRevision, requestKey)` explicitly authorizes a scoped test and returns session connection data plus the frozen tested snapshot identity.
- `getEnquiryPreviewResult(setupId, sessionId)` returns connecting/active/saving/saved/not-saved/unknown/failed, a persisted session-specific receipt when present and a safe corrective action. It never chooses the latest workspace callback or accepts a client-supplied success flag.

Minimal persistence is one workspace/agent/pack-scoped setup record with revision/hash, requested UI step, session/evidence references, safe error and timestamps. The navigation step is not proof of completed work. Define the separate test-only authorization boundary before enabling real preview writes. The separate worker consumes a versioned wire contract; it does not import console files outside its build root.

### Stage 1: parallel first working preview

| Owner | Exclusive edit areas | Deliverable |
| --- | --- | --- |
| **Agent A: runtime and enquiry pack** | New capability resolver and pack schema; `agent-config.ts` starter preset only; `runtime/bundle.server.ts`; `tools/readiness.server.ts`; callback parser; `runtime/src/agent.ts`, control-plane contract and lifecycle helpers; focused new tests | Supported English pack, optional preferred time, exact confirmation, effective duration/silence controls and one honest inbox save |
| **Agent B: customer journey** | New `src/routes/_authenticated/assistant-setup.$agentId.tsx`, setup/receipt components, `src/components/agent-runtime.tsx`; minimal onboarding handoff and continue-setup links | Business brief, review, authorized voice preview, persisted result and resume in one surface |
| **Coordinator: platform boundary and integration** | Setup server/functions and persistence migration; `tools.functions.ts`, gateway/bindings/session dispatch, `platform.functions.ts`; generated route/type outputs; test manifest | Real APIs, test-only authorization, current permission recheck, scoped receipts, stale-evidence rejection and combined integration |

Agents may propose changes to another owner's file, but only that owner applies them. In particular, neither agent independently edits the large shared tools/gateway/platform server files. Agent A preserves current native/Telugu configurations; it selects a compatible default only for the new pack. Agent B does not rebuild the shell, generic tools page or existing studio in this stage.

The current `TestCall` receives a session ID but does not expose it for result lookup. Agent B adds session-start/disconnect callbacks and a saving-result state; the coordinator provides the exact persisted receipt endpoint. Studio saving still touches legacy tool associations, so the new pack must use current gateway bindings rather than copy that save path.

**Gate 1:** a fresh owner can enter a brief, hear the English agent, decline/correct/confirm an enquiry and see the matching inbox receipt. Refusal/hangup/expiry saves nothing; repeated confirmation saves once. Missing preferred time works. Dirty edits and changed destinations invalidate prior evidence. Cross-workspace, removed-member and test-grant-in-production cases fail closed. Refresh/re-entry resumes correctly. Provider/worker/microphone failures show one actionable state. No mocks fabricate receipt success. No live approval, paid number or external-integration claim is granted by this milestone.

### Stage 2: rotate into one native destination

- **Agent A becomes the integration worker:** implement Google authorization/refresh/revoke, scoped resource discovery, the typed Sheets adapter and provider receipt/uncertain-write reconciliation. Own new provider-specific modules and focused tests; the coordinator retains shared gateway/schema edits.
- **Agent B:** add connection/destination selection and column preview to the same setup page, reconnect states and readable business receipts. No copied spreadsheet IDs, API paths or JSON in the supported path.
- **Coordinator:** wire authorization, evidence and destination identity to the setup revision, review migrations/privacy and independently test handoffs. Read current Google contracts before implementation; do not assume API idempotency or app-verification eligibility.

**Gate 2:** an actual authorized test enquiry appears in the selected external destination with a verifiable reference. Operation-specific rights are checked, refresh/revocation recover clearly, foreign account/resource references are rejected, and uncertain appends are not blindly repeated. Inbox fallback remains clearly labeled. Google client configuration, callback URLs, consent verification and a disposable test destination are external prerequisites; local adapter/DB/UI fixture work can proceed without inventing successful live authorization.

### Stage 3: activation and customer pilot

- **Agent A:** staging/runtime/provider failure scenarios, exact-version voice evidence, reconnect and duplicate-write verification. Finish any native-runner requirement for the advertised preset; do not bypass configured eval suites.
- **Agent B:** activation status, pricing review, eligible number selection, post-activation phone test, owner receipt and clear recovery on the same assistant journey.
- **Coordinator:** orchestrate existing publish/atomic promotion/telephony services, durable activation state and payment eligibility. Reuse quote/order leases and scheduler reconciliation. Do not build another deployment or workflow engine.

**Gate 3:** an authorized real PSTN call reaches the intended deployed agent, saves the enquiry to the intended destination and records verification against that exact configuration. Repeated activation cannot buy a duplicate number; failure does not remove the previous working deployment. Platform/worker/carrier/scheduler setup must be operationally proven. Open paid signup additionally requires payment collection and spend protection; a controlled invoiced pilot is a different release scope.

Then run CX-06 novice-owner trials. Only measured results can support the minutes-to-live or superior-CX claims. Calendar breadth, more languages and more integrations wait until the first supported path meets its gates.

### Validation and coordination rules

The coordinator reviews each agent's code and focused test evidence before integration. Independent modules can be developed concurrently; dependent edits, shared migrations, builds and repair work are coordinated sequentially. After integration run the complete relevant regression suite, main typecheck, production console build and separate runtime build. Then perform browser, real voice and provider/carrier staging checks appropriate to the milestone. A source-level test is not proof of audible playback, OAuth operation or real telephony.

Every checkpoint reports **implemented / locally verified / staging verified / blocked**, with the exact missing prerequisite. Do not repeatedly broaden research or mark a later milestone done because an earlier one passed. Application changes remain local until an authorized rollout.

## Deliberate deferrals

- No hundreds-of-integrations catalog. After Sheets, choose one CRM or calendar from measured pilot demand.
- No new flow engine, second gateway, agent marketplace, campaign scheduler, full CRM or general-purpose copilot platform.
- No customer-facing model routing, BYOK, custom environments, traffic percentages or graph canvas during initial setup. Retain advanced access and internal vendor neutrality.
- No transfer/recording/voicemail claims until their real worker paths and acceptance tests exist.
- No inferred competitor backend guarantees. Research informs independent implementation, not code/assets copying.

## Research and tooling provenance

Created and validated `cx-competitive-research` in the user's Codex skills directory, adapted from REA's evidence-oriented investigation workflow. Installed upstream `reverse-engineer-anything` from [morluto/rea](https://github.com/morluto/rea). Skills will be available automatically on the next turn; the research agents read them explicitly during this task.

No REA MCP tools were connected in this session. The shell's Node 22.19.0 is below the inspected `rea-agents` 6.8.0 runtime requirement. No REA analysis engine/CLI was executed and no client configuration or Node installation was changed. The actual research methods were official web documents, current owned source, dated prior dashboard notes and one fresh read-only inspection of the existing Retell editor through browser tools. This limitation does not establish competitor backend internals or measured live performance.

Three agents completed the competitor evidence notes under `docs/research/`, and their source-grounded deltas are incorporated above. Their practical use of the custom skill identified two improvements now applied: explicit authentication/setup burden and preservation of engine/API-specific documentation conflicts. Both the upstream skill and custom skill pass the available skill validator. Validation confirms the skill structure; it does not validate a live competitor action or the proposed product's completion times.
