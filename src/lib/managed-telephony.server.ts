import type { ManagedOrder } from "./managed-telephony.types";
import { normalizeConfig } from "./agent-config";
import * as carrier from "./telephony/telnyx.server";

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}
function price(name: string) {
  const value = process.env[name];
  if (!value || !/^\d{1,5}(\.\d{1,2})?$/.test(value))
    throw new Error("Managed number pricing is not configured.");
  return carrier.cents(value);
}

export async function managedSetup() {
  const infrastructure = (await import("./runtime/livekit.server")).phoneServiceSetup();
  let pricing = false;
  try {
    price("MANAGED_NUMBER_MONTHLY_USD");
    price("MANAGED_NUMBER_SETUP_USD");
    pricing =
      /^\d{1,3}(\.\d{1,6})?$/.test(process.env["MANAGED_INBOUND_USD_PER_MINUTE"] ?? "") &&
      Number(process.env["MANAGED_INBOUND_USD_PER_MINUTE"]) <= 100;
  } catch {
    /* operator setup pending */
  }
  return {
    available:
      process.env["MANAGED_TELEPHONY_ENABLED"] === "true" &&
      Boolean(process.env["TELNYX_API_KEY"]) &&
      infrastructure.mediaConfigured &&
      infrastructure.runtimeConfigured &&
      infrastructure.telnyxAllowed &&
      Boolean(infrastructure.sipEndpoint) &&
      pricing,
    country: "US",
    currency: "USD",
  };
}

async function requireSetup() {
  if (!(await managedSetup()).available)
    throw new Error(
      "Managed phone numbers are being set up. Contact support to enable inbound calling.",
    );
}

export async function requireInboundDeployment(
  workspaceId: string,
  agentId: string,
  environmentId: string,
) {
  await (
    await import("./telephony.server")
  ).validatePhoneRoute(workspaceId, agentId, environmentId);
  const db = await admin();
  const { data: deployment, error } = await db
    .from("deployments")
    .select("agent_version, bundle_id")
    .eq("workspace_id", workspaceId)
    .eq("agent_id", agentId)
    .eq("environment_id", environmentId)
    .eq("status", "active")
    .eq("canary_percent", 100)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !deployment?.bundle_id)
    throw new Error("Publish and deploy this agent at 100% to the selected environment first.");
  const [{ data: bundle }, { data: ws }] = await Promise.all([
    db
      .from("runtime_bundles")
      .select("bundle")
      .eq("id", deployment.bundle_id)
      .eq("workspace_id", workspaceId)
      .eq("agent_id", agentId)
      .eq("environment_id", environmentId)
      .eq("agent_version", deployment.agent_version)
      .single(),
    db.from("workspaces").select("org_id").eq("id", workspaceId).single(),
  ]);
  if (!bundle || !ws) throw new Error("The deployed agent is not ready. Check its deployment.");
  try {
    await (
      await import("./runtime/bundle.server")
    ).bundleCredentials(ws.org_id, normalizeConfig(bundle.bundle).runtime);
  } catch {
    throw new Error(
      "Add the AI provider keys required by this agent in Models & Keys before setting up its phone number.",
    );
  }
  return deployment;
}

export async function searchManagedNumbers(workspaceId: string, areaCode?: string) {
  await requireSetup();
  const db = await admin();
  const monthly = price("MANAGED_NUMBER_MONTHLY_USD"),
    setup = price("MANAGED_NUMBER_SETUP_USD");
  const available = (await carrier.searchNumbers(areaCode)).filter(
    (n) => n.monthlyCents <= monthly && n.setupCents <= setup,
  );
  if (!available.length) return [];
  const { data, error } = await db
    .from("managed_number_quotes")
    .insert(
      available.map((n) => ({
        workspace_id: workspaceId,
        e164: n.e164,
        monthly_cents: monthly,
        setup_cents: setup,
        carrier_monthly_cents: n.monthlyCents,
        carrier_setup_cents: n.setupCents,
        inbound_rate: process.env["MANAGED_INBOUND_USD_PER_MINUTE"]!,
      })),
    )
    .select("id, e164, monthly_cents, setup_cents, inbound_rate, currency, expires_at");
  if (error || !data) throw new Error("Could not prepare number pricing. Search again.");
  return data.map((q) => ({
    ...q,
    locality: available.find((n) => n.e164 === q.e164)?.locality ?? "United States",
  }));
}

