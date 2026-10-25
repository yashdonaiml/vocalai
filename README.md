# VocollAI

A standalone voice-agent console built with React, TanStack Start, Vite, Tailwind, Supabase, and a separate voice worker. Production builds target Node.js through Nitro.

## Local development

Use Node.js 22 or newer. Install with `bun install --frozen-lockfile`; the repository uses `bun.lock`. If `.env.local` does not exist, copy `.env.example` and fill in the settings. Preserve any existing secrets.

Run `npm run dev` and open http://127.0.0.1:3000. Server settings load from `.env.local`. Only `VITE_*` values are exposed to the browser; never prefix private keys with `VITE_`.

## Direct Supabase authentication

Email/password and Google OAuth use Supabase Auth directly. In Supabase Authentication → URL Configuration, allow `http://127.0.0.1:3000/**` and, if needed, `http://localhost:3000/**`. Set the local Site URL to your chosen origin. Signup may require email confirmation according to your project settings.

For Google login, enable the Google provider in Supabase, configure its client ID/secret there, and register the callback URL shown by Supabase with Google. The app returns to `/auth` using PKCE. No external authentication broker is required.

## Provider-backed AI features

Drafting, workflow AI checks and knowledge reranking use `src/lib/providers/registry.server.ts`. Credentials resolve from the selected workspace's organization BYOK settings first, then the platform environment.

- `CONTROL_PLANE_AI_PROVIDER`: `openai` (default), `anthropic`, or `google`.
- `CONTROL_PLANE_AI_MODEL`: optional override; otherwise the selected provider's first LLM in the catalog.
- Supply the corresponding `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GOOGLE_API_KEY`, or save a key in Models & Keys.

The console and manual agent editor work without AI keys. AI-assisted features require a configured provider. Judgment confidence is model-estimated evidence strength, not a calibrated probability.

## Production locally

Run `npm run build`, then `npm start`. The actual Node deployment is `.output/server/index.mjs`, using port 3000 by default. Configure server runtime secrets on your deployment host.

## Managed inbound calls

See [managed onboarding](docs/managed-inbound-onboarding.md) for migrations, operator credentials, pricing, provisioning recovery and test calls. Purchases stay disabled until `MANAGED_TELEPHONY_ENABLED=true` is explicitly configured. The separate worker is in `runtime/`.

General scheduler authentication uses `CRON_SECRET` and optionally `CRON_SECRET_PREVIOUS`. Telephony reconciliation uses its separate `TELEPHONY_RECONCILE_SECRET`.

## Validation and history

Run `npm test`, `npx tsc --noEmit`, and `npm run build`. Historical design notes are preserved in `docs/design-history/`; they do not configure the application.
