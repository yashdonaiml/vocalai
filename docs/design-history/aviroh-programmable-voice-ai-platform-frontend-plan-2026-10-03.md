# aviroh programmable voice AI platform frontend plan

## Product position

Build aviroh as an enterprise-capable, SMB-friendly programmable voice AI platform with a first-party no-code builder. It is not a restaurant product and not only an agent builder.

The same core resources will support:

- Businesses operating voice agents for their own teams
- Developers integrating through APIs, webhooks, and SDKs
- Enterprise administrators governing access, providers, data, and spending
- Operations teams monitoring production conversations and failures
- Future agencies and software vendors serving their own customers

Partner and multi-customer management will be supported by the foundation now, then built after the core MVP. A full reseller or white-label console is not part of the first release.

## Product principles

- Managed AI and telephony defaults should make first use simple, with BYO providers available where supported.
- Inbound and individual outbound calling belong in the core lifecycle. Campaign orchestration stays separate from realtime call execution.
- aviroh integrates with contact centers rather than trying to replace a full contact center in the MVP.
- The no-code console and developer interfaces must operate on the same resources and lifecycle.
- Agent behavior, telephony ownership, deployment state, session execution, metering, and billing remain separate domains.
- Customer permissions, production state, provider credentials, and commercial rules remain server-authoritative.
- Marketing examples will cover multiple industries and jobs. Restaurants may appear as one example, never as the default product identity.

## Application surfaces

### Release 1 surfaces

1. Public website for product, use cases, industries, enterprise, security, pricing approach, documentation entry, demo, and signup.
2. Unified customer console for agent building, operations, organization administration, and developer settings.
3. Minimal isolated internal operations console for platform health and controlled support workflows.
4. Developer quickstart and authenticated API and webhook operations.
5. Narrow embedded voice demo with scoped access.

### Later surfaces

- Full partner and agency console
- Expanded documentation site
- Branded embedded experiences
- Advanced internal finance, security, and fleet operations

## Customer console structure

Organize the sidebar around user intent:

1. Home
   - Overview
   - Activity and alerts
2. Build
   - Agents
   - Knowledge
   - Tools and Integrations
   - Workflows
   - Evaluations
3. Deploy
   - Deployments
   - Environments
   - Telephony and Channels
4. Operate
   - Live Sessions
   - Conversations
   - Analytics
5. Manage
   - Usage and Billing
   - Providers
   - Team and Roles
   - Security
   - Audit
   - Settings
   - Developer

Add organization, workspace, and environment selection to the shell. Keep sensible defaults for small teams, but make the active context explicit and safely switchable for larger organizations.

## Phase 1: Remove vertical bias and align the public experience

- Replace remaining restaurant-first navigation, imagery, booking language, front-desk defaults, and onboarding examples with platform-wide language.
- Present the product lifecycle as Build, Test, Publish, Deploy, Operate, and Improve.
- Create separate pages for Product, Use Cases, Industries, Enterprise, Integrations, Security, Pricing, and Developer Quickstart.
- Cover use cases such as customer support, appointment coordination, lead qualification, order status, dispatch, internal help desk, and service intake.
- Represent healthcare administration, financial services, property services, logistics, field services, retail, hospitality, and professional services without implying one vertical is primary.
- Avoid unsupported customer claims, public prices, performance figures, compliance promises, or infrastructure availability.

## Phase 2: Expose the platform hierarchy

- Add organization, workspace, and environment selectors.
- Make workspace-owned resources and environment-targeted deployments visually distinct.
- Scope cached data and navigation state to the active tenant context.
- Cancel or isolate old requests, subscriptions, and local state when context changes.
- Preserve flat public URLs where appropriate, while giving every resource a stable directly addressable page.
- Prepare the identity model for future delegated partner access without exposing a partner console yet.

## Phase 3: Complete the agent lifecycle

### Agent inventory

