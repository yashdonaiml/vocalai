# VocollAI: competitor comparison, implementation roadmap and pricing

Decision date: 25 October 2026. This is a recommendation, not an implementation claim, launch authorization, validated market price or delivery commitment. It combines the current code audit with the signed-in Vapi, Retell and Outpero research. Competitor runtime enforcement and quality were not independently benchmarked. No application code or external pricing was changed.

## Recommended decision

Launch a managed inbound receptionist for a narrow service-business segment. The first product promise should be: answer routine questions, capture qualified enquiries, and deliver a confirmed callback request to a responsible person. Add booking only when real availability, confirmation and receipts work. Keep provider choice and release governance as advanced capabilities behind a simple customer journey.

Start with US English-speaking home/service businesses that need after-hours or overflow intake, using the implemented US managed-number path. Prioritize businesses with repeatable FAQs, ordinary contact details and clear callback ownership. Exclude emergency dispatch, payment collection and regulated decision-making from the first offer. Existing multilingual profiles are useful test assets, not proof of market-wide speech quality. An India-first business requires a separate +91 carrier/provisioning, commercial and language acceptance plan; dollar and rupee offers are not interchangeable.

Positioning hypothesis: **An AI receptionist that turns missed calls into confirmed follow-up, with controlled releases and a record of what actually happened.** Avoid unproven promises of human equivalence, autonomous booking, guaranteed conversion, compliance certification or measured superiority.

## Competitive comparison

| Dimension | Vapi | Retell AI | Outpero | VocollAI today |
|---|---|---|---|---|
| Primary offer | Configurable developer infrastructure | Integrated agent operations | Business calling app plus implementation agency | Broad console and separate runtime; business journey incomplete |
| Building | Providers/presets, assistants/Squads | Prompt/flow, Conductor, tools, lifecycle workflows | Job-first employees and industry presets | Prompt/visual flow, provider configuration, drafting, knowledge |
| Business outcomes | Customer integrations build outcomes | Native CRM/calendar/support cards and functions | Lead pipeline, callbacks, Calendar/WhatsApp/custom HTTP | Governed callback persistence; notification and booking unfinished |
| Telephony | Managed/imported/SIP, inbound/outbound | Managed/BYO, campaigns, transfer | India-focused numbers/channels and calling workflows | Managed US inbound implementation; real production call acceptance pending |
| Release/test | Versions/tool pins, evals/simulations | Versions/tags, simulation, lifecycle workflow | Simpler go-live/version history | Immutable version/bundle/environment design; eval and atomicity gaps |
| Operations | Logs/boards/monitors/costs | Capacity/reservation, QA, alerts, memory, live monitoring | Results/usage/wallet/campaign monitoring | Conversation/usage/audit surfaces; delivery, limits and metering incomplete |
| Security promise | Plan-dependent governance/compliance | Storage/retention/roles/security controls | Simpler visible controls | RLS/encrypted secrets/HMAC/gateway foundation; privacy and egress gaps |
| Best lesson | Configurable stack with tested presets | Operate the entire conversation lifecycle | Package one understandable business job | Finish reliable execution before growing the menu |

Sources: [full comparison](./competitor-comparison-2026-10-24.md), [Retell authenticated audit](./competitor-retell-dashboard-audit-2026-10-25.md), [Vapi report](./competitor-vapi-audit-2026-10-24.md), [Outpero report](./competitor-outpero-audit-2026-10-24.md).

Our immutable releases and revision-bound gateway are potential differentiators. They are not proven stronger than every competitor; their bypass and failure paths must be fixed and validated first.

## Milestone A: safe to run a controlled customer pilot

Every item below is a launch gate for the feature being offered. A restricted pilot can use manual invoicing, a single tested engine/language and operator-assisted setup, but cannot waive tenant/security/data correctness.

| Order | Required change | Implementation direction | Acceptance evidence |
|---|---|---|---|
| 1 | Close unsafe outbound requests | Shared guarded transport for customer URLs in ingestion, tools, workflows and webhooks; connection-level private-network protection, redirects/size/time bounds; remove legacy tool bypass | Loopback/private/cloud metadata, redirect and DNS-rebinding tests; no unaudited business-tool path |
| 2 | Enforce tenant and privacy boundaries | Validate service-role scoping; database/API/export transcript access; redaction before storage; real retention deletion; recording/notice supported or hidden | Cross-workspace and role-denial tests; seeded PII masking; expired data deletion; no false privacy switches |
| 3 | Make evaluations authoritative | Revoke browser result writes; admin-governed suite changes; executable runner bound to agent/version/suite revision; completed passing results; fail closed on query errors | A member cannot forge a pass; missing/failed/stale results block full production promotion; known case produces per-case evidence |
| 4 | Make releases atomic and knowledge consistent | Transactional environment promotion/locking and uniqueness; retrieve using session bundle references; index new knowledge revisions before activation | Failed/concurrent promotion retains exactly the correct live deployment; editing a draft/KB attachment cannot silently change a pinned session |
| 5 | Make delivery and call closure durable | Transactional event/workflow outbox; per-endpoint webhook jobs/retries/dead letters; durable worker spool or equivalent recovery; heartbeat/stale-session reconciliation | Crash after event commit still executes a workflow; acknowledgement loss produces no duplicate write/charge; receiver outage recovers visibly |
| 6 | Bound resource use | Workspace admission/concurrency reservations, max duration/idle timers, rate limits, budget reservations and kill switch; validated runtime capability matrix | Excess calls rejected/routed predictably; timers work during tools/audio; depleted budget prevents new billable admission; release reservations after crashes |
| 7 | Complete callback delivery | Native durable callback record or equivalent durable receipt; notification outbox; delivery state; owner/open/resolved status | Every confirmed callback is saved once; notification has its own confirmed status; failed delivery is visible; no invented 'sent' or booked claims |
| 8 | Capture true costs and perform live acceptance | Provider usage metrics, carrier/media reconciliation, per-call trace IDs, secure logs, health/alerts and scheduler; test funded number purchase/routing/release and restore | A real caller hears the correct version, submits a confirmed callback, staff receives it, records reconcile, disconnect completes accounting; restore/recovery drill passes |

