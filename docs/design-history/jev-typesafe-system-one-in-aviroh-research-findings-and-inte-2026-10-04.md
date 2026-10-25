# Jev (TypeSafe System One) in aviroh: research findings and integration plan

## What Jev is

Jev is a decision model, not a chat model. You send it a state (text/JSON) plus typed questions, and it returns calibrated answers your code can use directly:

- **Choice** — pick one option from a set you define (with per-option probabilities)
- **Score** — rate something on ordered levels you describe (probability-weighted)
- **Noul** — probability that a yes/no condition holds

It does not write text, so it can never replace the agent's voice brain. It replaces the small "judge this" calls we would otherwise send to a full generative model.

## Verified facts

- Available on our AI gateway as `typesafe/jev-latest` on the native `POST /v1/systemone` endpoint; workspace availability confirmed.
- 32k context, text input only, zero data retention.
- Billed on input only, at a very low rate; output is free. A judgment call costs a tiny fraction of a generative LLM call.
- Independent questions batch into one request and run in parallel (TypeSafe's own cookbook measured one batched call ~12x cheaper and ~10x faster than separate calls).
- No SDK needed: one server-side `fetch` with our existing gateway key.

## Where it fits aviroh (real value, not novelty)

1. **Smart workflow conditions.** Today `summary_contains` is a literal string match. A Jev-backed condition lets any business write a plain-language check ("the caller asked for a refund", "the caller sounded unhappy") and get a probability, with a threshold they control. This is the single best fit: business-agnostic, per-workspace wording, and it makes the visual workflow builder genuinely smarter.
2. **Automatic call tagging.** After a call, one batched Jev request scores the summary against the workspace's own tag set and saves matching tags — turning today's manual/literal tagging into semantic tagging.
3. **Eval judging.** Eval suites need a judge to score simulated calls against a rubric. Jev Score questions do this at a fraction of the cost of a generative judge, which directly reduces the cost of the rollout-gating evals we already require before 100% deployments.
4. **Knowledge reranking.** Retrieval today returns the top embedding matches as-is. Scoring each passage for relevance (and dropping noise or injected instructions) before it reaches the agent's model means fewer, cleaner tokens per call — a real cost and quality win on every knowledge-backed conversation.
5. **Guardrail screening.** A battery of Noul questions can screen caller utterances and agent replies against the workspace's banned topics and policies, with pass/review/block thresholds in our code rather than buried in a prompt.

## Cost honesty

Our recorded spend is almost entirely build-time; runtime AI cost is currently near zero because live calls are not connected yet. So Jev's savings are **prospective**: at real call volume, every judgment we route to Jev instead of a generative model is dramatically cheaper, and reranking shrinks the tokens the expensive models see. It adds a capability (semantic conditions, auto-tags, cheap eval judges) more than it cuts an existing bill.

## Constraints we keep

- Vendor-neutral rule stands: Jev is one optional provider behind our provider registry, never hard-wired. Workspaces without it keep literal conditions and manual tagging.
- Text only: it judges transcripts and summaries, never audio.
- Server-side only, via the gateway key; no new secret needed.

## Build plan (proposed phases)

### Phase 1: Jev server module
- `src/lib/jev.server.ts`: one typed helper around `POST /v1/systemone` (choice/score/noul, batched questions, gateway key, error handling per gateway semantics). Registered as an optional capability in the provider registry.

### Phase 2: Smart workflow conditions
- New condition kind "AI check" in the workflow builder: the user writes a plain-language question and sets a threshold; the executor asks Jev a Noul against the call summary/transcript and follows the yes/no branches. Literal conditions stay available.

### Phase 3: Auto-tagging
- New workflow action "Tag with AI": Choice over the workspace's existing tags, saved to `conversation_tags` exactly like today's tag action.

### Phase 4: Eval judge
- Eval suites gain a Jev rubric judge (Score per rubric criterion) so gated rollouts get cheap, repeatable judging once the eval runner is hosted.

### Phase 5: Knowledge reranking
- Optional per-knowledge-base toggle: score retrieved passages with Jev and drop irrelevant or injection-like ones before they reach the agent model.

### Verification
- Live Jev call through the gateway with a real question set; then a browser pass: create a workflow with an AI condition, run it on a past call, confirm the branch taken and tags saved; confirm everything still works with Jev disabled.

## What I need from you

- Approval of the phase order (2 and 3 give the most visible value first).
- Nothing else: no new keys or infrastructure are required.
