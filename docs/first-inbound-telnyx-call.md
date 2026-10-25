# First inbound Telnyx call

The call path is: telephone → Telnyx SIP → LiveKit Cloud → aviroh worker → AI providers. The worker uses signed HTTPS requests to the aviroh console for its bundle, credentials, transcripts and tools.

This guide covers manual development or bring-your-own-number setup. For customer number purchasing and automatic carrier configuration inside aviroh, use [managed inbound onboarding](managed-inbound-onboarding.md). Platform operators still configure and fund the carrier account once. Outbound calling and human transfer are not implemented by either inbound flow.

## 1. Apply the database migrations

Use the project's normal Supabase migration process. If the earlier migration is not applied, apply these files in order:

1. `supabase/migrations/20261017120000_gateway_runtime_bindings.sql`
2. `supabase/migrations/20261021120000_inbound_telephony.sql`

For manual setup, open the Supabase project's SQL Editor and run each unapplied file once, after all earlier repository migrations. Do not rerun an already-applied migration.

The second migration adds provisioning state, caller numbers, a phone-route tenant check, and atomic transcript-batch ingestion. Browser writes to phone routes are replaced by authenticated server functions. Deploy the updated console and worker together: the worker now sends batch IDs to `/api/public/runtime/events`.

## 2. Create the LiveKit project and set the console environment

In LiveKit Cloud, select the project that will handle the calls. Copy:

- The project WebSocket URL, such as `wss://your-project.livekit.cloud`.
- An API key and its API secret from the project's API-key settings.
- The separate SIP endpoint hostname from the project's telephony settings, such as `your-project.sip.livekit.cloud`.

The WebSocket URL and SIP hostname are different settings. Do not put the WebSocket URL in the Telnyx FQDN field.

Add the following to the **console deployment's server/runtime environment settings**, or `.env.local` for local development. They must be available to server functions, not only during the browser build.

| Variable | Value |
| --- | --- |
| `LIVEKIT_URL` | The project's `wss://` URL |
| `LIVEKIT_API_KEY` | Project API key |
| `LIVEKIT_API_SECRET` | Project API secret |
| `LIVEKIT_SIP_ENDPOINT` | SIP hostname only; no scheme or port. Shown on the Telephony page for copying to Telnyx. |
| `TELNYX_SIP_ALLOWED_ADDRESSES` | Comma-separated signaling addresses for the Telnyx inbound SIP region selected in step 4 |
| `RUNTIME_SHARED_SECRET` | A random secret of at least 32 characters, identical on console and worker |
| `PROVIDER_KEY_SECRET` | A different random secret used to encrypt saved AI keys; preserve an existing value |
| `SUPABASE_URL` | Existing Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Existing public/publishable Supabase key, used by server authentication |
| `SUPABASE_SERVICE_ROLE_KEY` | Existing server-only Supabase service key |

Configure Supabase variables in the console server environment. Keep public `VITE_*` settings separate from private server settings; private local values belong in `.env.local`.

For a **US SIP region** test, the Telnyx signaling addresses published on 2026-10-21 are:

```dotenv
TELNYX_SIP_ALLOWED_ADDRESSES=192.76.120.10/32,64.16.250.10/32
```

