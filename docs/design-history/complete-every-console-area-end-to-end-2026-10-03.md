# Complete every console area end to end

Builds on the approved aviroh platform plan. Goal: every sidebar item is a working page with real data, working buttons, and honest empty, loading, permission, and error states. No invented numbers.

## Current state per area

| Area | State | Work |
|---|---|---|
| Overview | Working, some placeholder content | Replace placeholders with real counts, recent activity, alerts |
| Agents | List + studio work | Search, status filter, templates, duplicate, archive, delete; fix "stays unsaved after save" and "publishes after a failed save" |
| Knowledge | Working | Rename and delete knowledge base and sources, per-source detail, linked agents |
| Tools | Create only | Edit, delete, test call with sample input, see which agents use it |
| Workflows | Placeholder | Build real workflows (see below) |
| Evals | Working | Case edit and delete, run history per version, gate status badge |
| Deployments | Working, but holds phone numbers | Move phone numbers out to Telephony; add history list, deployment detail, filters |
| Environments | Read only | Create, rename, delete (non production only), see what is deployed where |
| Telephony | List only | Add, edit routing, release numbers, link to deployment, honest "not connected" state |
| Live sessions | List only | Auto refresh, filter, open session, end session action where runtime allows |
| Conversations | Single list | Stable detail page with Summary, Transcript, Timeline, Tools, Usage, Metadata tabs; filters by agent, version, channel, date |
| Analytics | Placeholder | Real charts from conversations, usage, eval runs: Operational, AI quality, Business outcomes |
| Usage | Basic | Breakdown by agent, environment, provider, kind; date range; managed vs your own keys; estimate labels |
| Providers | Working | Test connection, delete key, show which agents use each provider |
| Team | Working | Change role, remove member, resend or copy invite link |
| Security | Static text | Real settings: recording, retention days, transcript access, PII redaction, saved per organization |
| Developer | Working | Webhook endpoints (subscribe to events), event catalogue, test delivery |

## New capabilities that need storage

- **Workflows:** a workflow has a trigger (call started, call ended, tool result, keyword), ordered steps (call a webhook tool, send summary to webhook, tag conversation, hand off to number), enabled flag. List, create, edit, enable, delete, and a dry run against a past conversation. Execution happens in the voice worker later; page states that clearly.
- **Security policies:** one settings row per organization.
- **Webhook endpoints:** URL, events, encrypted signing secret, delivery log.
- **Agent archive:** an archived status on agents.

All new tables follow existing rules: workspace or org scoped, row security via membership helpers, admin-only changes, changes recorded in the activity log.

## Delivery order

1. Database additions (workflows, workflow runs, security policies, webhook endpoints and deliveries, agent archived status).
2. Shared list pieces: search, filters in the URL, empty and error states, confirm dialogs.
3. Build: Agents, Knowledge, Tools, Workflows, Evals.
4. Deploy: Deployments, Environments, Telephony (phone numbers move here).
5. Operate: Live sessions, Conversations detail page, Analytics charts.
6. Manage: Usage, Providers, Team, Security, Developer webhooks.
7. Overview rebuilt from the real data above.
8. Browser test as your account: every page in light and dark, every button clicked, results checked, test records cleaned up.

## Honest limits

- Live calls, ending a live session, test calls to phone numbers, and running workflows need the hosted voice worker and connection keys. Those buttons will show a clear "voice service not connected" message instead of pretending.
- Charts show only recorded data; with no calls yet they show empty states.

## Technical details

- New routes: `/workflows/$id`, `/conversations/$id`, `/agents` filters via search params; phone number UI moves from `deployments.tsx` to `telephony.tsx`.
- Mutations through server functions in `platform.functions.ts` and new `workflows.functions.ts`, `security.functions.ts`, `webhooks.functions.ts` with `requireSupabaseAuth` and role checks; webhook signing secrets encrypted via `crypto.server.ts`.
- Charts with the existing chart component; queries keyed by workspace.
- Fix `agents.$id.tsx`: dirty compares against last saved config; `save()` returns success and `publish()` stops on failure.
- Record structural decisions in AGENTS.md; update roadmap.md.
