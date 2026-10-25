# ENG-TOOLS-001: Unified Tools and Integrations (specification v2.1, for architecture approval)

Single authoritative specification. It supersedes earlier drafts and contains no override sections. On approval it is committed to `docs/specs/tool-gateway.md` with ADR-TOOLS-001, and the build follows section 21.

v2.1 adds the five changes required for architecture approval:
1. A confirmed action runs directly from the frozen pending action, so no token passes through the model (sections 7, 8 and 16).
2. One invocation can have many policy decisions (sections 4 and 15).
3. A provider tool schema compiler sits between canonical tool definitions and model-specific schemas (section 12.6).
4. Permissions are explicit (RBAC) rather than relying on owner/admin checks (section 14.8).
5. Migrated legacy approvals are marked separately from explicit human approvals (sections 15 and 20).

Final review edits are also included:
- 401 errors become `AUTH_INVALID` and 403 errors become `AUTH_FORBIDDEN` (sections 5, 7 and 17).
- Honest caller wording when the outcome is unknown (section 17).
- Adaptive health checks (section 10.6).
- Event payload minimization (section 11).
- Workflow reuse of confirmations is scoped to the intended workflow step (section 8).
- A smaller output budget for live voice (section 22).

---

## 1. Purpose
Businesses connect their own systems to aviroh agents and workflows, whether or not they have an MCP server. Every source becomes one governed **Tool**: a revision-pinned contract, an approval, a policy and an audit trail. A single **Tool Gateway** executes every call. Five steps stay separate, and none implies the next: discovery, approval, attachment, publication and permission to execute. Every execution re-checks current policy and credential state.

## 2. Requirements
**MVP (must work before live tool use on calls)**
- HTTPS web tools (GET, POST, PUT, PATCH, DELETE)
- Remote MCP over HTTP, version-aware (section 10)
- Automation webhooks (Zapier, Make, n8n) with setup guides
- Encrypted credentials, rotation, pause and revoke
- Server-side discovery, per-tool approval, drift handling
- Agent bindings snapshotted into immutable agent versions
- Text tests in mock, sandbox and live modes
- Voice runtime invocation with runtime-enforced confirmation
- Output selection and redaction
- Invocation, attempt and policy-decision records
- Workspace isolation and partner delegation
- Egress restrictions
- Workflow tool steps, marked as Preview until the workflow outbox and versioning ship (section 11)

**Growth**
- OpenAPI importer (data model reserved in MVP)
- OAuth for MCP servers
- Native integrations
- Per-user delegated authorization
- Context-aware tool selection
- Public REST management API
- Controlled outbound proxy (section 14.2)
- Private networking

**Non-goals (v1)**
- Local or stdio MCP
- Running user code or arbitrary scripts
- MCP resources, prompts, sampling, elicitation, roots, subscriptions, Tasks, Apps, or interactive multi-round-trip tool calls
- Payments over voice
- Automatic approval of any tool

## 3. Terminology
| Term | Meaning | Scope |
| --- | --- | --- |
| Organisation | Customer account and policy owner | org_id |
| Workspace | Operational namespace inside an organisation | workspace_id |
| Partner delegation | Time-bound, auditable authority for a partner org to act in a client org | partner_org_id, client_org_id |
| Connector | Configuration for one external system (`http`, `mcp`, `webhook`, later `openapi`, `native`) | workspace |
| Credential | Encrypted secret bound to one connector and one origin | org + connector |
| Tool definition | Stable identity of one remote operation | connector |
| Tool revision | Immutable description, schemas and adapter mapping, with two hashes | tool |
| Tool approval | Admin decision on one revision, including its risk class and policy | revision |
| Binding | Grant of one approved revision to an agent version or workflow version | agent/workflow version |
| Invocation | One logical tool execution | session or run |
| Attempt | One outbound network attempt within an invocation | invocation |
| Confirmation | One-use authorization for one exact action | session + turn |
| Policy decision | Recorded reason a call was allowed, paused for confirmation or blocked | invocation |

## 4. Domain model
```text
Organisation ─* Workspace ─* Connector ─1 Credential(versions) ─* CredentialEvent
                               │
                               ├─* DiscoveryRun
                               └─* ToolDefinition ─* ToolRevision ─* ToolApproval
                                                         │
             AgentVersion ─* AgentToolBinding ───────────┤
             WorkflowVersion ─* WorkflowToolBinding ─────┘
Invocation ─* Attempt     Invocation ─* PolicyDecision (one per evaluation stage)     Invocation ─0..1 PendingAction
Role ─* RolePermission     OrgMember/PartnerOperator ─* RoleAssignment(scope)
PartnerDelegation (partner org → client org)
```
All tables are listed in section 15.

## 5. Resource lifecycles
**Connector.** Two independent dimensions.
- `health`: `not_checked`, `checking`, `healthy`, `degraded`, `auth_invalid`, `auth_forbidden`, `schema_drift`, `unreachable` or `revoked`.
- `admin_enabled`: a boolean. Pause sets it to false. Resume requires a fresh health check when the last success is older than 15 minutes.
- Delete archives the connector. It is refused while an active deployment references its tools, and the dependents are listed. Emergency revoke is always allowed and keeps history.

**Tool definition.** `active` or `archived`. A definition is `unsupported` when the remote tool needs MCP capabilities outside section 10.2. Unsupported tools can't be approved.

**Tool revision.** Immutable from creation. A new discovery result with a different hash creates a new revision.

**Tool approval.** `pending`, `approved`, `rejected` or `revoked`. Only `approved` revisions can be bound. Revoking takes effect for every deployment immediately (section 6).

