# Roadmap

Customer experience is P0. The current first-release implementation sequence is [the unified customer-experience plan](docs/customer-experience-unified-plan.md). Its CX-01 through CX-06 packages govern the supported enquiry journey; the older lists below remain historical tracking and do not establish production readiness.

## Now
- [x] Add a three-step self-serve setup for business profile, optional website knowledge and signed webhook notifications; save an unpublished agent draft without auto-approving actions or provisioning paid telephony.
- [x] Queue minimal successful-live-action webhook events with 2xx acknowledgment, per-endpoint retry deduplication and a cron retry route.
- [x] Complete business-agnostic Agents and visual Workflows panels with real graph execution and readiness states.
- [x] Keep workflow validation, execution, and run history business-agnostic: validate every graph/reference/mapping before activation and show the actual versioned path and outcomes.
- [x] Provider-registry AI decisions: workspace-scoped checks, workflow conditions, and Tag-with-AI actions.
- [ ] Provider-backed eval judge for gated rollouts (requires hosted eval runner).
- [x] Optional provider-backed knowledge reranking per knowledge base.
- [x] Remove restaurant-first positioning and unsupported public claims.
- [x] Add organization, workspace, and environment context to the console.
- [x] Rebuild the agent studio around modular lifecycle tabs.
- [x] Separate deployments, telephony, live operations, analytics, and management navigation.
- [x] Verify public pages and protected-route behavior.
- [x] Verify signed-in workflows in light and dark themes after a user account exists.

## Waiting on user
- LiveKit credentials are configured locally; deploy the voice worker before testing phone calls.
- Platform AI provider keys (OPENAI_API_KEY etc.) or per-org BYOK
- Host for runtime/ voice worker; Twilio/Telnyx SIP trunk for phone numbers
- Own Google OAuth client (optional branding)
- Sign up, create org, upload doc, test a call (untested end-to-end)

## Next builds
- [x] Developer quickstart and authenticated API operations.
- [x] Isolated internal operations surface (/internal, staff roles only).
- [x] Evals gate full production rollouts; canary + promote controls; signed /api/public/runtime/eval-result endpoint.
- [ ] Automated eval runner in the hosted voice worker (blocked: hosted worker).
- [x] Fix older security warnings on security-definer helpers.
- [x] Re-index documents uploaded before the provider rebuild.
- [x] Step-by-step completion plan for every Build feature (Agents, Knowledge, Tools, Workflows, Evals) and remaining console areas.
- [x] Knowledge: web page (URL) sources with server-side fetch and re-index; search results show the source name.
- [x] Tools: test input can be filled from the tool's parameter schema.
- [x] Evals: per-case results table (eval_run_items) with expandable run detail.


## Tool Gateway (ENG-TOOLS-001, docs/specs/tool-gateway.md)
- [x] Phase 0: spec, ADRs, AGENTS.md rule
- [x] Phase 1: tables, RBAC, legacy migration, server-only writes, delegation table
- [x] Phase 2: gateway core, policy engine, egress guard, redaction, records (src/lib/tools/)
- [ ] Security Gate A
- [ ] Phase 3: HTTP and webhook adapters (adapter done), guides
- [ ] Phase 4: MCP adapter + discovery (done), drift job
- [ ] Phase 5: Tools page rebuild
- [ ] Phase 6: agent bindings, publish checks, test chat tool calling
- [ ] Phase 7: bundle v2, runtime routes, nonces, worker (blocked: hosted voice worker)
- [ ] Security Gate B (blocked: hosted voice worker)
- [ ] Phase 8: workflow versions, event outbox
- [ ] Phase 9: retention, Overview items, webhook events