Current code anchors: `src/lib/platform.functions.ts`, `src/lib/runtime/session.server.ts`, `src/lib/events.server.ts`, `src/lib/workflows.server.ts`, `src/lib/tools/egress.server.ts`, `src/lib/console.functions.ts`, `src/lib/callbacks.server.ts`, `runtime/src/agent.ts`, `runtime/src/session-events.ts`, and Supabase policies/migrations.

Public paid self-service adds payment collection, signed/idempotent payment-webhook processing, entitlement reconciliation, failed-payment handling and visible invoices/usage. The existing telephony charge ledger is not payment collection. For a few design partners, explicit manual invoices and operator-enforced caps are sufficient commercially after technical gates pass.

Proposed pilot acceptance targets, to agree before testing: zero cross-tenant disclosure or unauthorized writes; zero duplicated callbacks/charges in replay tests; no silently lost accepted callbacks under injected failures; at least 95% correct callback capture on a representative labelled call set; zero invented prices/bookings/notification receipts in the safety suite. Validate real audio, accents, interruption, silence, hangup, malformed tool arguments, denied confirmation, provider errors, receiver outage and worker restarts. These are release criteria, not achieved results or uptime promises.

## Milestone B: first repeatable paid product

Recruit 3–5 design partners in one segment and onboard manually. Ship:

1. Guided business profile: business facts, service area, hours/timezone, escalation rules, language, greeting and knowledge readiness.
2. One tested default voice/model preset plus a clearly priced upgrade. Keep raw provider controls advanced.
3. Browser rehearsal, real-call check and a readiness checklist. Block activation when required credentials, knowledge, deployment or callback delivery fail.
4. Callback inbox with staff email delivery, assignment, delivery receipt and resolution. In-product notification alone is insufficient for unattended businesses.
5. Call outcome fields: enquiry reason, qualified/unqualified, requested callback, unresolved, handoff needed; timestamps and traceable receipts.
6. Minimal useful dashboard: answered calls, missed/rejected calls, delivered enquiries, unresolved follow-ups, cost and failures. Define 'qualified' with the customer.

Measure onboarding completion, answer success, grounded answers, callback accuracy/delivery latency, staff resolution, p50/p95 conversational latency, cost per connected minute, support time and retention. Keep booked revenue claims out until attribution exists.

Exit when partners use it repeatedly, staff can act without reading raw logs, no critical trust failures remain, and unit economics have been reconciled. Do not substitute a target calendar date for these gates.

## Milestone C: close valuable outcome gaps

Priority order:

1. **One calendar provider:** real availability, timezone/DST, exact confirmation, idempotent booking, conflict handling, cancellation/rescheduling scope and receipt. Agent says booked only after provider success.
2. **Human transfer:** business-hour rules, no-answer/failed-transfer fallback, context handoff and callback preservation. Pull into Milestone B only if design partners require real-time human access; otherwise market callback intake accurately.
3. **One CRM:** choose the design partners' dominant system; contact match, idempotent create/update, ownership, outcome sync and delivery status. Avoid building eleven connectors first.
4. **Caller memory:** separate read/save controls, consent and retention, correction/deletion, contact matching. Do not couple memory permission to automatic outbound calling.
5. **Developer write API:** scoped permissions, idempotency, pagination, rate limits, documented lifecycle events, signed webhooks and examples/SDK. Current read-only endpoints do not constitute a full automation API.
6. **Language expansion:** one measured language/profile at a time with business vocabulary, confirmation and fallback tests.

## Milestone D: expansion after inbound retention

Add outbound callbacks/campaigns only after consent/DNC admission, calling windows/timezones, cancellation, retries, campaign capacity reservation and billing work centrally across API, UI and scheduler. Add actual PSTN canary routing, broader integrations, richer QA/alerts, agency multi-client administration, branded resale and enterprise SSO/residency as demand warrants. Prove support/SLA readiness before contracting availability guarantees.