**Drift.** There are three classes.
| Class | Detected by | Effect |
| --- | --- | --- |
| Presentation drift | review hash changed, invocation hash unchanged (description, title, annotations) | notice, re-review requested within 14 days, production continues on the approved revision |
| Contract drift | invocation hash changed (schemas, binding, remote name) | writes blocked (`CONTRACT_DRIFT`), reads follow the workspace setting (default warn), and a new approved revision plus republish is needed |
| Availability drift | tool missing from the catalogue, or the server no longer supports it | execution fails (`TOOL_UNAVAILABLE`), the connector shows `degraded`, and agent readiness is affected |

**Credential.** Each rotation creates a new `secret_version`. The new version becomes active and the old one replaced in one transaction. Changing the connector's origin invalidates the credential, so a key never follows a URL to a new host.

**Authentication errors are split by meaning:**
- **401** (or an MCP auth error) means the credential is bad or expired: error `AUTH_INVALID`. Three consecutive cases set connector health to `auth_invalid`, which affects every tool on the connector and prompts a key rotation.
- **403** means the credential is valid but lacks permission for that operation: error `AUTH_FORBIDDEN`. It is recorded per tool. Five consecutive cases on one tool mark that tool as needing attention ("this key isn't allowed to do this"). Connector health becomes `auth_forbidden` only when every approved tool on the connector is failing this way. 403s never trigger credential rotation prompts.

**Confirmation.** `pending`, `confirmed`, `denied`, `expired`, `invalidated` or `consumed`. Detail is in section 8.

**Agent.** The draft binds the current approved revisions. Publish copies the bindings into the immutable `agent_versions` snapshot and the compiled bundle, with hashes.

**Workflow.** New: workflows gain draft and published versions (`workflow_versions`). Runs reference `workflow_version_id` and `trigger_event_id`.

## 6. Policy model
**Precedence, highest first:**
1. Platform emergency deny
2. Organisation security policy
3. Workspace policy
4. Connector state (admin_enabled, health, credential)
5. Approved revision and binding
6. Deployment or workflow-version scope
7. Caller and confirmation

The first deny wins.

**Risk classes**
- `read`: lookup. Can still be sensitive, and it is rate limited.
- `write`: creates or updates records.
- `sensitive`: regulated data or account access.
- `destructive`: cancels or deletes.
- `restricted`: payments or privileged actions. Disabled in v1.

MCP annotations and HTTP methods count as evidence, never authority. New tools default to unapproved and `restricted` until reviewed. Platform policy can raise a class but never lower it.

**Confirmation minimum by class**
- `read`: none.
- `write`: voice confirmation.
- `sensitive`: voice confirmation, and the organisation may require more.
- `destructive`: voice confirmation and a read-back of the key fields.
- `restricted`: not executable in v1.

A binding can raise the minimum. It can never lower it.

**Idempotency mode (per approved revision)**
- `none`
- `destination_supported`: the approver states the destination honors `Idempotency-Key`.
- `platform_dedup_only`: aviroh never sends a duplicate for one logical invocation.

Sending an `Idempotency-Key` does not make a remote operation idempotent. If a write connection drops after the request was sent, the result is `outcome_unknown` in every mode.

**Retry.** Automatic retry happens only when the revision is marked `safe_to_retry` (only allowed for `read`, or for `destination_supported` writes). There is at most one retry, with jitter. No outcome is ever retried after a timeout once sending has started.

## 7. Tool Gateway
**Location.** `src/lib/tools/gateway.server.ts`, a bounded server package. The adapters live in `src/lib/tools/adapters/`, and the shared validation in `src/lib/tools/schema.ts`.

**Entry point**
```ts
invokeTool(req: {
  invocationId: string;                    // generated by the gateway for console and workflow calls; the runtime supplies one per tool request
  toolRevisionId: string;                  // resolved from the binding on the server; the caller's value is cross-checked
  context:
    | { kind: "voice_session"; sessionId: string; turnId: string; deploymentId: string }
    | { kind: "text_test"; agentId: string; userId: string; mode: "mock" | "sandbox" | "live" }
    | { kind: "workflow"; workflowVersionId: string; runId: string; stepId: string }
    | { kind: "console_test"; userId: string; mode: "mock" | "sandbox" | "live" };
  arguments: unknown;                      // there is no confirmation input: confirmed actions run through executePendingAction (section 8)
  deadlineAt: string;                      // ISO time; the gateway uses min(deadline, policy timeout)
  signal: AbortSignal;
}): Promise<InvokeResult>
```

**Result**
```ts
type InvokeResult = {
  invocationId: string;
  status: "pending_confirmation" | "running" | "succeeded" | "failed" | "outcome_unknown" | "cancelled" | "expired" | "blocked";
  output?: unknown;                        // selected, redacted, capped by the context's output budget (section 22)
  forModel: string;                        // wrapped untrusted text (14.4)
  confirmation?: { id: string; summary: string; expiresAt: string };
  error?: { code: ErrorCode; category: string; retryable: boolean; safeMessage: string; requestId: string; traceId: string };
  durationMs: number;
};
type ErrorCode = "EGRESS_DENIED" | "AUTH_INVALID" | "AUTH_FORBIDDEN" | "PROTOCOL_UNSUPPORTED" | "CONTRACT_DRIFT" | "TOOL_UNAVAILABLE"
  | "CONNECTOR_REVOKED" | "CONNECTOR_PAUSED" | "CONFIRM_REQUIRED" | "CONFIRM_INVALID" | "TIMEOUT" | "OUTCOME_UNKNOWN"
  | "SCHEMA_INVALID" | "RATE_LIMITED" | "POLICY_DENIED" | "RESTRICTED" | "REMOTE_ERROR" | "RESPONSE_INVALID";
```