- Add search, filtering, lifecycle status, deployed environments, version visibility, and template-based creation.
- Use job-based templates rather than industry-locked agents.
- Add duplicate and archive only when the underlying actions are implemented.

### Agent studio

Replace the current long form with modular tabs:

- General
- Conversation
- Voice and AI
- Knowledge
- Tools
- Policies
- Advanced
- Test
- Versions

Preserve the current model:

```text
Agent
  -> Editable draft
  -> Immutable published version
  -> Compiled deployment configuration
  -> Environment deployment
  -> Runtime session
```

The editor will make unsaved state, validation, publish readiness, current version, and deployment destinations clear. Provider and voice fields will remain capability-aware and vendor-neutral.

### Testing studio

- Select a draft or published version.
- Show microphone, connecting, ready, listening, processing, speaking, interrupted, reconnecting, failed, timed out, ending, and completed states.
- Show live transcript, tool activity, sanitized diagnostics, and timing information.
- Provide clear retry, reconnect, restart, and stop actions.
- Keep orchestration, policy enforcement, tools, and usage authoritative in the separate runtime.

## Phase 4: Separate deployment, telephony, and realtime operations

### Deployments

- Show agent version, environment, runtime profile, status, provider references, history, failures, and rollback.
- Represent long-running deployment actions as queued, running, succeeded, failed, or canceled.
- Keep deployment compilation explicit so runtime sessions consume a reproducible bundle.

### Telephony and channels

Move phone configuration out of the current combined Deployments page and model the chain clearly:

```text
Provider account
  -> Phone number or caller identity
  -> SIP trunk or channel connection
  -> Routing binding
  -> Deployment
  -> Media session
  -> Conversation
```

The frontend will support inbound routing and individual outbound initiation where the infrastructure allows it. It will show carrier, country, capability, routing, connection, and diagnostic state without claiming unsupported provisioning, portability, emergency calling, or geographic coverage.

### Live sessions and conversations

- Add a Live Sessions page for permitted operational metadata, state, duration, channel, deployment, transfer state, and health.
- Expand Conversations into stable detail pages with Summary, Transcript, Timeline, Tools, AI Operations, Performance, Usage, Recording, and Metadata tabs when the corresponding data exists.
- Keep transcript, recording, and live-monitoring access separately permissioned.
- Link each conversation to the exact agent version and deployment that produced it.

## Phase 5: Analytics, evaluations, and business outcomes

Separate analytics into:

- Operational: availability, failures, latency, provider behavior, concurrency, and runtime health
- AI quality: task success, tool correctness, evaluations, regressions, and policy signals
- Business outcomes: customer-defined results such as appointments, qualified leads, resolutions, or completed workflows

Add filters for organization, workspace, environment, agent, deployment, version, provider, channel, and date. Do not collapse these into one generic performance score. Label estimates, partial data, reconciled usage, and invoices distinctly.

Keep evaluations linked to a specific version and dataset. Automated promotion gates remain unavailable until the hosted runner enforces them.

## Phase 6: Organization, developer, and commercial controls

### Organization administration

- Members, invitations, teams, roles, and workspace access
- Provider connections and capability status
- Recording, consent, retention, deletion, and sensitive-data policies
- Audit events and session history
- API credentials and service accounts
- Support-access policy controls

Start with the existing owner, admin, and member foundation. Add finer permissions only with corresponding server and database enforcement.

### Developer platform

- Public quickstart and API concepts
- Authenticated API key and webhook operations
- Event catalogue and request logs
- Tool development and integration testing
- Shared resource names and lifecycle with the no-code console

### Usage and commercial safeguards

- Break down usage by agent, deployment, conversation, provider capability, telephony, tool execution, and environment.
- Separate platform-managed provider costs from customer BYOK usage.
- Add budget, quota, spending-limit, and fraud or abuse states before presenting managed usage as generally available.
- Do not present estimated provider costs as final third-party charges.
- Leave subscriptions, invoices, credits, margins, and reseller billing out of the first implementation until commercial rules are supplied.

