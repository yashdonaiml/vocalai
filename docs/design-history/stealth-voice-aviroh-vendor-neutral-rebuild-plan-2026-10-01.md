# Stealth Voice (aviroh): Vendor-Neutral Rebuild Plan

## Goal
Make the product follow the Stealth Voice architecture instead of the Lovable-specific shortcuts used so far. aviroh owns the control plane, the conversation runtime abstractions, providers, tools, knowledge, policies, deployments, observability and metering. LiveKit is the media and telephony layer. AI providers plug in behind adapters.

## What stays fixed (platform limits, stated plainly)
- The web console runs on this framework and edge hosting. That is where the **control plane** lives.
- The database is standard Postgres + pgvector (portable, so it can be self-hosted later). It is accessed through one repository layer, so moving it later means changing one module.
- Realtime media, SIP and agent workers **cannot** run here. They run as a separate **Runtime Service** (Node/Python LiveKit Agents) in a new `runtime/` folder that you deploy on your own infrastructure (Fly, AWS, GCP, k8s).

## ADR-RT-001 (recorded in docs/adr/)
- Use LiveKit as the first realtime media and telephony layer (WebRTC, SIP inbound and outbound, dispatch).
- aviroh owns session orchestration, the provider abstraction, tool execution, knowledge, policies, deployment rules, observability and metering.
- Support two execution modes: Native Realtime (OpenAI Realtime, Gemini Live, future providers) and Composable (STT, then LLM, then TTS).
- LiveKit concepts never appear in aviroh's public domain model.
- Pipecat may be added later as an optional pipeline adapter.

## Architecture
```text
Console (control plane, this app)
  Agents · Knowledge · Deployments · Providers · Tools · Policies · Conversations · Usage
        │  compile
        ▼
Deployment Runtime Bundle (immutable, checksummed JSON)
        │  fetched by
        ▼
Runtime Service (runtime/, self-hosted LiveKit Agents worker)
  Stealth Conversation Runtime
   ├─ NativeRealtimeEngine  → OpenAI Realtime | Gemini Live
   ├─ ComposableEngine      → STT (Deepgram…) → LLM (OpenAI/Anthropic/Google) → TTS (ElevenLabs/Cartesia…)
   └─ Tool / RAG runtime    → calls control-plane Tool + Retrieval APIs
        │
LiveKit (Cloud or self-hosted) → WebRTC browser · SIP/PSTN in/out
        │ events
        ▼
Control-plane ingest API → conversations, turns, traces, usage/cost ledger
```

## Phases

### Phase A: Provider abstraction (remove Lovable AI dependency)
- `providers/` registry with typed adapters: `LLMProvider`, `EmbeddingProvider`, `STTProvider`, `TTSProvider`, `RealtimeProvider`.
- Adapters: OpenAI, Anthropic, Google (Gemini), Deepgram, ElevenLabs, Cartesia.
- Keys are resolved per workspace: first the BYOK key (encrypted, already built), then platform keys from secrets (`OPENAI_API_KEY`, etc.). The Lovable AI gateway is removed.
- Embeddings go through `EmbeddingProvider` (default OpenAI text-embedding-3-large, 3072-dim, same column). The model is stored on each knowledge base so it can be re-embedded later.

### Phase B: Deployments and runtime bundle
- Tables: `deployments` (agent_version × environment, status, canary %), `runtime_bundles` (compiled JSON, checksum).
- A compiler turns agent version + providers + tools + policies + KB refs into a bundle.
- Console "Deployments" tab: promote draft to version, then to environment, with rollback.

### Phase C: LiveKit integration
- Secrets: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.
- Server function mints LiveKit access tokens and dispatches the agent for the deployment. The browser test call uses the `livekit-client` SDK. The current `/api/live` relay is removed.
- Telephony: per-workspace phone numbers map to LiveKit SIP inbound trunks and dispatch rules, plus outbound call creation. Twilio/Telnyx trunk credentials stored as BYOK.

### Phase D: Runtime Service (`runtime/`, separate deployable)
- Node LiveKit Agents worker: fetches the bundle via a signed control-plane API, picks the engine by `runtime.mode`, registers tools, and streams events back.
- Signed `/api/public/runtime/*` endpoints: bundle fetch, knowledge retrieval, tool proxy, event and usage ingest (HMAC with `RUNTIME_SHARED_SECRET`).
- Includes Dockerfile and a README for deployment.

### Phase E: Tools, policies, evals
- Tool registry (HTTP webhook tools with JSON schema, auth, timeouts), guardrail policies, and eval suites (simulated caller + judge rubric) that gate canary promotion.

### Phase F: Auth independence
- Google sign-in moves to your own Google OAuth client (you supply client ID and secret in auth settings). Email/password stays.

## What you will need to provide
- AI provider keys you want as platform defaults (OpenAI, Anthropic, Google, Deepgram, ElevenLabs).
- A LiveKit project (Cloud or self-hosted): URL, API key, secret.
- A host for the Runtime Service, plus a Twilio/Telnyx SIP trunk for phone numbers.
- A Google OAuth client.

## Technical notes
- Agent config gains `runtime: { mode: "native" | "composable", realtime?, stt?, llm?, tts? }`, with migration of existing drafts.
- The domain model uses aviroh terms (Session, Deployment, Channel), never LiveKit rooms or participants.
- AGENTS.md rules for the live relay and Lovable gateway are replaced with ones for the provider registry and the runtime service.
- Build order: A, B, C (browser calls working end to end), D, then E and F.