**Execution order (no shortcuts)**
1. Resolve the tenant, binding, revision, approval, policy, connector and credential on the server from trusted context. Caller-supplied ids are only cross-checked.
2. Evaluate policy in section 6 order. Write a `tool_policy_decisions` row (stage `request`) for any non-`read` class or any deny.
3. Apply the drift rules in section 5.
4. Map and validate the arguments against the revision's input schema. Mapped inputs come only from the allow-list (section 12.3).
5. If confirmation is required, freeze a pending action (canonical final arguments, digest, revision, policy revision, session, expiry), return `pending_confirmation` and stop. The model's call ends here. The model never resumes or retries a frozen action.
6. Confirmed actions enter through `executePendingAction(pendingActionId)` (section 8), never through `invokeTool`. It re-evaluates policy (stage `pre_execute`, a new decision row), checks that the revision, policy revision and session are unchanged, atomically sets the action to `executing`, then continues at step 7 with the frozen arguments.
7. Route by mode. `mock` returns a fixture. `sandbox` uses the linked sandbox connector and is refused without one. `live` uses the real connector.
8. Call the adapter through the egress guard and record attempts.
9. Classify the outcome. Select, validate, redact and cap the output.
10. Write the invocation, update health counters and emit events (section 16).

**Concurrency.** Per-tenant and per-connector concurrency caps, with circuit breakers that open after 5 failures within 60 s and half-open after 30 s. There is no tool-to-tool recursion, and an agent turn makes at most 5 tool calls.

## 8. Confirmation protocol
The model never supplies the evidence that authorizes its own action. It never carries, sees or forwards any authorization token, and it can't change what gets executed.

```text
Model tool request → Gateway freezes pending action (canonical args, digest, revision, session, policy revision, 60 s)
   → Runtime speaks the exact template summary (not model-written)
   → Caller speaks → authoritative STT turn event (session, turn_id, timestamp, transcript, STT confidence)
   → Runtime sends the turn to /runtime/confirm → Confirmation evaluator
        confirmed → Gateway executes the frozen action directly (executePendingAction)
                  → result is delivered to the model as a tool-result message
        no → denied      unclear → reprompt once, then denied
```

**Pending action states:** `pending`, `confirmed`, `executing`, `executed`, `denied`, `expired`, `invalidated`. Each action runs exactly once: the move from `confirmed` to `executing` is a single conditional update, so a second confirm can't start it again.

**Evaluator rules**
- It considers only the first caller turn after the summary finished playing. If the caller interrupted during playback, the confirmation is invalidated and the summary is replayed.
- It requires STT confidence of at least 0.7 when the engine provides it.
- Classification is a deterministic yes/no lexicon first, per configured language. A constrained Jev Choice (yes, no, unclear) helps only when the lexicon returns unclear, and it needs at least 0.9 confidence for yes. Jev can never turn a lexicon "no" into yes.
- A pending action is invalidated by a change to the session, the policy revision or the tool revision, by timeout, or by a new tool request in the same session before it is confirmed. Changed arguments always create a new pending action.
- The evaluator stores evidence on the pending action (turn id, transcript hash, confidence, method). Its decision is written as a `tool_policy_decisions` row with stage `confirmation`.

**Text tests.** The test chat shows the summary with explicit Confirm and Deny buttons. Confirm calls `executePendingAction` through a server function that checks the user's `tool.test.live` or `tool.test.sandbox` permission. The model can't confirm.

**Workflows.** Workflows never request voice confirmation. A matching argument digest alone never authorizes a workflow step. A workflow step that needs confirmation runs only if one of these holds:
1. **Scoped carry-over.** During the call, the caller confirmed a pending action that was created with an explicit `execution_scope` naming this workflow version and step (`{kind: "workflow", workflow_version_id, step_id}`) and the same tool revision and digest. The summary they heard said the action would happen after the call. The confirmation is unexecuted, has its own expiry (default 24 hours, configurable down per workflow), and the workflow consumes it atomically (moving it to `executing`). Confirmations made for live execution during the call can never be reused by a workflow.
2. **After-call permission.** The workflow binding grants `after_call_allowed`, and the risk class is `write`. This is never allowed for `destructive` or `sensitive` tools.

Otherwise the step is `blocked` with `CONFIRM_REQUIRED`.

**Restricted.** Restricted tools always return `RESTRICTED` in v1.

## 9. HTTP adapter
- **Connection.** HTTPS on port 443 only. Other ports need a platform or enterprise egress policy entry, and users can't choose them.
- **Fixed parts.** Scheme, host, port and credentials are fixed by the connector. Arguments can't override them.
- **Methods.** GET, POST, PUT, PATCH and DELETE.
- **Requests.** The path template is percent-encoded per segment. Each parameter has a location: `path`, `query`, `header` or `body`.
- **Header blocklist.** Users can't set `Host`, `Authorization`, `Cookie`, `Proxy-*`, `Forwarded`, `X-Forwarded-*`, `traceparent`, `x-aviroh-*` or hop-by-hop headers.
- **Body.** JSON. Form-encoded bodies are allowed only for webhook connectors.
- **Credentials.** The gateway injects them only in allow-listed positions: a bearer token, basic auth, or a named header from an approved list. Query placement is a server-only policy for reviewed legacy APIs, with the value redacted from every log, trace and error. Secrets are never accepted in URLs, and a URL containing userinfo or key-like parameters is rejected when saved.
- **Responses.**
  - Allowed content types: JSON, `text/plain` and `application/problem+json`.
  - Gzip and br are decompressed within the 1 MiB budget.
  - The reply is selected with a restricted JSON Pointer.
  - HTML replies are reported as `RESPONSE_INVALID`.
  - Success is 2xx by default, and the range is configurable.
  - A 3xx reply is `EGRESS_DENIED`, because redirects are never followed.
  - A 4xx reply is `REMOTE_ERROR` and is not retryable.
  - A 5xx reply is `REMOTE_ERROR` and can be retried under the policy in section 6.