export async function purchaseManagedNumber(input: {
  workspaceId: string;
  quoteId: string;
  agentId: string;
  environmentId: string;
  requestId: string;
}) {
  await requireSetup();
  await requireInboundDeployment(input.workspaceId, input.agentId, input.environmentId);
  const db = await admin();
  // The DB binds an immutable quote to a request key, validates tenancy, and enforces the quota under a workspace lock.
  const { data: id, error } = await db.rpc("reserve_managed_number", {
    _workspace: input.workspaceId,
    _quote: input.quoteId,
    _agent: input.agentId,
    _environment: input.environmentId,
    _request: input.requestId,
    _limit: Math.min(
      20,
      Math.max(
        1,
        Number.parseInt(process.env["MANAGED_NUMBER_LIMIT_PER_WORKSPACE"] ?? "1", 10) || 1,
      ),
    ),
  });
  if (error || !id)
    throw new Error(
      "Could not reserve this number. Your quote may have expired, the number may already be assigned, or your workspace number limit was reached. Refresh numbers or contact support.",
    );
  await advanceManagedOrder(input.workspaceId, id);
  return { orderId: id };
}

async function orderRows(workspaceId: string, orderId: string) {
  const db = await admin();
  const { data: order, error } = await db
    .from("managed_number_orders")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", orderId)
    .single();
  if (error || !order) throw new Error("Number order not found in this workspace.");
  const [{ data: number }, { data: quote }] = await Promise.all([
    db
      .from("phone_numbers")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", order.number_id)
      .single(),
    db
      .from("managed_number_quotes")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", order.quote_id)
      .single(),
  ]);
  if (!number || !quote || number.e164 !== quote.e164 || number.management_mode !== "managed")
    throw new Error("Number order needs support review.");
  return { db, order, number, quote };
}