Defer: large template marketplaces, many extra model vendors, multi-agent orchestration, voice cloning, live takeover, broad WhatsApp/SMS product, custom website agency work and compliance-labelled plans. These may be valid later; they do not fix the first customer's missed-call problem.

## Positioning and packaging

The buyer should see a receptionist and follow-up system. The technical evaluator should see provider neutrality, controlled version releases, confirmed tools and auditability. Sell both layers without forcing every small business to configure orchestration.

Suggested landing copy: **Answer after-hours calls. Capture the right details. Give your team a confirmed follow-up.** Supporting proof: real call example, saved request, delivered notification, responsible owner and resolved outcome. Promise booking/transfer only in plans where tested.

Use Telnyx for the first US pilot because that adapter/recovery path exists. Both Vapi and Retell support multiple carrier options; there is no universal architectural winner. Add Twilio based on customer coverage/number/quality needs after the first path is reliable. Compare total costs and measured calls rather than assuming Telnyx is always cheaper or faster.

## Proposed pricing experiments

These prices are hypotheses for the managed US inbound offer, not instructions to update the application or a public quote. Assume one tested standard runtime profile and domestic inbound usage. Reserve premium models, international routes, messaging, bespoke integrations and extra numbers for explicit quotes until costs are measured.

| Offer | Proposed price | Included scope | Overage |
|---|---|---|---|
| Design-partner pilot | $199/month | 500 connected minutes, one US number, two concurrent calls, operator-assisted configuration, callback delivery and weekly review | $0.25/min with customer-approved cap |
| Starter, after repeatable onboarding | $149/month | 500 minutes, one US number, two concurrent calls, one active receptionist, standard support | $0.25/min |
| Growth, after scale validation | $399/month | 2,000 minutes, one US number, five concurrent calls, up to three active agents, outcome reporting and supported integrations | $0.22/min |
| Enterprise | Custom minimum commitment | Contracted capacity, security/support terms and separately scoped integration work | Negotiated after cost/load validation |

Start by selling only the pilot. Publish Starter/Growth after measuring costs and operational support. Consider $299 fixed-scope onboarding for facts/knowledge/routing; waive deliberately for useful pilot feedback rather than hiding unlimited free consulting in the subscription. Bespoke CRM/calendar/workflow development needs a separate written scope and quote.

Standard minutes should include the disclosed AI, speech, media and domestic inbound carrier usage. Number rental is included as stated. Meter connected seconds with a plainly disclosed minimum/rounding rule; proposed rule is one-second increments with a 30-second minimum per connected call. No customer charge for failed platform setup; reconcile upstream charges separately. Included monthly allowance may reset; state rollover policy clearly. Usage caps must work before offering automatic overage/recharge.

Billing should use payment-provider subscriptions and metered usage with an internal immutable usage ledger, not make customers understand wallet credits unless a prepaid model proves preferable. A pilot can be invoiced manually. Keep basic encryption, tenant isolation, deletion and confirmation safeguards available in every plan; charge for capacity, service, advanced integrations and contracted governance/support.

Developer BYOK may be a later separate package with a clear platform fee plus provider/carrier invoices. Do not mix BYOK and all-inclusive receptionist arithmetic or promise a $0.05 all-in price based on Vapi's hosting-only fee.

### Unit-economics gate

Variable cost per connected minute = STT + LLM + TTS/native realtime + media/SIP + carrier + retrieval/analysis + delivery/storage + payment costs allocated to usage. Add monthly infrastructure, number rental and real support/onboarding costs when evaluating contribution margin. Measure long-context and failure cases, not only short demos.

Target at least **60% variable gross margin** on standard overage before support; this is a proposed internal target. At $0.22/min, variable cost must be at most $0.088/min. At $0.25/min, it must be at most $0.10/min. At illustrative cost $0.08/min, fully used Growth has $160 usage cost, leaving $239 before number, fixed infrastructure, support and payment costs. That is not net profit and does not validate the price. If cost or support exceeds the model, raise price, reduce included minutes, constrain the preset or charge for implementation; do not silently degrade quality.

Current competitive reference: Vapi publishes $0.05/min hosting plus other components, Retell headlines $0.07–$0.31/min with configuration-specific costs, Outpero advertises INR 5/6.80 talk-time tiers plus number/channel rental. These are different market/scope offers. Sources checked 25 October: [Vapi](https://vapi.ai/pricing), [Retell](https://www.retellai.com/pricing), [Outpero](https://outpero.com/pricing).

## Execution and ownership

Run security/release work and runtime/delivery work as coordinated streams, then integrate before pilot acceptance. Organize ownership by backend/database, runtime/telephony and product/customer operations, even if one person covers several roles. Each change needs a migration/rollback plan where relevant, scoped tests and its acceptance evidence. Estimate dates after sizing these tickets and confirming team capacity; no delivery date is implied by this roadmap.

The next implementation batch should be Milestone A orders 1–4, followed by durable delivery, resource limits, callback follow-through and a funded live acceptance call. Feature expansion follows successful pilot use, not competitor checkbox counts.