## 10. MCP adapter
### 10.1 Protocol support
- **Primary target: MCP 2026-07-28.**
  - Stateless core, with no protocol-level sessions.
  - Every request carries `MCP-Protocol-Version` and the `Mcp-Method`/`Mcp-Name` routing headers.
  - Optional `server/discover` and cacheable listings.
  - Built on the official TypeScript SDK v2 client where it runs on our server runtime.
- **Compatibility: 2025-11-25 Streamable HTTP** (session-oriented) is supported through the SDK's compatibility path.
- Other revisions get `PROTOCOL_UNSUPPORTED`. There is no guessing fallback.

### 10.2 Capability restriction
Only the transport, discovery, `tools/list` and `tools/call` are supported. A tool whose call needs unsupported interactive capabilities is marked `unsupported` and can't be approved. Execution is never attempted partially.

### 10.3 Discovery
- Checks the origin against egress rules and resolves the credential on the server.
- Paginated catalogue, capped at 200 tools.
- Normalizes and hashes each tool (section 15.3), stores a `connector_discovery_runs` row with a diff, and never approves anything automatically.
- Runs on demand, and on an adaptive schedule (section 10.6).
- A healthy check doesn't guarantee the tool will be available at execution time.

### 10.4 Invocation
- Calls the exact approved remote name.
- Only mapped arguments are sent, never the transcript by default.
- Text content is joined, and structured content is used when present.
- Binary, media and resource content is rejected, and the call counts as `RESPONSE_INVALID` when nothing usable is left.
- `isError` is classified as `REMOTE_ERROR`, distinct from network and protocol failures.
- When a voice session ends, the adapter cancels where the server supports it, and never assumes the cancellation undid the action.

### 10.5 Auth
Auth is none, bearer, or an approved custom header. OAuth comes later; `auth_kind` is reserved.

### 10.6 Adaptive health checks (all connector types)
| Connector state | Check interval |
| --- | --- |
| Active production (bound to a live deployment) | 5 to 15 minutes, with jitter |
| Healthy but used only in drafts, tests or sandbox | every 6 hours |
| Paused (`admin_enabled = false`) | no polling; one check on resume |
| Failing (`unreachable`, `degraded`, `auth_invalid`) | exponential backoff from 5 minutes up to 6 hours, reset on success or on a manual check |
| Archived or revoked | never |

- **Real calls count as evidence.** A real invocation that succeeds updates `last_success_at` and pushes the next scheduled check back by a full interval. Discovery-based drift checks still run at least every 24 hours for active production connectors.
- **Real failures feed health.** Failed invocations count toward health counters using the same classification as checks, but `AUTH_FORBIDDEN` is per tool (section 5).
- **Budgets.** Checks are budgeted per tenant and globally, and they never run on the voice path.

## 11. Workflow integration
- **New versioning.** `workflow_versions(id, workflow_id, version, graph, published_by, created_at)`. Enabling a workflow publishes a version, and edits stay in the draft (`workflows.steps`).
- **Event outbox.** `domain_events(id, workspace_id, type, payload, created_at, processed_at)` is written in the same transaction as the source event (call ended, keyword and so on). A scheduled dispatcher matches enabled workflow versions and creates `workflow_runs(workflow_version_id, trigger_event_id, …)`.
- **Payload minimization.** By default `domain_events.payload` holds only ids and minimal event facts (event type, conversation_id, agent_id, agent_version, deployment_id, timestamps, duration, outcome codes, matched keyword name). It never holds transcripts, summaries, tool inputs or responses, credentials, or caller PII beyond what the event's id references. Consumers load any content they need at run time through scoped reads, subject to current retention and access policy. The payload schema per event type is versioned and checked on write.
- **Tool steps.** Each tool step calls `invokeTool` with `kind: "workflow"`, the step id, and `workflow_tool_bindings.execution_policy` (which includes `after_call_allowed`).
- **No direct calls.** The workflow engine never makes outbound HTTP calls or runs SQL for tool actions directly.
- **Preview until ready.** Until the outbox and versions ship, workflow tool steps run only through "Run now" and are labelled Preview.

## 12. Agent integration
**12.1 Studio.** One picker grouped by connector. Each tool shows its name, approved revision, health, risk, and its binding settings.

**Binding settings**
- enabled
- requirement: `required` or `optional`
- confirmation_mode: `policy_minimum` or `always`
- timeout ceiling
- input mapping

**12.2 Publish checks.** Each check shows a plain reason and a link.
- Blocking:
  - an unapproved or revoked revision
  - contract drift on a write
  - a missing or invalid credential
  - an `admin_enabled = false` connector
  - an unsupported tool
  - an invalid mapping
  - tenant mismatch
  - a required tool's connector `unreachable` for at least 30 minutes
- Warning only:
  - optional tools with the problems above
  - presentation drift
  - brief failures
  - more than 15 tools
- The hard safety maximum is 64 tools per agent.

**12.3 Input mapping allow-list**
- Sources: `model`, `literal`, and call fields (`call.caller_number`, `call.conversation_id`, `call.agent_id`, `call.language`, `call.started_at`).
- `call.transcript` and `call.summary` need an explicit toggle, which shows a warning.

