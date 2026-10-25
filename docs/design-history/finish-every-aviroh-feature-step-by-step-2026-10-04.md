# Finish every aviroh feature, step by step

Goal: take every console area from "page works" to "feature complete", in an order where each step stands on its own. Nothing here needs the voice-service keys except the steps that say so.

## Phase 1: Agents (the core product)

1. **Templates**: 4-6 business-agnostic starting points (receptionist, appointment booking, support triage, lead qualification). Creating from a template pre-fills instructions, greeting, and suggested tools. All editable.
2. **Version compare polish**: side-by-side view for instructions and call settings, not just field lists.
3. **Test chat history**: keep the text-test conversation on the Test tab during the session so a user can try several messages in a row.
4. **Agent duplication**: copy an agent including its tools and knowledge links.
5. **Archive flow**: archived agents hidden by default with a filter to show them; restoring works from the list.

## Phase 2: Knowledge

1. **File detail page**: chunks count, indexing status, errors, re-index single file, replace file.
2. **Text sources**: add a "paste text" source alongside file upload (FAQs, policies) so users don't need files for everything.
3. **URL sources**: add a web page address; we fetch and index its text. Re-fetch on demand.
4. **Test retrieval polish**: show which file each result came from and its score, so users can judge quality.
5. **Smart filtering**: already built (Jev reranking). Add a one-line result note when filtering dropped passages.

## Phase 3: Tools

1. **Built-in tool catalog**: common actions any business can use: book appointment (generic slot fields), take a message, collect contact details, transfer call.
2. **Custom tool builder**: name, description, fields, and a webhook endpoint the tool calls. Signed requests, like workflow webhooks.
3. **Tool testing**: "Test" runs the tool with sample input and saves the last result (status + time) so readiness is real, not a one-off.
4. **Per-agent tool assignment**: already exists; add a clear list of which agents use each tool on the tool row.

## Phase 4: Workflows

1. **More triggers**: conversation tagged, eval failed, schedule (daily/weekly digest).
2. **More actions**: send email summary (needs an email domain, later), update a contact field, call another workflow.
3. **Run history detail page**: open a run, see each node's input, output, duration, and the branch taken.
4. **Workflow templates**: 3 starting points (after-call summary to webhook, unhappy-caller escalation, missed-call follow-up).
5. **Validation UX**: show errors inline on the canvas node, not only in a toast.

## Phase 5: Evals

1. **Eval editor**: edit suite name, rubric criteria, and pass threshold after creation.
2. **Jev judge**: score each rubric criterion with Jev when results arrive (blocked: hosted eval runner).
3. **Manual eval**: run a suite against a recorded past conversation, without the voice worker, so users get value today.
4. **Results view**: per-criterion scores and failures, not just pass/fail.

## Phase 6: Deploy (needs voice keys for live use)

1. **Deployments**: rollback button (redeploy an older version), deployment notes, clearer canary controls.
2. **Environments**: per-environment variables (e.g. different phone numbers or greetings per environment).
3. **Telephony**: phone-number purchase/release flow (blocked: Twilio/Telnyx account). Until then, the page explains exactly what to connect.

## Phase 7: Operate

1. **Conversations**: filters (agent, date, tag, outcome), export to CSV, and a per-conversation "run workflow" action.
2. **Live sessions**: real-time list once the voice service is connected; until then the page shows the honest status.
3. **Analytics**: date-range picker, per-agent breakdown, and outcome trends. Charts fill in as real calls happen.

## Phase 8: Manage

1. **Usage**: per-agent and per-day breakdown, export.
2. **Providers**: show which agents/workflows use each provider; warn before deleting a key in use.
3. **Team**: invitation emails (needs an email domain you own). Until then, keep the copy-link flow.
4. **Security**: session list (sign out other devices), audit log filters.
5. **Developer**: webhook retry on failure, API key scopes (read-only vs full).

## Phase 9: Verify everything

1. Browser-test every page and button after each phase, light and dark, desktop and phone widths.
2. Clean up all test records.
3. Final security scan and build check before go-live.

## What stays blocked until you provide things

- Live calls, test calls, phone numbers: voice-service keys (LiveKit) + a host for the voice worker + a phone provider account.
- Invitation emails and email workflow actions: an email address on a domain you own.
- Jev eval judge: the hosted eval runner (comes with the voice worker).

## Technical notes

- Each phase is independently shippable; order can change if you want a different priority.
- All new features follow existing rules: workspace-scoped data, friendly error messages, plain copy, no fake data, honest "not connected" states.
- Estimated effort: phases 1-5 are pure platform work (no external keys); phases 6-8 are partly gated on your keys.
