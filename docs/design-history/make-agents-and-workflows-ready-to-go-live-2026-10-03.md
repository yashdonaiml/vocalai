# Make Agents and Workflows ready to go live

Benchmarked against leading voice agent platforms (Retell, ElevenLabs Agents, Vapi): structured agent settings, immutable versions with rollback, built-in testing before publish, and workflows that actually run on real call events.

## Agents

**Agent list**
- Columns showing live version, deployed environments, calls in the last 7 days, last edited by.
- Bulk archive, sort by name or last edited, empty state with templates.

**Agent studio (tabs)**
1. **General:** name, description, language, greeting, persona, instructions with character count and variable chips (caller name, business name, date).
2. **Voice and model:** native speech model or composable (speech to text, language model, voice); only providers with a saved key or platform key are selectable; clear warning if none.
3. **Knowledge and tools:** attach knowledge bases and tools; show readiness (files still processing, tool never tested).
4. **Call behavior:** max call length, silence timeout, end call phrases, voicemail handling, transfer number, after-hours message.
5. **Guardrails:** banned topics, never-say list, handoff rules, recording notice toggle (follows Security settings).
6. **Versions:** full history with who published, diff between any two versions, restore a version into the draft, see where each version is deployed.

**Test before publish**
- **Text test chat:** talk to the draft by typing, using its real prompt, knowledge and tools (works today through the provider registry, no voice service needed).
- Shows each reply, retrieved knowledge snippets and tool calls.
- **Voice test call:** stays behind the "voice service not connected" notice until keys are added.

**Publish checklist** (blocks publish with plain reasons)
- Instructions and greeting filled, a model with a working key, attached files finished processing, tools tested, unsaved changes saved.
- Optional release note per version.

## Workflows

**Builder**
- Move from a flat form to an ordered step editor with conditions: "only if" rules on step (for example tag equals qualified, call longer than 60 seconds, agent is X).
- New step types: send email (later, needs domain), send to webhook endpoint (reuses Developer webhooks), call a tool with mapped fields from the call (summary, caller number, transcript, tags), wait, end call.
- Duplicate, rename, enable or disable, delete.

**Running for real**
- Workflows run on server side when call events arrive (call started, call ended, tool result, keyword) through the existing signed runtime events route, so they fire automatically once calls happen.
- **Manual run** against any past conversation (real execution, not just a dry run) so users can test today.
- Each run is recorded: status, each step's result, duration, errors, retried once on failure.

**Run history**
- Per workflow: list of runs with filters (success, failed), open a run to see each step's input and output.
- Overview "Needs attention" shows failed workflow runs.

## Shared readiness
- Admin-only edits enforced in the database; members see read-only views with a plain notice.
- Every change logged to activity with who did it.
- Plain product copy, friendly errors, light and dark verified.

## Delivery order
1. Database: workflow_runs and workflow_run_steps, agent call behavior and guardrail fields in the draft config, version release notes.
2. Agent studio tabs, version diff and restore, publish checklist.
3. Text test chat on the server.
4. Workflow step editor with conditions and new step types.
5. Workflow engine on server, manual run, run history.
6. Hook runtime events into the engine.
7. Browser test as your account: create agent from template, edit, test chat, publish, restore; create workflow, manual run on a seeded test conversation, view history; clean up test records.

## Honest limits
- Live voice test calls and workflows firing on real calls need the voice service keys and hosting.
- Text test chat needs at least one AI provider key (yours or platform).
- Email steps wait for a sending domain.

## Technical details
- New `src/lib/workflows.functions.ts` (runWorkflow, listRuns) and `src/lib/workflows.server.ts` engine; step executors reuse tool call and webhook signing code; called from `/api/public/runtime/events`.
- New `src/lib/agent-test.functions.ts` using the provider registry plus `searchKnowledge`; tools executed with the same code as the runtime tool route.
- `agent-config.ts` gains `callBehavior` and `guardrails` objects; `normalizeConfig` fills defaults for old drafts.
- Version diff computed client side from two `agent_versions.config` rows; restore writes the version into `agents.config` only.
- Tables get GRANTs, RLS via `is_workspace_member`, audit trigger.
- Update AGENTS.md and roadmap.md.