**12.4 Bundle `aviroh.bundle/v2`**
- Each tool entry has `alias` (namespaced per connector), `tool_id`, `tool_revision_id`, `invocation_hash`, model-facing `input_schema`, `requirement` and `needs_confirmation`.
- No URLs, credentials or mappings are included.
- The checksum covers all entries.
- v1 bundles are still accepted, mapped to migrated revisions.

**12.5 Test chat**
- Tool calling goes through the provider registry, using function calling for BYOK models and the gateway default model with tools.
- Mode selector: mock (default), sandbox and live. Sandbox needs `tool.test.sandbox` and live needs `tool.test.live`.
- Tool events appear inline, labelled with the mode.

**12.6 Provider tool schema compiler** (`src/lib/tools/schema-compiler.ts`)
- **Input:** the canonical model-facing input schema of an approved revision (JSON Schema 2020-12, section 15.4) and a target profile: `openai_responses`, `openai_chat`, `anthropic_messages`, `google_gemini`, `livekit_agents` or `aviroh_text_test`.
- **Output:** a provider-specific tool definition (name, description, parameters) plus a lossless/lossy report.
- **Per-profile rules:**
  - Name rewriting to each provider's character and length limits, with a deterministic, collision-free alias map stored in the bundle.
  - Strict-mode shaping: object root, all properties required, optional fields made nullable, `additionalProperties: false`.
  - Removing or rewriting keywords a provider rejects (for example `format`, `oneOf`, `$ref`, numeric bounds).
  - Description length caps.
- **Lossy compilation:** when a keyword is dropped, the gateway still validates arguments against the full canonical schema, so the provider schema is never the security boundary. A revision whose compilation would lose required semantics (for example an unsupported discriminated union on a target) is flagged as incompatible for that profile, and publish blocks only when the agent's selected model uses that profile.
- **Caching:** compiled schemas are cached by `(invocation_hash, profile, compiler_version)`. The bundle stores the compiled schema for the agent's runtime profile, together with the compiler version.
- **Tests:** golden-file tests per profile, and a round-trip check that every compiled schema accepts the canonical examples.

## 13. Partner delegation
- **Table.** `partner_delegations(id, partner_org_id, client_org_id, allowed_actions text[], resource_scope jsonb, granted_by, expires_at, revoked_at)`. The client org owner grants it, and either side can revoke it.
- **Partner operators.** A partner operator is a user in the partner org. They switch into a client org through an explicit selector. Their effective permissions are the intersection of their partner role assignment and the delegation's `allowed_actions`, using the permission names in section 14.8.
- **Audit.** Every audit event records both `actor_user_id`/`acting_partner_org_id` and `client_org_id`.
- **No cross-client reuse.** There is no cross-client credential picker, and credentials are never copied between clients.
- **Cost attribution.** Invocations and costs are attributed to the client org.

## 14. Security, egress and secrets
**14.1 Tenant isolation**
- Every gateway query filters by the tenant from verified context.
- Server transactions check that every child row matches its parent's workspace.
- RLS denies by default on all new tables.

**14.2 Egress**
- **MVP: application guard.** `src/lib/tools/egress.server.ts`:
  - Allows HTTPS on port 443 only.
  - Resolves DNS before connecting and blocks private, loopback, link-local, CGNAT, multicast, unique-local IPv6, cloud metadata and platform-internal ranges.
  - Refuses the request when two resolutions disagree on address class.
  - No redirects, standard TLS verification, and byte and time limits.
- **Growth: infrastructure boundary.** A controlled outbound proxy enforces DNS and IP validation, ports, redirects and destination policy independently, with its own telemetry. It is required before private networking, VPN, dedicated runtimes or BYOC.
- **Security Gate A** (section 21) records the residual risk of the application-only guard.

**14.3 Secrets**
- AES-GCM encryption through `crypto.server.ts`, keyed by `PROVIDER_KEY_SECRET` (moving to a managed key service in Growth).
- Credentials are bound to the org, the connector and the origin.
- Decrypted only inside the gateway and discovery.
- Never logged, returned to a browser, or put in a bundle.

**14.4 Untrusted remote content**
- Tool names, descriptions, schemas and replies are untrusted.
- Descriptions are limited to 2,000 characters and stripped of control characters, and the UI escapes them when rendering.
- Replies are wrapped as `<tool_result tool="alias" trusted="false">…</tool_result>`, with a standing rule that tool results are data.
- A tool result can't widen policy, and every follow-up call is evaluated from scratch.
- Optional Jev screening withholds instruction-like replies.

**14.5 Data minimization**
- Only mapped inputs are sent.
- The transcript is opt-in per binding.
- Masking (card, IBAN and SSN-like patterns) is applied before anything is stored.
- Workspace recording, retention and transcript-access policies apply to stored inputs and outputs.

**14.6 Signed runtime routes**
- Requests are HMAC-signed over `ts.nonce.body`.
- Timestamps outside ±60 s are rejected.
- Nonces are kept for 5 minutes in `runtime_nonces`, and a reused nonce is rejected.
- The session, deployment and allowed snapshot are cross-checked against server records.

**14.7 Write privileges**
- The browser can read governance tables through RLS but can never write them.
- Governance tables: connectors, credentials, tool definitions, revisions, approvals, policies, bindings, confirmations, delegations, invocations, attempts and policy decisions.
- Every insert, update and delete goes through authenticated server functions that enforce lifecycle invariants and write audit events.
- Credential tables have no browser grant at all; the browser reads a sanitized view.

