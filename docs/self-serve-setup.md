# Guided business setup

The authenticated `/onboarding` route guides a new owner through three steps:

1. Business and workspace name, plus optional operator-provided hours/service notes.
2. Optional public HTTPS website for knowledge indexing, and an optional HTTPS notification receiver.
3. Review and create an unpublished receptionist draft.

The setup creates a workspace using the existing `create_organization` database function. It creates a draft agent and, when supplied, a URL knowledge source. Indexing requires a compatible embedding credential and can fail without blocking the draft. The user sees that failure in the completion screen and can continue in Knowledge.

## Successful action webhook

An optional notification receiver can subscribe to `tool.succeeded`. Events are queued only after a live approved tool execution succeeds (PSTN calls or live workflow actions). Mock/sandbox runs, console tests, web test calls, failed calls, unknown outcomes, and pending confirmations do not produce this event.

The signed JSON event includes the event ID, tool ID/name, and execution context only. It deliberately excludes caller identity/contact details, transcripts, tool arguments, and tool output. Receivers should use `id` as their idempotency key and validate the `x-aviroh-timestamp` and `x-aviroh-signature` headers. The onboarding page displays the endpoint signing secret once; operators should store it securely.

Tool success is not contingent on notification delivery. Outbox rows stay unprocessed after endpoint/network/non-2xx failures; successful endpoints are not resent when another endpoint fails. Immediate background delivery is attempted, and a scheduler should POST to `/api/public/events/deliver` with `Authorization: Bearer $CRON_SECRET` to retry failures. Configure that scheduler for one-minute intervals after setting a random `CRON_SECRET` of at least 32 characters. The endpoint returns 503 when any delivery in the batch still needs retry.

## Explicitly not part of this wizard

- No provider keys are collected; text/voice testing remains gated by actual provider configuration.
- No tool/action pack is generated, auto-approved, or assigned. Owners configure and review tools separately.
- The agent is not published or deployed. Production eval gates and deployment permissions remain authoritative.
- No number is purchased, no phone route is activated, and no live call is promised.
- SMS and email delivery are not configured. A business can use its own automation receiver to route the minimal webhook event, subject to its own consent and data practices.
- A provided transfer/escalation number is not accepted because the current runtime does not execute human transfer.