Verify the current addresses at [Telnyx SIP information](https://sip.telnyx.com/). For another region, use both signaling addresses from that region's row. Do not use media CIDRs in place of signaling addresses, and do not use `0.0.0.0/0`. Route provisioning refuses an empty or invalid allowlist.

Generate each random secret separately on your own computer:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Only `RUNTIME_SHARED_SECRET` is shared with the worker. Never put service-role, encryption, or LiveKit API secrets in a `VITE_*` variable. The existing `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` browser build settings remain public.

For local console development, copy the root `.env.example` to `.env.local`, replace its placeholders, and explicitly load its server environment:

```powershell
node --env-file=.env.local node_modules/vite/bin/vite.js dev
```

The deployed worker needs a public HTTPS console origin. A local-only console is not reachable from a cloud worker without a suitable HTTPS development tunnel.

## 3. Configure and start the worker

Run one always-on worker container near the LiveKit media region. It uses the **same LiveKit project** as the console. The worker registers itself as `aviroh-runtime`; that name is already set in the code.

Add these variables to the **worker deployment's runtime secrets/settings**, or copy `runtime/.env.example` to `runtime/.env.local` for a local/container test:

```dotenv
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-project-api-key
LIVEKIT_API_SECRET=your-project-api-secret
AVIROH_CONTROL_PLANE_URL=https://your-deployed-console.example.com
RUNTIME_SHARED_SECRET=exactly-the-same-value-as-the-console
```

`AVIROH_CONTROL_PLANE_URL` is an origin: no `/api`, path, credentials, query or fragment. HTTPS is required in production. HTTP localhost is allowed only for local `dev` mode.

From the repository root:

```powershell
docker build -t aviroh-runtime ./runtime
docker run --restart unless-stopped --env-file ./runtime/.env.local aviroh-runtime
```

The image uses the worker's lockfile, compiles TypeScript, and downloads plugin assets. Any failure stops the build. Confirm the worker has registered in LiveKit before calling. Restarting the console alone does not start this separate worker.

For a non-container local test, from `runtime/`:

```powershell
npm ci
npm run build
npm run download-files
npm run dev
```

`dev` and `start` load `runtime/.env.local` when that file exists. For a deployed image, inject environment variables through the host or `--env-file`; credentials are not copied into the image. Permit outbound console HTTPS and LiveKit signaling/media connectivity. LiveKit Cloud terminates carrier SIP, so do not direct Telnyx to the worker's HTTP port.

No Telnyx API key, AI provider key, or Supabase service key is required on the worker. It receives the AI credentials for each session from the console.

## 4. Configure Telnyx

Use a paid Telnyx account and a voice-capable phone number. In the Telnyx portal:

1. Open **Real-Time Communications → Voice → SIP Trunking** and create an **FQDN** SIP connection.
2. Add the exact LiveKit SIP hostname from step 2 as its destination FQDN. Use **port 5061** for TLS and select that destination for inbound routing.
3. In the connection's inbound settings, set **SIP transport protocol: TLS** and **Encrypted media: SRTP**. The aviroh-created LiveKit trunk requires encrypted media.
4. Set both **Destination number format** and **Origination number format** to **+E.164**. The registered aviroh number must match, including the leading `+`.
5. Select the **US SIP region** if using the US allowlist above. Otherwise select your region and update the allowlist to match it. Keep a compatible audio codec such as **G.711U/PCMU** enabled.
6. Assign the purchased number to this FQDN connection in the number's Voice settings. Save the connection and number settings.

An inbound-only connection is sufficient. If Telnyx's connection wizard also asks for outbound credentials/profile settings, those remain Telnyx settings; the current aviroh inbound flow does not use them.

Do not configure Telnyx Media Streams, a Voice API webhook, or SIP registration for this path. Do not put a Telnyx API key in aviroh: number purchase and carrier configuration are manual for this first call.

References: [LiveKit's Telnyx guide](https://docs.livekit.io/telephony/start/providers/telnyx/), [TLS/SRTP setup](https://docs.livekit.io/telephony/features/secure-trunking/), [Telnyx signaling addresses and regional selection](https://sip.telnyx.com/).

## 5. Configure aviroh and let it create the LiveKit route

1. Sign in as a workspace admin. Create/select a workspace and a non-production environment for the test.
2. Open **Models & Keys** (`/models`). Add keys for the providers selected by your agent. For the default composable choices, these are Deepgram, OpenAI and Cartesia. Choose a valid TTS voice ID from the TTS provider. Alternatively set the matching platform keys on the **console server**, not the worker.
3. Configure an English composable agent with a short greeting. Leave external tools and workflows off for the first audio test. Save, publish a new version, and deploy that version at **100%** to the test environment. Canary-only deployments are not selected for this inbound path.
4. Open **Telephony** (`/telephony`). Confirm the displayed SIP destination matches Telnyx. Add your number in `+E.164` format, select **Telnyx**, and select the deployed agent and its environment.
5. The console creates the LiveKit inbound trunk and individual dispatch rule. Each caller gets a separate room and a worker dispatched with the phone-route ID. Do not create a second manual trunk/rule for the same number.
6. If setup fails, the number stays saved. Correct the environment or credentials and select **Retry routing**. A retry reuses existing aviroh resources after a partial failure. If another attempt is in progress, allow it to finish; an abandoned provisioning claim expires after two minutes.

In LiveKit's Telephony dashboard, verify that the aviroh trunk contains the exact number, the selected carrier signaling allowlist, required media encryption, and a dispatch rule targeting `aviroh-runtime`. In aviroh, **Route configured** only confirms configuration; it does not prove audio quality or worker availability.

Existing numbers should also use **Retry routing** after upgrading, so the carrier allowlist and encryption settings are applied to their existing trunks.

## 6. Make the first test call

Call the Telnyx number from a normal telephone. Check all of the following:

- You hear the configured greeting.
- You and the agent can speak in both directions.
- The agent responds to a simple question and handles an interruption.
- Hanging up stops the worker session.
- **Conversations** shows the expected workspace, agent version, environment, transcript and completed status.
- The call's **Metadata** tab contains the caller number when Telnyx supplies one. Anonymous caller IDs remain empty.
- Telephony shows **Call received**. This means the control plane accepted the call, not that the audio test passed.

After that passes, add knowledge retrieval, a read-only tool, and finally a sandbox action with confirmation/denial. Confirmation-required actions currently require English composable mode; native realtime mode blocks them.

## Troubleshooting

| Symptom | First check |
| --- | --- |
| Number cannot be added/rerouted | Workspace admin role, matching workspace agent/environment, latest database migration |
| Route configuration fails | Console LiveKit key/secret/project URL and valid `TELNYX_SIP_ALLOWED_ADDRESSES`; use LiveKit logs for provider details |
| Call has no matching trunk | Telnyx number assignment, exact SIP hostname, and matching `+E.164` destination format |
| SIP access denied | The Telnyx inbound SIP region must match both signaling addresses allowed on the LiveKit trunk |
| TLS/media negotiation fails | FQDN port 5061, TLS and SRTP enabled in Telnyx, matching encryption on the LiveKit trunk |
| Call rings but no agent answers | Worker online in the same project, dispatch name `aviroh-runtime`, valid 100% deployment |
| Worker cannot open a session | Public HTTPS console origin, provider keys, applied migrations, ready phone route |
| Runtime HTTP 401 | Identical shared secrets and synchronized host clocks; requests expire after 60 seconds |
| One-way/no audio | LiveKit call diagnostics, carrier codec/media negotiation, worker media connectivity |
| Transcript delivery pending | Console availability and `ingest_runtime_events` migration; failed batches retry without duplicating committed turns |

Automated tests cover routing, provisioning recovery, caller selection/disconnects, event retry behavior and database transactions. A real Telnyx/LiveKit call is still required to establish end-to-end operation.