**14.8 Permissions (RBAC)**
- **Model.** Code checks named permissions, never role names.
  - Tables: `permissions(key)`, `roles(id, org_id null for system roles, name)`, `role_permissions(role_id, permission_key)` and `role_assignments(user_id, role_id, scope_type org|workspace, scope_id, granted_by, expires_at)`.
  - Check functions: `has_permission(_perm text, _workspace uuid)`, a security definer used by RLS, and `requirePermission(perm, scope)` in server functions.
  - Platform staff roles (`user_roles`) stay separate and never grant tenant permissions.
- **Permissions:**
  - `connector.read`, `connector.create`, `connector.update`, `connector.pause`, `connector.delete`
  - `credential.manage`
  - `tool.read`, `tool.approve`, `tool.revoke`, `tool.policy.edit`
  - `tool.test.mock`, `tool.test.sandbox`, `tool.test.live`
  - `tool.execution.read`, `tool.decision.read`
  - `agent.bind_tools`, `agent.publish`, `workflow.bind_tools`, `workflow.publish`
  - `delegation.manage`
- **System roles** (defaults, seeded):
  - Owner: all permissions.
  - Admin: all except `delegation.manage`.
  - Builder: read, `tool.test.mock`, `tool.test.sandbox`, `agent.bind_tools`, `workflow.bind_tools`.
  - Reviewer: read, `tool.approve`, `tool.revoke`, `tool.decision.read`.
  - Operator: read, `connector.pause`, `tool.execution.read`.
  - Viewer: the read permissions only.
- **Migration.** Existing `org_members.role` values map to the Owner, Admin and Builder role assignments at org scope. `is_workspace_member` keeps working for non-tool tables.
- **Separation of duties** (org setting, off by default): the person who approves a revision can't be the one who created the connector or binds the tool to a live agent.
- **Partners.** A partner operator's effective permissions are their role intersected with the delegation (section 13).

## 15. Data and schemas
**15.1 Tables** (all public schema, RLS on, `authenticated` gets SELECT only where noted, `service_role` ALL)

| Table | Key columns | Browser |
| --- | --- | --- |
| `tool_connectors` | id, org_id, workspace_id, type, display_name, canonical_origin, endpoint_path, configuration jsonb (no secrets), credential_id, admin_enabled, health, protocol_version, last_checked_at, last_success_at, consecutive_failures, error_code, environment_class (`live`/`sandbox`), sandbox_of, discovery_etag | select (members) |
| `tool_credentials` | id, org_id, connector_id, origin, auth_kind, header_name, ciphertext, secret_version, hint, status, rotated_at, revoked_at | none (view `tool_credentials_public` without ciphertext) |
| `tool_credential_events` | credential_id, event, actor, at | select |
| `tool_definitions` | id, workspace_id, connector_id, source_operation_id, stable_slug, state (`active`/`archived`/`unsupported`), current_revision_id, archived_at; unique (connector_id, source_operation_id) | select |
| `tool_revisions` | id, tool_id, revision_no, display_name, description, input_schema, output_schema, adapter_mapping, remote_annotations, review_hash, invocation_hash, normalizer_version, discovered_at | select |
| `tool_approvals` | id, tool_revision_id, workspace_id, risk_class, allowed_contexts, confirmation_minimum, idempotency_mode, safe_to_retry, drift_read_policy, status, approval_source (`human`/`legacy_migration`), approved_by (null for legacy), approved_at, review_required_by, policy_revision | select |
| `tool_policies` | workspace_id, tool_id, timeout_ms, rate_limit_per_min, sensitive_output, max_output_bytes, updated_by, revision | select |
| `tool_mocks` | tool_revision_id, name, reply | select |
| `agent_tool_bindings` | agent_id, workspace_id, tool_revision_id, enabled, requirement, confirmation_mode, timeout_ms, input_mapping (draft) | select |
| `workflow_versions` | id, workflow_id, workspace_id, version, graph, published_by | select |
| `workflow_tool_bindings` | workflow_version_id, step_id, tool_revision_id, execution_policy | select |
| `domain_events` | id, workspace_id, type, payload, created_at, processed_at | none |
| `tool_invocations` | ids in 18.1, mode, input_hash, idempotency_key, status, error_code, input_redacted, output_redacted, started_at, ended_at, latency_ms | select (members) |
| `tool_attempts` | id, invocation_id, attempt_no, destination_host, status_code, error_class, retry_decision, started_at, ended_at | select |
| `tool_pending_actions` | id, workspace_id, invocation_id, session_id, turn_id, tool_revision_id, frozen_arguments (encrypted), args_digest, policy_revision, summary, status, expires_at, evidence jsonb, executed_at | none |
| `tool_policy_decisions` | id, invocation_id, stage (`request`/`confirmation`/`pre_execute`/`retry`), policy_revision, decision, reason_codes, risk_class, required_confirmation, pending_action_id, evaluated_at; many per invocation | select (`tool.decision.read`) |
| `permissions`, `roles`, `role_permissions`, `role_assignments` | section 14.8 | select (members) |
| `connector_discovery_runs` | connector_id, protocol_version, catalog_hash, status, tool_count, drift jsonb, error_code, actor | select |
| `partner_delegations` | section 13 | select (both orgs) |
| `runtime_nonces` | nonce, expires_at | none |

Agent versions store binding snapshots inside `agent_versions.config.tool_bindings`.

**15.2 Integrity**
- Unique keys: `(connector_id, source_operation_id)`, `(tool_id, revision_no)`, and one active credential per connector.
- `tool_invocations` is unique on `(context key, invocation_id)`.
- `updated_at` triggers on mutable tables.
- The existing `log_tenant_change` trigger is extended to the new tables.