## Phase 7: Internal operations boundary

Create a separately protected internal surface with no inherited customer access. The first version will include:

- Platform health and active incidents
- Organization lookup with redacted summaries
- Provider, runtime, and telephony health
- Controlled support-access requests
- Internal action audit history

Customer secrets never appear in this surface. Any future support access must be scoped, time-limited, justified, auditable, and server-authorized. High-risk operations require more than a confirmation dialog.

## Shared interaction and visual system

Extend the current aviroh card system into reusable patterns for:

- Searchable, filterable resource lists
- Resource headers, tabs, status, metadata, and activity
- Creation, validation, review, and completion flows
- Draft, publish, deploy, compare, and rollback
- Async operation progress and recovery
- Permission errors, partial data, stale data, and connectivity loss
- Transcript, timeline, audio, tool trace, usage chart, provider picker, and version comparison

Retain the chosen neutral and forest-green palette, light and dark themes, rounded card language, Inter typography, and Geist Mono for technical values. Marketing can remain expressive and image-led. Operational screens will be denser, quieter, and minimally animated.

## Technical and safety boundaries

- Keep public marketing, customer operations, and privileged internal operations as separate route and security boundaries.
- Keep domain state modular rather than placing all state in one global store.
- Use the URL for shareable filters and selected tabs where useful.
- Standardize structured errors, correlation identifiers, pagination, async operations, and recovery states.
- Keep provider credentials and privileged operations out of browser code.
- Treat the browser voice experience as a media client, not the authoritative runtime.
- Integrate with contact centers through explicit adapters and tools. Do not reproduce their full workforce or routing suites in MVP.
- Design toward WCAG 2.2 AA with keyboard support, visible focus, readable status updates, and no color-only meaning.
- Support mobile for overview, lists, testing, conversations, and usage. Keep advanced editors and trace tools simplified or read-only on small screens.

## Delivery sequence

1. Remove restaurant-first positioning and restructure the public site for a multi-industry platform.
2. Reorganize the console navigation and add organization, workspace, and environment context.
3. Rebuild Agents and the agent studio around the complete draft-to-session lifecycle.
4. Split Deployments and Telephony, then add Live Sessions and conversation details.
5. Expand Analytics, Evaluations, Usage, Providers, Team, Security, and Audit.
6. Add the developer quickstart, API operations, and scoped embedded demo.
7. Add the minimal isolated internal operations surface.
8. Verify roles, tenant switching, critical workflows, accessibility, mobile layouts, and failure recovery.

## Explicitly deferred

- Full agency, reseller, and white-label console
- Nested customer tenancy or delegated commercial ownership UI
- Campaign scheduling and bulk outbound orchestration
- Visual workflow canvas
- Advanced simulations and enforced deployment gates
- Enterprise SSO and automated identity provisioning
- Native supervisor intervention and human-agent desktop
- Dedicated or regional runtime administration
- Full billing, entitlements, invoicing, credits, and margin automation
- Advanced internal finance, security investigation, and fleet controls

These remain planned extension points, not visible promises.

## Acceptance criteria

- No screen frames aviroh as restaurant software or assumes one company, one workspace, or one environment.
- A new customer can understand the lifecycle from agent creation through testing, publishing, deployment, and review.
- Organization, workspace, and environment context is always clear, and tenant data cannot remain visible after switching context.
- Telephony, agent behavior, deployments, sessions, usage, and billing appear as separate but connected resources.
- The no-code console and developer surfaces use the same product concepts.
- Every implemented action includes accurate loading, success, empty, permission, and failure states.
- Unsupported infrastructure and future capabilities are labeled honestly.
- Public content, metadata, examples, and imagery remain multi-industry and consistent with the aviroh name and visual system.
- Core routes work on desktop and mobile, use keyboard-accessible controls, and pass build and browser checks.
