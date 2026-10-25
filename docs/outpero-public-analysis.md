# Outpero public architecture review

Reviewed 21 October 2026. This is public-source research, not an authenticated product trial or a backend audit. No aviroh application code was changed.

## Main finding

Outpero sells an integrated voice-agent application while using external infrastructure underneath. Its public frontend contains carrier-specific number purchase and identity-verification integrations. Its documentation describes its own branded voice engine, Swara, and a speech recognition → language model → speech synthesis pipeline. This is compatible with aviroh's platform model: owning the agent application does not require owning the telephone network or training speech models.

The evidence does **not** establish whether Outpero's telephone media engine uses LiveKit, Pipecat, another framework, or custom code. Absence of those names in browser assets cannot establish their absence from the backend.

## Coverage and limits

- Fetched all 846 URLs in the public sitemap, then followed same-origin page links to closure: **1,414 distinct public page URLs**, all returning HTTP 200. HTTP success alone does not establish that every page contains a unique product feature.
- Page families include 445 `/ai-voice-agents` pages, 439 `/questions` pages, 172 `/fastest-employee` pages, 117 `/blog` pages, 104 `/glossary` pages, 59 `/compare` pages, and 15 `/alternatives` pages. Much of this surface is marketing, geographic targeting, and educational material.
- Inspected 63 public JavaScript assets, including the app entry bundle, help-centre content, API documentation, number management, browser calling, billing, and legal disclosures. Publicly delivered client code shows integration contracts and available UI code, not proof that every code path is enabled in production.
- Read the rendered help centre, API introduction/download page, security disclosure, and unauthenticated app entry. The app requires sign-in.
- Downloaded the published OpenAPI specification and Postman collection. The specification describes **37 operations over 30 path templates**; these were inspected as documentation, not executed as customer actions.
- Read-only API checks: `/public/signup-status` returned 200; `/v1/me` returned 401 without an API key; `/config` returned 401 without a bearer token.
- No account creation, call initiation, payment, KYC submission, authenticated customer-data access, or administrative API execution occurred. Unknown/private endpoints cannot be exhaustively discovered from public materials.

See the accompanying CSV inventories for the fetched pages and documented/discovered route templates.

## Evidence and confidence

| Layer | Evidence | What it establishes |
| --- | --- | --- |
| Agent application | Help centre describes employee creation, scripts, training, publishing, inbound, instant leads and campaigns | Outpero presents an integrated application and agent lifecycle |
| Voice engine | Voice documentation names **Swara**; security disclosure describes independent STT, LLM and TTS providers | A branded engine orchestrates external voice/AI services; its internal framework is undisclosed |
| Telephony | Number-management asset contains `/numbers/vobiz/*`, `/numbers/voicelink/*`, and a `telephony_provider` configuration field | Frontend support exists for Vobiz and VoiceLink; the active provider and traffic split are unknown |
| Number provisioning | Inventory, quote, purchase, holder and KYC routes appear in the client | Carrier onboarding is integrated into their dashboard |
| Voice providers | Client code names Sarvam, Cartesia, Smallest, Inworld and Soniox in voice/billing/admin contexts | Those providers are represented in the client; exact STT/TTS assignment, active models and fallback order are unverified |
| Browser voice test | `WebCallModal` obtains a server-returned `ws_url`, uses `WebSocket`, sends audio frames and receives audio/transcript/clear messages | The visible browser test uses a custom WebSocket audio protocol |
| Audio formats | Browser capture is resampled to 16 kHz PCM16; default playback is 24 kHz PCM16, with server format negotiation | Browser test encoding behavior; this does not establish the PSTN transport |
| Identity and payments | Security disclosure explicitly names Supabase and Razorpay | External authentication and payment processing |
| Hosting | Security disclosure describes containers, private database/cache, and exposed dashboard/API/media-webhook paths | Their stated deployment model; not independently audited infrastructure |
| API | Published OpenAPI and API help centre | A customer API exposes calls, campaigns, leads, numbers, events and webhooks |

Public assets used as evidence:

- [Application entry bundle](https://app.outpero.com/assets/index-Dk1b9U-L.js)
- [Number management](https://docs.outpero.com/assets/Numbers-Cvu2HTqG.js)
- [Browser call implementation](https://docs.outpero.com/assets/WebCallModal-Dqd-qdby.js)
- [Help-centre implementation](https://docs.outpero.com/assets/Docs-DNDEW-Ep.js)
- [Security disclosure](https://app.outpero.com/security)

Asset filenames are deployment-specific and may change.

## Likely operating model

The supported interpretation is:

```text
Customer configures an employee in Outpero
    → Outpero stores script, knowledge, voice, actions and calling rules
    → Customer purchases a carrier-backed number inside Outpero
    → Carrier routes calls to the voice engine
    → Voice engine orchestrates speech recognition, reasoning and speech synthesis
    → Mid-call actions reach calendar, sheets, WhatsApp or external APIs
    → Call results feed transcripts, captured fields, reporting and webhooks
```

The carrier-to-engine transport and backend engine implementation remain unknown. Both named carrier products offer SIP and WebSocket capabilities, so the carrier names alone cannot resolve that question. [Vobiz](https://www.vobiz.ai/), [VoiceLink](https://voicelink.co.in/).

## What the customer experiences

The onboarding sequence in their docs is describe the job, review a generated draft, choose a voice, train/test, get a number, then go live. The number flow includes holder verification, purchase, activation polling, and assignment to an employee. Customers interact with Outpero rather than separately configuring carrier infrastructure.

Their three operating modes are inbound reception, immediate follow-up of incoming leads, and bulk campaigns. Documentation also covers caller memory, missed callers, opening hours, capacity, scheduled callbacks, do-not-call rules, and post-call deliveries. These are documented product behaviors; they were not validated with live calls.

Publishing is not uniformly immutable: their docs say script/flow/actions/webhooks need an explicit apply step, while voice, capture variables and training apply immediately. Aviroh's immutable version/bundle design is stricter and should be preserved.

## API surface

The public API base is `https://api.outpero.com/v1`, authenticated with customer bearer keys. Documented groups are:

- Account identity and balance.
- Employees and phone numbers: list/detail.
- Calls: create/list/detail/cancel.
- Campaigns: create/list/detail, add/list contacts, launch, pause, resume, cancel.
- Leads, inbound calls, events: list/detail.
- Do-not-call numbers: list/add/remove.
- Webhook endpoints: create/read/update/delete, delivery history, resend, signing-secret rotation, test.

The documented API mainly operates existing employees. Its published employee endpoints do not provide a general create-agent/configure-agent API.

API docs include dry-run validation, idempotency, rate limits, lifecycle states and timestamped HMAC webhook signatures. The older lead-intake integration uses `POST /lead-intake/{slug}` with an employee-specific secret. Marketing examples use `call.ended`, while the newer API reference exposes events such as `call.completed`; treat these as distinct surfaces until confirmed against the relevant contract.

[API reference](https://docs.outpero.com/#api), [OpenAPI](https://docs.outpero.com/developers/openapi.json), [Postman collection](https://docs.outpero.com/developers/outpero-v1.postman_collection.json).

## Pricing and latency

The current public pricing page lists Standard at ₹5/min, Premium at ₹6.8/min, custom volume rates from ₹3.5/min, and a business number with one channel at ₹649/month. Each extra channel is another ₹649/month. Prices exclude GST. These are retail prices, not evidence of underlying carrier/model costs or margins. [Pricing](https://outpero.com/pricing).

Some help-centre text and client fallback values still say ₹7/min for Premium or show a Value tier. That inconsistency means the marketing page, client defaults and server-returned billing rates should not be treated as interchangeable.

Their marketing material claims average conversational latency of 0.8–1.3 seconds. This was not measured in this review. Lead-to-first-ring claims under 30 seconds measure a different interval and cannot be used as an audio-latency comparison. [Fastest employee](https://outpero.com/fastest-employee), [AI telecalling](https://outpero.com/ai-telecalling).

No credible conclusion about whether their stack is cheaper or faster than ours can be drawn without live measurements and infrastructure costs.

## Implications for aviroh

1. **Keep the platform distinction clear.** Our console and worker own agent behavior; LiveKit and Telnyx supply media and telephone connectivity.
2. **Finish the first developer call on the current stack.** This review provides no evidence that replacing LiveKit would improve our outcome.
3. **Build managed onboarding after the call works.** Add carrier-backed inventory/purchase, provisioning status, number assignment and connection checks inside aviroh. Customers should generally not need LiveKit credentials or SIP dashboards for platform-managed numbers.
4. **Separate platform-managed telephony from BYOC.** Platform accounts can supply infrastructure for managed customers; BYOC remains an optional advanced path. Carrier account structure and customer isolation need deliberate design.
5. **Choose carriers by target market.** The discovered Indian-number/KYC flows are relevant if aviroh targets India. Evaluate supported number types, onboarding, routing and commercial terms before assuming a US development number covers that market. This review does not establish legal or regulatory suitability.
6. **Prioritize operational product work.** Provisioning recovery, worker health, call limits, cost accounting, reporting and reliable webhooks make infrastructure feel like one platform. Campaigns/outbound calling and human transfer remain outside our current first-inbound-call implementation.

Our current local LiveKit setup is developer infrastructure setup. The first-call guide explicitly says we do not yet automate Telnyx account setup, number purchase, outbound calls or human transfer. That missing managed onboarding—not the mere use of infrastructure vendors—is the principal difference visible in this comparison.
