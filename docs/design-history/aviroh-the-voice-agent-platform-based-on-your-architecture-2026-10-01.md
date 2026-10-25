# aviroh: the voice agent platform (based on your architecture)

Your diagram is a full enterprise blueprint: consoles, a control plane, a live voice runtime, background workers, telemetry, an operator plane and regional cells. It's well thought out. This plan splits it into what we can build here, and in what order, and flags the parts that need outside services.

## What can and can't live in this app
```text
BUILD HERE (Lovable app + Lovable Cloud)          NEEDS OUTSIDE INFRASTRUCTURE
- Organization & Workspace consoles               - Media/telephony gateway (PSTN, SIP)
- Control plane: agents, versions, deployments,   - Always-on conversation orchestrator
  providers/BYOK, tools, knowledge, policies,       for phone calls (turn detection,
  evals, workflows                                  barge-in at telephony scale)
- Deployment compiler -> immutable bundles        - Multi-region runtime cells
- Knowledge ingestion + vector retrieval
- Conversation records, usage & cost ledgers
- Web voice channel (browser / widget) using
  realtime speech-to-speech models
- Operator console (your team)
```
The live-call "data plane" for phone lines needs long-running servers that hold audio streams open, for example Twilio or Telnyx in front of a voice orchestrator such as LiveKit Agents or Pipecat, hosted separately. Our app becomes the brain it reads from: it serves the compiled bundle, runs knowledge search and tools, and receives events. That keeps your architecture intact. Only the box labelled "Realtime Voice Data Plane (telephony)" runs elsewhere.

## Things to reconsider or add
1. **Name:** the diagram says "Stealth Voice" and the app says "aviroh". I'll keep aviroh unless you tell me otherwise.
2. **Start web-first.** Browser and widget voice works without telephony infrastructure, so you can prove the product before paying for phone infrastructure.
3. **Evaluations are your moat.** Simulated callers plus judge rubrics that run before every release (they gate the canary) matter more than extra channels.
4. **Cost ledger from day one.** Record every model, speech and phone usage event with provider cost and customer price. Margin is hard to reconstruct later.
5. **Consent and recording laws** differ by region. Make them a policy setting per workspace, not code.
6. **Latency budget.** Retrieval during a live call must return in under about 300ms. Keep knowledge search in the same region as the voice session.
7. **SSO/SCIM, multi-region and the full operator plane** are enterprise features. Plan the data model for them now, but build them later.

## Console structure (Apple card design, modular tabs)
- **Workspace console:** Build (Agents, Knowledge, Tools, Integrations), Deploy (Environments, Deployments, Channels), Operate (Conversations, Traces, Evaluations, Analytics)
- **Organization console:** Workspaces, Members & roles, Provider accounts (BYOK), Billing & usage, Audit log, Policies
- **Operator console** (aviroh team only): tenants, usage/cost/margin, provider health

## Phases
**Phase 1: Foundation and the build loop (now)**
- Sign up/sign in. Organization, then workspace, then environments (dev/prod). Roles in a separate table.
- Agent registry: agent cards, editable draft, publish to an immutable version
- Providers: managed models (default) plus BYOK keys stored encrypted; model and voice picker per agent
- Knowledge: knowledge bases, then sources (file upload or URL), then documents. Ingestion parses, chunks, embeds and indexes into a vector index, with a search test box.
- Web voice channel: "Test call" in the browser using a realtime speech-to-speech model, with live knowledge retrieval as a tool
- Conversation records with transcripts. Usage events written to a ledger.
- Audit events for key actions

**Phase 2: Deploy and operate**
- Deployment compiler producing immutable bundles. Environments, promotion, rollback.
- Tool registry (HTTP/OpenAPI webhooks, with timeouts and retries) and guardrail policies
- Embeddable website widget, plus a public runtime API for external orchestrators
- Traces per turn (model, retrieval and tool timings) and an analytics dashboard

**Phase 3: Scale**
- Telephony through an external orchestrator plus Twilio/Telnyx, and human handoff
- Evaluation platform (datasets, simulations, judges, regression gates)
- Workflows/campaigns (outbound, scheduled), plans, quotas, billing, operator console

## Technical details
- Lovable Cloud schema (all with GRANTs and RLS by org/workspace membership): organizations, org_members, user_roles + `has_role`, workspaces, environments, agents, agent_versions (immutable JSON config + checksum), provider_accounts (AES-GCM ciphertext, server-only access), knowledge_bases, knowledge_sources, knowledge_documents, knowledge_chunks (pgvector column + HNSW index, `match_chunks(kb_ids, embedding, k)` RPC), conversations, conversation_turns, usage_events, audit_events. Phase 2 adds deployments, tools, tool_versions, policies, traces.
- Private storage bucket `knowledge/{workspace_id}/...`
- Ingestion server function: Worker-safe PDF/DOCX/HTML text extraction, ~800-token chunks with overlap, `google/gemini-embedding-2` embeddings, status lifecycle with error capture
- Voice: a server function mints a short-lived realtime session (`openai/gpt-live-1` via Lovable AI) from the agent version's config. The browser connects over WebRTC. The `search_knowledge` tool calls a server function. Transcript turns and usage are posted back.
- Text LLM default `openai/gpt-6-astra`. BYOK provider calls are server-side only.
- Routes: public `/` landing page and `/auth`. Under `_authenticated/`: `/dashboard`, `/agents`, `/agents/$agentId`, `/knowledge`, `/knowledge/$kbId`, `/conversations`, `/conversations/$id`, `/providers`, `/settings`. Current sales mock pages and data are removed.
- AGENTS.md: control plane in the app, telephony data plane external, bundles immutable. Memory: platform direction and phases.
