# ADR-RT-001: Realtime media and telephony substrate

**Status:** Accepted (provisional) · 2026-10-01

## Decision
Use **LiveKit** as the first realtime media and telephony layer (WebRTC, SIP inbound/outbound, dispatch, agent worker load balancing).

## aviroh owns
Session orchestration, the provider abstraction, tool execution, knowledge retrieval, policies/guardrails, deployment semantics (immutable versions → checksummed runtime bundles → environments), observability, and metering.

## Supported execution modes
- **Native realtime:** OpenAI Realtime, Gemini Live, and future providers.
- **Composable:** STT → LLM → TTS with any registered providers.

## Constraints
- LiveKit concepts (rooms, participants, dispatch) never appear in aviroh's public domain model. They are confined to `src/lib/runtime/livekit.server.ts` and `runtime/src/engines.ts`.
- Provider credentials are resolved per session by the control plane and never stored in bundles.

## Re-evaluate
Pipecat as an alternate pipeline runtime or adapter, where it gives materially better provider flexibility.