export async function advanceManagedOrder(workspaceId: string, orderId: string) {
  const { db, order, number, quote } = await orderRows(workspaceId, orderId);
  if (["released", "failed"].includes(order.state)) return;
  const token = crypto.randomUUID();
  const { data: claimed, error: claimError } = await db
    .from("managed_number_orders")
    .update({
      lease_token: token,
      lease_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", workspaceId)
    .eq("id", orderId)
    .or(`lease_at.is.null,lease_at.lt.${new Date(Date.now() - 300_000).toISOString()}`)
    .select("*")
    .maybeSingle();
  if (claimError) throw new Error("Could not check number setup. Try again.");
  if (!claimed) return;
  // The UPDATE returns the current row. Never act on the pre-claim snapshot: another
  // request may have completed a paid order between our read and lease acquisition.
  Object.assign(order, claimed);
  async function save(patch: Partial<ManagedOrder>) {
    const { data, error } = await db
      .from("managed_number_orders")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("workspace_id", workspaceId)
      .eq("id", orderId)
      .eq("lease_token", token)
      .select("id")
      .maybeSingle();
    if (error || !data) throw new Error("Could not save number setup progress.");
    Object.assign(order, patch);
  }
  try {
    if (["released", "failed"].includes(order.state)) return;
    if (order.state === "releasing") {
      await finishRelease(order, number, save);
      return;
    }
    if (order.state === "ready") {
      const { error } = await db.rpc("accrue_managed_number_charges", { _order: orderId });
      if (error) throw new Error("Could not record number charges.");
      return;
    }
    if (!order.submitted_at) {
      await requireSetup();
      await requireInboundDeployment(workspaceId, number.agent_id!, number.environment_id!);
      // Recheck availability and ensure carrier costs still fit the price the customer accepted.
      const current = (await carrier.searchNumbers(undefined, number.e164))[0];
      if (
        !current ||
        current.monthlyCents > quote.monthly_cents ||
        current.setupCents > quote.setup_cents
      ) {
        await save({
          state: "failed",
          error:
            "This number or its price is no longer available. Contact support or choose another number.",
        });
        const { error } = await db
          .from("phone_numbers")
          .update({ status: "released" })
          .eq("workspace_id", workspaceId)
          .eq("id", number.id);
        if (error) throw new Error("Could not clear the unavailable number.");
        return;
      }
      const connection = await carrier.ensureConnection(
        orderId,
        (await import("./runtime/livekit.server")).phoneServiceSetup().sipEndpoint,
      );
      await save({ connection_ref: connection });
      // Persist intent BEFORE the paid POST. Once intent is stored, retries only reconcile.
      await save({ state: "ordering", submitted_at: new Date().toISOString(), error: null });
      try {
        const result = await carrier.submitNumberOrder(orderId, number.e164, connection);
        await save({ carrier_order_ref: result.id, state: "activation" });
      } catch {
        await save({
          state: "review",
          error:
            "We are confirming your number purchase. Check status again; another order will not be placed.",
        });
        return;
      }
    }
    const remote = await carrier.findNumberOrder(orderId, number.e164, order.carrier_order_ref);
    if (!remote) {
      await save({
        state: "review",
        error:
          "Your purchase response is still unconfirmed. Check status again or contact support. We will not place a duplicate order.",
      });
      return;
    }
    if (remote.connection_id !== order.connection_ref)
      throw new Error("Number order routing does not match.");
    await save({ carrier_order_ref: remote.id });
    if (remote.status === "failure" || remote.phone_numbers?.some((n) => n.status === "failure")) {
      await save({
        state: "failed",
        error: "The number purchase was declined. Contact support before trying another number.",
      });
      return;
    }
    if (
      remote.requirements_met === false ||
      remote.phone_numbers?.some((n) => n.requirements_met === false)
    ) {
      await save({
        state: "review",
        error:
          "This number needs additional verification. Contact aviroh support; no carrier account is required.",
      });
      return;
    }
    if (remote.status !== "success") {
      await save({ state: "activation", error: null });
      return;
    }
    const owned = await carrier.findOwnedNumber(number.e164, order.connection_ref!);
    if (!owned || owned.status !== "active") {
      await save({ state: "activation", error: null });
      return;
    }
    await save({
      carrier_number_ref: owned.id,
      activated_at: order.activated_at ?? new Date().toISOString(),
      state: "routing",
      error: null,
    });
    const { error: billingError } = await db.rpc("accrue_managed_number_charges", {
      _order: orderId,
    });
    if (billingError) throw new Error("Could not record number charges.");
    const routed = await (
      await import("./telephony.server")
    ).provisionPhoneNumber(workspaceId, number.id);
    if (!routed.provisioned) throw new Error("Routing is pending.");
    await save({ state: "ready", error: null });
  } catch {
    const releasing = order.state === "releasing";
    await save({
      state: releasing ? "releasing" : order.state === "ready" ? "ready" : "error",
      error: releasing
        ? "Number release is pending. Check status again or contact support."
        : "Number setup needs another attempt. Check status again or contact aviroh support.",
    });
  } finally {
    const { error } = await db
      .from("managed_number_orders")
      .update({ lease_token: null, lease_at: null })
      .eq("workspace_id", workspaceId)
      .eq("id", orderId)
      .eq("lease_token", token);
    if (error) console.error("Managed number lease cleanup failed; lease will expire.");
  }
}

async function finishRelease(
  order: ManagedOrder,
  number: { id: string; e164: string; dispatch_rule_ref: string | null },
  save: (patch: Partial<ManagedOrder>) => Promise<void>,
) {
  const db = await admin();
  if (order.submitted_at && (!order.carrier_number_ref || !order.connection_ref))
    throw new Error("Number ownership must be confirmed before release.");
  const { error } = await db
    .from("phone_numbers")
    .update({ status: "removing", verified_at: null })
    .eq("workspace_id", order.workspace_id)
    .eq("id", number.id);
  if (error) throw new Error("Could not disable number.");
  // Record any due rental before ending ownership.
  const { error: billingError } = await db.rpc("accrue_managed_number_charges", {
    _order: order.id,
  });
  if (billingError) throw new Error("Could not record number charges.");
  if (order.submitted_at && !order.carrier_released_at) {
    await carrier.releaseNumber(order.carrier_number_ref!, number.e164, order.connection_ref!);
    await save({ carrier_released_at: new Date().toISOString() });
  }
  if (order.submitted_at || number.dispatch_rule_ref) {
    await (
      await import("./runtime/livekit.server")
    ).removeInboundNumber({
      numberId: number.id,
      e164: number.e164,
      ruleRef: number.dispatch_rule_ref,
    });
  }
  if (order.connection_ref) await carrier.removeConnection(order.connection_ref, order.id);
  const { error: updateError } = await db
    .from("phone_numbers")
    .update({ status: "released", sip_trunk_ref: null, dispatch_rule_ref: null })
    .eq("workspace_id", order.workspace_id)
    .eq("id", number.id);
  if (updateError) throw new Error("Could not save number release.");
  await save({ state: "released", error: null });
}

export async function releaseManagedNumber(workspaceId: string, orderId: string) {
  const { db, order } = await orderRows(workspaceId, orderId);
  if (order.state === "released") return;
  if (order.submitted_at && (!order.carrier_number_ref || !order.connection_ref))
    throw new Error(
      "Wait for number ownership to be confirmed, or contact support to resolve this purchase.",
    );
  const { data, error } = await db
    .from("managed_number_orders")
    .update({ state: "releasing", updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("id", orderId)
    .eq("state", order.state)
    .or(order.submitted_at ? `submitted_at.eq.${order.submitted_at}` : "submitted_at.is.null")
    .or(`lease_at.is.null,lease_at.lt.${new Date(Date.now() - 300_000).toISOString()}`)
    .select("id")
    .maybeSingle();
  if (error || !data) throw new Error("Number setup is still running. Try again later.");
  await advanceManagedOrder(workspaceId, orderId);
}

export async function managedOverview(workspaceId: string) {
  const db = await admin();
  const [
    { data: orders, error },
    { data: charges, error: chargeError },
    { data: callCharges, error: callChargeError },
  ] = await Promise.all([
    db
      .from("managed_number_orders")
      .select("id, number_id, quote_id, state, error, created_at, carrier_number_ref, submitted_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false }),
    db.from("managed_number_charges").select("amount_cents").eq("workspace_id", workspaceId),
    db.from("managed_call_charges").select("amount_cents").eq("workspace_id", workspaceId),
  ]);
  if (error || chargeError || callChargeError) throw new Error("Could not load managed numbers.");
  const { data: quotes, error: quoteError } = orders?.length
    ? await db
        .from("managed_number_quotes")
        .select("id, monthly_cents, setup_cents, inbound_rate, currency")
        .eq("workspace_id", workspaceId)
        .in(
          "id",
          orders.map((o) => o.quote_id),
        )
    : { data: [], error: null };
  if (quoteError) throw new Error("Could not load number pricing.");
  return {
    setup: await managedSetup(),
    orders: (orders ?? []).map(({ carrier_number_ref, submitted_at, ...o }) => ({
      ...o,
      canRelease: Boolean(carrier_number_ref) || !submitted_at,
      cancelOnly: !submitted_at,
      price: quotes?.find((q) => q.id === o.quote_id),
    })),
    accruedNumberCents: (charges ?? []).reduce((sum, c) => sum + c.amount_cents, 0),
    accruedCallCents: (callCharges ?? []).reduce((sum, c) => sum + c.amount_cents, 0),
  };
}

export async function startPhoneVerification(workspaceId: string, numberId: string) {
  const db = await admin();
  const { data: number } = await db
    .from("phone_numbers")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", numberId)
    .single();
  if (!number?.agent_id || !number.environment_id || !["active", "routed"].includes(number.status))
    throw new Error("Finish setting up this number before testing it.");
  const dep = await requireInboundDeployment(workspaceId, number.agent_id, number.environment_id);
  const challenge = `AVIROH ${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  const { data, error } = await db
    .from("phone_verifications")
    .insert({
      workspace_id: workspaceId,
      number_id: numberId,
      agent_id: number.agent_id,
      environment_id: number.environment_id,
      agent_version: dep.agent_version,
      challenge,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error("Could not start the phone test.");
  return { verificationId: data.id, challenge };
}

export async function phoneVerificationStatus(workspaceId: string, numberId: string) {
  const db = await admin();
  const { data: test, error } = await db
    .from("phone_verifications")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("number_id", numberId)
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("Could not load the phone test.");
  if (!test) return null;
  if (Date.now() >= Date.parse(test.expires_at) && !test.verified_at) return { id: test.id, state: "expired", conversationId: null };
  const { data: number } = await db
    .from("phone_numbers")
    .select("agent_id, environment_id, verified_at")
    .eq("workspace_id", workspaceId)
    .eq("id", numberId)
    .single();
  const { data: dep } = await db
    .from("deployments")
    .select("agent_version")
    .eq("workspace_id", workspaceId)
    .eq("agent_id", test.agent_id)
    .eq("environment_id", test.environment_id)
    .eq("status", "active")
    .eq("canary_percent", 100)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (
    !number ||
    number.agent_id !== test.agent_id ||
    number.environment_id !== test.environment_id ||
    dep?.agent_version !== test.agent_version
  )
    return { id: test.id, state: "changed", conversationId: null };
  if (test.verified_at && number.verified_at)
    return { id: test.id, state: "verified", conversationId: test.conversation_id };
  const { data: calls, error: callError } = await db
    .from("conversations")
    .select("id, status")
    .eq("workspace_id", workspaceId)
    .eq("phone_number_id", numberId)
    .eq("agent_id", test.agent_id)
    .eq("environment_id", test.environment_id)
    .eq("agent_version", test.agent_version)
    .eq("channel", "pstn")
    .gte("started_at", test.requested_at)
    .order("started_at", { ascending: false })
    .limit(5);
  if (callError) throw new Error("Could not check the test call.");
  for (const call of calls ?? []) {
    if (call.status !== "completed") continue;
    const { data: turns, error: turnError } = await db
      .from("conversation_turns")
      .select("role, content")
      .eq("workspace_id", workspaceId)
      .eq("conversation_id", call.id);
    if (turnError) throw new Error("Could not check the test transcript.");
    const callerSaidChallenge = turns?.some((t) => t.role === "user" && t.content.trim() && t.content.toLowerCase().includes(String(test.challenge).toLowerCase()));
    if (["user", "assistant"].every((role) => turns?.some((t) => t.role === role && t.content.trim())) && callerSaidChallenge)
      return { id: test.id, state: "confirm_audio", conversationId: call.id, challenge: test.challenge };
  }
  return {
    id: test.id,
    state: calls?.some((c) => c.status === "active")
      ? "in_progress"
      : calls?.length
        ? "incomplete"
        : "waiting",
    conversationId: calls?.[0]?.id ?? null,
    challenge: test.challenge,
  };
}

export async function confirmPhoneVerification(workspaceId: string, numberId: string) {
  const status = await phoneVerificationStatus(workspaceId, numberId);
  if (!status || status.state !== "confirm_audio" || !status.conversationId)
    throw new Error("Complete a call with speech in both directions before confirming audio.");
  const db = await admin();
  const { error } = await db.rpc("confirm_phone_verification", {
    _workspace: workspaceId,
    _number: numberId,
    _test: status.id,
    _conversation: status.conversationId,
  });
  if (error) throw new Error("Could not save the phone test.");
  return { ok: true };
}

export async function reconcileManagedNumbers() {
  const db = await admin();
  const { data: pending, error } = await db
    .from("managed_number_orders")
    .select("id, workspace_id")
    .not("state", "in", "(released,failed,ready)")
    .order("updated_at")
    .limit(20);
  if (error) throw new Error("Could not load provisioning work.");
  const progress = await Promise.allSettled((pending ?? []).map((o) => advanceManagedOrder(o.workspace_id, o.id)));
  const ready: { id: string; workspace_id: string }[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data: page, error: readyError } = await db
      .from("managed_number_orders")
      .select("id, workspace_id")
      .eq("state", "ready")
      .order("updated_at")
      .range(offset, offset + 499);
    if (readyError) throw new Error("Could not load rental accrual work.");
    ready.push(...(page ?? []));
    if ((page?.length ?? 0) < 500) break;
  }
  const accruals = await Promise.allSettled(ready.map(async (o) => {
    const { error: accrualError } = await db.rpc("accrue_managed_number_charges", { _order: o.id });
    if (accrualError) throw accrualError;
  }));
  const { data: states, error: stateError } = await db
    .from("managed_number_orders")
    .select("state")
    .in("id", [...(pending ?? []), ...ready].map((o) => o.id));
  if (stateError) throw new Error("Could not verify provisioning results.");
  const needsAttention = (states ?? []).filter((o) => ["error", "review", "failed"].includes(o.state)).length;
  const rejected = [...progress, ...accruals].filter((r) => r.status === "rejected").length;
  return { checked: (pending ?? []).length + ready.length, failed: Math.max(rejected, needsAttention), needsAttention };
}
