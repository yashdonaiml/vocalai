# Clean product copy across the whole app

Goal: every heading, description, button, empty state and message reads as plain product copy. It should say what the page does or what the user can do there. No design reasoning, no internal engineering terms, no defensive promises.

## Copy rules

- One short sentence per page description. State what the page is for.
- Use words a business user knows. Drop internal terms: "immutable", "checksummed runtime bundle", "ledger", "embed", "runtime", "voice worker", "data-plane", "append-only".
- No design reasoning ("without hiding them behind one score") and no claims about speed ("in milliseconds").
- Security notes go in one short helper line, not the headline.
- Empty states follow one pattern: what is missing, then the next step ("No calls yet. Deploy an agent to start taking calls.").
- Errors say what happened and what to do. Never show raw technical messages.
- Buttons are verb first ("Add key", "Run suite").
- Existing rules still apply: no em or en dashes, no ellipses, "aviroh" always lowercase.

## Examples

| Page | Now | New |
|---|---|---|
| Analytics | Three separate views of performance, without hiding them behind one score. | Call volume, quality scores and outcomes for your agents. |
| Deployments | Each deployment pins an immutable version as a checksummed runtime bundle... | Choose which agent version runs in each environment. Roll back anytime. |
| Usage | Every metered unit is recorded in a workspace ledger... | What your agents used, by agent, provider and date. Estimates, not provider bills. |
| Knowledge | We split, embed and index them so agents can retrieve facts in milliseconds. | Add documents your agents can answer from. |
| Tools | HTTPS webhooks agents can call mid-conversation... | Connect your systems so agents can look things up or take action during a call. |
| Environments | Keep development and production targets explicit... | Separate places to test and run your agents. |
| Evals | ...Automated scoring and promotion gates require a connected runtime. | Test your agents against real scenarios before going live. |
| Telephony | Connect caller identities to an agent, environment, and voice route. | Phone numbers and which agent answers each one. |

## Scope

1. Console pages (all 18 areas) plus agent editor and conversation detail: headings, descriptions, section titles, empty states, buttons, toasts, dialogs.
2. "Voice service not connected" notices: one consistent friendly message everywhere.
3. Sign-in, onboarding, and the public site (landing, pricing, demo): tone check, remove any jargon.
4. Internal staff console: lighter pass, keep precise wording staff need.
5. Page titles and share descriptions updated to match.

Only text changes. No layout, color, or behavior changes.

## Technical details

- Edit string literals in `src/routes/**`, `src/components/app-shell.tsx`, `src/components/landing/sections.tsx`, `src/components/site-nav.tsx`, `src/components/agent-runtime.tsx`.
- Map raw server error messages to friendly toasts where they surface directly.
- Save the copy rules to project memory so future pages follow them.
- Verify with a grep for banned terms and dashes, then a quick browser pass.
