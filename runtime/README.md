# aviroh Runtime Service

For the first Telnyx inbound call, follow [the setup guide](../docs/first-inbound-telnyx-call.md). Environment templates are in the repository root and `runtime/.env.example`.

The Stealth Conversation Runtime. A LiveKit Agents worker that runs aviroh **runtime bundles**. It is deployed separately from the console, because media and SIP can't run on the edge.

```text
LiveKit dispatch (agentName "aviroh-runtime")
  → POST /api/public/runtime/session   bundle + provider credentials
  → engine: native realtime | composable STT→LLM→TTS
  → tools: search_knowledge → /retrieve, registry tools → /tool
  → transcripts/usage → /events, "end" on shutdown
```

All control-plane calls are HMAC-signed: `x-aviroh-signature = hex(HMAC_SHA256(RUNTIME_SHARED_SECRET, ts + "." + nonce + "." + body))`.
The worker sends `x-aviroh-timestamp` and a fresh `x-aviroh-nonce` on every request. The console rejects timestamps outside 60 seconds and retains nonces for five minutes to reject replays.

## Governed tools

The worker exposes only the tools in the session's pinned bundle. `/tool` resolves the saved revision binding and executes through the Tool Gateway, which owns credential resolution, policy checks, egress, retries, redaction and audit records. The worker never fetches a business tool URL directly.

For English composable sessions, confirmation-required calls stop at a frozen pending action. The worker uses TTS to read the gateway's exact summary, then sends the first final caller transcription to `/confirm`. The gateway runs the frozen arguments directly after checking the binding and current policy again. Unclear speech gets one reprompt. Interrupted, expired or declined confirmations do not execute. `/cancel` invalidates pending actions on shutdown without cancelling already-sent writes.

Native realtime sessions and other languages currently block confirmation-required actions; they need a verified exact-summary playback and language confirmation path before enabling writes. Read tools continue through the gateway in either engine.

## Upgrade

Apply `supabase/migrations/20261017120000_gateway_runtime_bindings.sql` before deploying the updated console and worker together: the signing protocol changes on all runtime routes. Republish and deploy agents to generate revision-pinned v2 bundles. Existing v1 bundles resolve through their legacy tool ID's migration provenance to immutable revision 1, and only when the stored input schemas match. Missing or changed migration bindings fail closed. Start new web test sessions after upgrading.

Workflows now use pinned versions and gateway calls. Enable a workflow to publish its current graph; saving an enabled workflow publishes a new version. Manual tests snapshot their graph without changing the live version. Tool steps send only their explicit input mappings; confirmation-required workflow tools remain blocked. Re-select migrated legacy tools in the editor if an older graph still contains legacy identifiers.

Run `npm test` in the console repository for mocked database/network regression tests, and `npm run build` here to typecheck the worker. LiveKit call testing and database/RLS verification still require a configured deployment.

## Env
| Var | Purpose |
| --- | --- |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Same LiveKit project as the console |
| `AVIROH_CONTROL_PLANE_URL` | Console origin, e.g. `https://aviroh.example.com` |
| `RUNTIME_SHARED_SECRET` | Must equal the console's secret |

Provider keys are **not** set here. They come per session from the control plane (workspace BYOK first, then platform keys).

## Run
```bash
npm ci
npm run build
npm run download-files
npm run dev          # local, connects to LiveKit
docker build -t aviroh-runtime .
docker run --env-file .env.local aviroh-runtime
```
Scale horizontally. LiveKit load-balances jobs across workers.

## Telephony
The console's Telephony page creates or recovers an inbound trunk and dispatch rule per number. It requires a carrier signaling allowlist and encrypted media. For Telnyx, use an FQDN connection to the LiveKit SIP hostname over TLS port 5061 with SRTP and +E.164 numbers.

The worker waits for a telephone participant before opening the session. It records the SIP caller number when available and closes on caller disconnect. Transcript batches retain stable IDs across retries; the database commits each batch atomically and records the call end once. The Telephony page distinguishes route configuration from a call being received. Neither state replaces a real audio test.