**15.3 Canonicalization**
- Normalizer v1: canonical JSON with sorted keys, whitespace removed, and `description` kept.
- `review_hash` = sha256 of the display name, description, annotations and invocation contract.
- `invocation_hash` = sha256 of the remote name, input and output schemas, and adapter mapping.
- The normalizer version is stored with every revision.

**15.4 Schema validation**
- Full JSON Schema draft 2020-12 is validated with Ajv in strict mode on the server.
- Supported keywords are recorded in the spec, and revisions using unsupported keywords are rejected at approval with a reason.
- Limits are in section 22.

## 16. APIs and events
**Server functions** (`src/lib/tools.functions.ts`). Every function uses `requireSupabaseAuth` plus `requirePermission(<permission>, scope)` from section 14.8, and the matching permission is listed in the permission table. `executePendingAction` is exposed to the console only for text tests.
| Function | Purpose |
| --- | --- |
| createConnector | create a connector |
| updateConnector | edit, with an optimistic revision check |
| checkConnector | run discovery |
| pauseConnector | pause a connector |
| resumeConnector | resume a connector |
| archiveConnector | archive a connector |
| rotateCredential | write-only new secret |
| revokeCredential | revoke the credential |
| approveRevision | approve one revision |
| rejectRevision | reject one revision |
| revokeApproval | revoke an approval |
| updateToolPolicy | edit a tool's policy |
| saveMocks | save mock replies |
| testTool | run a test in a chosen mode |
| setAgentBindings | change an agent's bindings |
| setWorkflowBindings | change a workflow's bindings |
| listInvocations | list tool calls |
| getInvocationTrace | trace one call |
| createDelegation | create a partner delegation |
| revokeDelegation | revoke a partner delegation |

Every mutation accepts an `idempotencyKey`.

**Runtime routes** (signed, section 14.6)
- `POST /api/public/runtime/tool` takes `{session_id, turn_id, invocation_id, alias, arguments}` and returns `InvokeResult`.
- `POST /api/public/runtime/confirm` takes `{session_id, turn_id, pending_action_id, transcript, stt_confidence?, interrupted}`.
  - Returns `{status: "executed", result: InvokeResult}` when the evaluator confirms and the gateway runs the frozen action.
  - Otherwise returns `{status: "denied" | "reprompt" | "invalidated" | "expired"}`.
  - The worker injects the result into the conversation as the tool result. There is no token in any response.
- `POST /api/public/runtime/cancel` takes `{session_id, invocation_id}`.

**Events**
- Delivered through outbox and webhooks: `tool.approved`, `tool.revoked`, `tool.drift_detected`, `connector.health_changed`, `tool.outcome_unknown`, `tool.blocked`.

**Public REST (Growth)**
- `/api/public/v1/connectors…`, `/tools…` and `/tool-invocations` with workspace API keys and Idempotency-Key.

## 17. Runtime failure model
| Tier | Components | On failure |
| --- | --- | --- |
| 0 must stay up | media, conversation state, deployed bundle (cached in the worker) | the call ends gracefully |
| 1 side effects | Tool Gateway, policy state, secrets | the conversation continues, affected actions are unavailable, and sensitive and higher-risk actions fail closed (a stale cache never allows a write) |
| 2 noncritical | console UI, analytics, discovery jobs, workflow history | conversation unaffected |

- Tool calls run off the audio path.
- If a tool takes more than 1.5 s, the runtime plays a template hold line.
- Barge-in during a tool call doesn't cancel an authorized write that has already been sent.
- When the caller hangs up, unsent work is cancelled.

**Failure matrix**
| Code | Agent says | Console |
| --- | --- | --- |
| EGRESS_DENIED | "I can't reach that system." | security alert |
| AUTH_INVALID | offers a callback | connector Needs attention, rotate key |
| AUTH_FORBIDDEN | "I'm not able to do that from here." Offers handoff | tool Needs attention, check the key's permissions in the business system |
| PROTOCOL_UNSUPPORTED | tool unavailable | shows supported versions |
| CONTRACT_DRIFT / TOOL_UNAVAILABLE | "I can't complete that right now." | review diff, republish |
| CONNECTOR_PAUSED / REVOKED | offers an alternative or handoff | lists dependents |
| CONFIRM_REQUIRED | reads the summary | records evidence |
| TIMEOUT (read) | apologizes, offers a callback | latency chart |
| OUTCOME_UNKNOWN | "The request may have gone through, but I couldn't confirm the result." The agent never promises a follow-up, unless the agent's configured handoff or callback policy provides one. It does not retry the action | Needs attention item, plus a webhook for reconciliation |
| SCHEMA_INVALID | asks for the missing details | |
| RATE_LIMITED / POLICY_DENIED / RESTRICTED | offers handoff | |

## 18. Observability
**18.1 Correlation ids on every invocation** (null when not applicable)
- organisation_id, workspace_id
- agent_id, agent_version, deployment_id
- conversation_id, session_id, turn_id
- workflow_id, workflow_version_id, workflow_run_id, workflow_step_id
- tool_id, tool_revision_id, connector_id
- invocation_id, attempt_id, trace_id
- acting_partner_org_id

**18.2 Trace view.** Call details gain a tool timeline that follows one action from end to end:
1. The caller's statement
2. The tool request
3. The policy decision
4. The confirmation, with its evidence
5. The approved revision
6. Each attempt
7. The outcome

**18.3 Retention.** Invocations and attempts are kept for 90 days by default, and workspace retention policy can shorten that. Policy decisions and confirmations follow the audit retention policy.

## 19. Testing
- **Unit tests.**
  - Egress: private ranges, rebinding, redirects, ports, caps, decompression bombs.
  - Redaction, including query credentials.
  - Canonicalization and drift classes.
  - Policy precedence.
  - The confirmation evaluator: lexicon, interruption, digest change, expiry, reuse.
  - Retry and outcome_unknown classification.
