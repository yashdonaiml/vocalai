# Managed inbound onboarding

Customers use **Telephony and channels** in aviroh to choose a deployed agent, search US local numbers, accept a price, purchase a number, and test it. They do not need accounts or credentials at either infrastructure provider. The advanced bring-your-own-number flow remains available separately.

## Operator setup

1. Apply all earlier migrations, then `supabase/migrations/20261022120000_managed_inbound.sql`. Deploy the updated console. Continue running the existing voice worker; its protocol is unchanged by this feature.
2. Finish the platform's LiveKit setup described in [the first-call guide](first-inbound-telnyx-call.md). Keep `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_SIP_ENDPOINT`, `RUNTIME_SHARED_SECRET`, and the provider-encryption/Supabase settings in the console's server environment. The worker retains its own three LiveKit values, matching runtime shared secret and console origin.
3. Complete the platform Telnyx account verification/billing setup and fund it. Create a server API key with the permissions needed for number search/orders, phone numbers, FQDN connections and FQDNs. Store it as `TELNYX_API_KEY` on the **console server**, never the browser or worker. Customers use this platform account through aviroh's tenant-scoped backend.
4. Set `TELNYX_SIP_ALLOWED_ADDRESSES` to the US signaling addresses for this initial US-only integration. The current documented values are `192.76.120.10/32,64.16.250.10/32`; verify them at [Telnyx SIP information](https://sip.telnyx.com/). The adapter explicitly selects the US signaling region.
5. Confirm your LiveKit project permits inbound trunk source-address restrictions. [LiveKit's SIP API documentation](https://docs.livekit.io/reference/telephony/sip-api/) notes this feature may require project enablement through support. Do not remove the allowlist as a workaround.
6. Choose customer prices and configure all three decimal USD values below. These are commercial choices, not default prices. The search only offers numbers whose current carrier setup/rental costs fit the approved customer prices. The carrier price is checked again before ordering.

   ```dotenv
   MANAGED_NUMBER_MONTHLY_USD=<monthly number rental>
   MANAGED_NUMBER_SETUP_USD=<one-time setup charge; 0 is allowed>
   MANAGED_INBOUND_USD_PER_MINUTE=<inbound per-minute price>
   MANAGED_NUMBER_LIMIT_PER_WORKSPACE=1
   ```

   Numbers and call usage are recorded in an accounting ledger. **This feature does not collect card payments, issue tax invoices, or debit a prepaid wallet.** Arrange invoiced billing for a controlled rollout, or integrate payment collection before opening paid self-service signup. Carrier charges are payable by the platform regardless of customer collection. Set the inbound price to cover the service you intend to include; configure platform AI keys through the existing provider registry if customers should not supply their own AI keys.

7. Set `TELEPHONY_RECONCILE_SECRET` to a different random secret of at least 32 characters. Schedule an HTTPS **POST** to `/api/public/telephony/reconcile` every minute or another suitable short interval, with `Authorization: Bearer <TELEPHONY_RECONCILE_SECRET>`. Use your hosting provider's scheduler with a request duration sufficient for carrier operations. The endpoint processes up to 20 oldest orders per run, including rental accrual for ready numbers. Monitor its status and returned failure count.
8. Set `MANAGED_TELEPHONY_ENABLED=true` to enable new managed purchases. Disabling it blocks new purchases; existing orders still reconcile, numbers can still be released, and ready-number rental accounting continues. A purchase intent already durably submitted is reconciled rather than replaced.

For local development, add these settings to the root `.env.local`. For hosted deployment, put them in the console host's server runtime secrets. The checked-in `.env.example` lists placeholders. Existing privately saved credentials are not changed by this implementation.

No manual per-number Telnyx connection or LiveKit trunk creation is needed. The backend creates one dedicated TLS/SRTP FQDN connection per order, configures its SIP destination, buys the number onto that connection, and provisions the existing media routing adapter. It creates no outbound calling profile.

API contract references: [number search SDK](https://github.com/team-telnyx/telnyx-node/blob/master/src/resources/available-phone-numbers.ts), [number orders SDK](https://github.com/team-telnyx/telnyx-node/blob/master/src/resources/number-orders.ts), [FQDN connections SDK](https://github.com/team-telnyx/telnyx-node/blob/master/src/resources/fqdn-connections/fqdn-connections.ts), [secure trunking](https://docs.livekit.io/telephony/features/secure-trunking/).

## Customer flow

1. Create an agent, publish it, and deploy a version at 100% to the intended environment. Production eval gates still apply. The server checks that the deployed bundle's AI credentials can be resolved before purchasing.
2. Open **Telephony and channels**, select that deployment and optionally enter a US area code. Search available voice-enabled local numbers.
3. Select a number, review its setup, monthly and inbound usage prices, accept the charges, and select **Get number and connect agent**. Quotes expire after five minutes. A quote is not a reservation of carrier inventory.
4. Follow the progress card. **Check setup** resumes recoverable provisioning. Activation may take longer than a single request. Unknown order responses are held for reconciliation; clicking again never intentionally places a replacement paid order.
5. When ready, select **Start test call**, dial the displayed number from a telephone, speak with the agent, and hang up. aviroh checks for a saved completed PSTN conversation and nonempty caller/assistant transcript turns after the test started. Then confirm **Yes, I heard the agent**. This human confirmation is necessary because a transcript alone does not prove audible playback.
6. Review the saved conversation. Changing the agent/environment or its deployment invalidates the verification. Repeat the test for the new assignment.
7. Use **Release number** to stop calls and give up the number. This is permanent and explicitly confirmed. Rental accrual stops at confirmed carrier release; cleanup can be retried without repeating the release. Existing charges remain recorded. Requests that have not submitted a purchase can be cancelled from the same card.

## State, isolation and recovery

- Quotes, orders, tests and charges carry `workspace_id`; browser access is read-only with workspace membership RLS. Purchases, release, assignment and verification require workspace admin authorization on the server.
- A transactional workspace lock binds an immutable quote to a request key, enforces the number limit, and reserves a unique live number. Replays cannot change the assignment or quote. Managed assignment is transactional with order readiness and deployment checks.
- Provisioning uses five-minute leases. Remote resource names are deterministic. Intent is persisted before the paid number-order POST. After submission, subsequent requests only look up the order using its exact customer reference and validate its phone number and connection.
- A timeout with no discoverable matching order stays in review. Operations staff must investigate it using the platform carrier account; the system does not infer that a timed-out purchase failed and issue another one.
- A carrier order requiring additional regulatory verification displays a support state. US local numbers are the initial supported scope; international numbers and an in-app document-submission/KYC workflow are not implemented.
- Billing records setup/first month, calendar-month rental anniversaries, and completed/failed inbound-call duration at the accepted quote's usage rate. Unique keys prevent repeated charges. A trigger commits call usage with conversation completion. This ledger records assessed charges, not payment or refunds.
- The scheduler is required for progress after a customer leaves the page and for recurring rental accounting. Do not rely on browser polling as the production job runner.

## Validation and rollout

The automated tests cover real PostgreSQL permissions/RLS, quote expiry, tenant mismatch, deployment gates, quota and request replay, rental/usage deduplication, transcript-backed verification, assignment invalidation, provisioning leases, lost order responses, partial routing failures, release recovery and the carrier adapter's TLS/SRTP contract.

Before enabling real customer purchases, run a controlled purchase and inbound call with the platform's funded Telnyx account and deployed worker. Confirm the carrier's current API responses, correct agent audio, transcript persistence, accounting entries, scheduled recovery and final release. This implementation has not itself purchased a live number, deployed the services or completed a real phone call.