- **Contract tests.** A public echo HTTP service covering every method, location and selector. A reference MCP server on 2026-07-28 and one on 2025-11-25, covering list, call, isError, unsupported capability, pagination and drift.
- **RLS tests.** Non-members, members versus admins, partner with and without delegation, and that direct browser writes are rejected on every governance table.
- **Browser tests.** Connect, discover, approve, change, re-approve. Bind, publish, block on unapproved. Text test in mock and live with confirm and deny. Pause stopping a published agent. Desktop and phone, light and dark.
- **Runtime tests.** Signed-route replay rejection, stale-cache fail-closed, cancel on hangup.

## 20. Migration
1. Each existing `tools` row becomes an `http` connector, a definition, revision 1 and an approval with `approval_source = 'legacy_migration'`, `approved_by = null` and `review_required_by = now() + 30 days`. The risk is `read` for GET and `write` otherwise, idempotency `none`, no retry. Its `auth_ciphertext` becomes credential version 1 (header `Authorization`).
   - **Behaviour of legacy approvals:**
     - They keep existing agents and workflows working.
     - They show a "Review needed" badge.
     - They can't be newly bound to another agent until a human re-approves them.
     - Write and higher-risk legacy tools require voice confirmation (the section 6 minimum applies as usual).
     - After the review deadline, legacy approvals on write tools are blocked for new publishes but not for existing deployments.
   - Re-approval creates a new `tool_approvals` row with `approval_source = 'human'`, and the legacy row is kept for audit.
2. `agent_tools` rows become `agent_tool_bindings` (required, all inputs from the model).
3. Published agent versions get `tool_bindings` backfilled from the migrated revisions. v1 bundles resolve by name.
4. Workflow `call_tool` steps are re-pointed to revision ids. Existing workflows get version 1 when they are enabled.
5. Old tables are renamed `*_legacy` and dropped one release later.

## 21. Release phases
| Phase | Scope | Exit criteria |
| --- | --- | --- |
| 0 | Commit this spec and ADR-TOOLS-001; AGENTS.md rule; roadmap | approved |
| 1 | Migrations (section 15), legacy migration, views, server-only writes, delegation table | RLS tests pass; existing tools unchanged |
| 2 | Gateway core, policy engine, egress guard, redaction, records | unit tests pass |
| **Security Gate A** | tenant isolation, SSRF, credentials, URL manipulation, rate limits, logging and redaction | sign-off, residual risk recorded |
| 3 | HTTP and webhook adapters, guides | contract tests pass |
| 4 | MCP adapter (2026-07-28 plus 2025-11-25), discovery, drift job | reference servers pass |
| 5 | Tools page: connections, review and diff, approvals, policy, mocks, tests, activity, partner selector | browser tests |
| 6 | Agent bindings, publish checks, test chat tool calling with Confirm and Deny | browser tests |
| 7 | Bundle v2, runtime tool, confirm and cancel routes, nonces, worker changes, trace view | runtime tests |
| **Security Gate B** | confirmation, replay, side effects, stale config, emergency revoke, degradation, malicious MCP replies | sign-off before production voice tool use |
| 8 | Workflow versions, event outbox, workflow bindings, Preview label removed | run reproducible from its version |
| 9 | Retention jobs, Overview items, webhook events, limits tuning | end-to-end pass, security scan clean |

Phases 1 to 6 and 8 are testable now. Phase 7 completion and Gate B need the hosted voice worker and its keys.

## 22. SLOs and limits (tunable configuration)
| Limit | Value |
| --- | --- |
| Connect timeout | 5 s |
| Discovery overall | 15 s |
| Live tool budget | 8 s default, 15 s max |
| Input | 32 KiB |
| Output to model, platform maximum | 16 KiB |
| Output to model, live voice default | 2 KiB, configurable per binding up to 4 KiB; values above 4 KiB need the `tool.policy.edit` permission and still can't exceed the platform maximum |
| Output to model, text test and workflows | 16 KiB |
| Raw response, including decompression | 1 MiB |
| Description | 2,000 chars |
| Tools per connector | 200 |
| Tools per agent | warn above 15, hard max 64 |
| Schema depth | 16 |
| Health refresh | adaptive, see section 10.6 |
| Confirmation validity | 60 s |
| Tool calls per turn | 5 |
| Nonce window | 5 minutes |
| Gateway overhead target | p95 under 150 ms excluding the destination |

Limits are reported through capability errors, never through silent truncation of executable schemas.

## 23. Open decisions (defaults in place)
- Lexicon languages for confirmation at launch: English first, with others added per agent language.
- Presentation-drift re-review window: 14 days.
- Whether `sensitive` tools need an extra factor (OTP) per organisation. Off by default, so the organisation decides.
- Moving to a managed key service: timing set at Security Gate B.
- Context-aware tool selection: Growth, after measuring accuracy above 15 tools.

## 24. ADR references
- ADR-RT-001: realtime substrate (LiveKit confined to runtime modules).
- ADR-TOOLS-001 (new): Unified Tool Gateway, separation of lifecycle steps, policy precedence.
- ADR-TOOLS-002 (new): runtime-evaluated confirmation that executes the frozen pending action directly.
- ADR-TOOLS-004 (new): permission-based access control (RBAC) for tools.
- ADR-TOOLS-005 (new): provider tool schema compiler.
- ADR-TOOLS-003 (new): MCP version support and capability restriction.
- AGENTS.md gains one rule: every external tool call goes through `src/lib/tools/gateway.server.ts`, and governance tables are written only by server functions.
