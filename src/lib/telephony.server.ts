// Validated media routing, shared by managed onboarding and external carrier routes.
async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

export async function validatePhoneRoute(
  workspaceId: string,
  agentId: string,
  environmentId: string,
) {
  const db = await admin();
  const [{ data: agent }, { data: environment }] = await Promise.all([
    db
      .from("agents")
      .select("id, status")
      .eq("id", agentId)
      .eq("workspace_id", workspaceId)
      .single(),
    db
      .from("environments")
      .select("id")
      .eq("id", environmentId)
      .eq("workspace_id", workspaceId)
      .single(),
  ]);
  if (!agent || agent.status === "archived" || !environment)
    throw new Error("Choose an available agent and environment in this workspace.");
}

export async function provisionPhoneNumber(workspaceId: string, numberId: string) {
  const db = await admin();
  const { data: number } = await db
    .from("phone_numbers")
    .select("*")
    .eq("id", numberId)
    .eq("workspace_id", workspaceId)
    .single();
  if (number?.status === "removing")
    throw new Error("This route is being removed. Retry removal before adding it again.");
  if (number?.management_mode === "managed") {
    const { data: order } = await db
      .from("managed_number_orders")
      .select("state, carrier_number_ref")
      .eq("number_id", numberId)
      .eq("workspace_id", workspaceId)
      .single();
    if (!order?.carrier_number_ref || !["routing", "ready"].includes(order.state))
      throw new Error("Finish managed number activation before routing calls.");
  }
  if (!number?.agent_id || !number.environment_id)
    throw new Error("Choose an agent and environment before configuring this route.");
  await validatePhoneRoute(workspaceId, number.agent_id, number.environment_id);
  const { mediaConfigured, provisionInboundNumber } = await import("./runtime/livekit.server");
  if (!mediaConfigured())
    return {
      provisioned: false,
      error:
        "Number saved. Add the voice-service credentials to the console server, then retry routing.",
    };

  const token = crypto.randomUUID();
  const staleAt = new Date(Date.now() - 120_000).toISOString();
  const { data: claimed, error: claimError } = await db
    .from("phone_numbers")
    .update({
      status: "provisioning",
      provisioning_token: token,
      provisioning_started_at: new Date().toISOString(),
      provisioning_error: null,
    })
    .eq("id", numberId)
    .eq("workspace_id", workspaceId)
    .or(`provisioning_started_at.is.null,provisioning_started_at.lt.${staleAt}`)
    .select("id")
    .maybeSingle();
  if (claimError) throw new Error("Could not start route configuration.");
  if (!claimed)
    throw new Error(
      "Route configuration is already running. Retry in two minutes if it does not finish.",
    );
  try {
    const refs = await provisionInboundNumber({
      e164: number.e164,
      numberId,
      carrier: number.carrier,
    });
    const { data: saved, error } = await db
      .from("phone_numbers")
      .update({
        sip_trunk_ref: refs.trunkRef,
        dispatch_rule_ref: refs.ruleRef,
        status: "routed",
        provisioning_token: null,
        provisioning_started_at: null,
        provisioning_error: null,
      })
      .eq("id", numberId)
      .eq("workspace_id", workspaceId)
      .eq("provisioning_token", token)
      .select("id")
      .maybeSingle();
    if (error || !saved)
      throw new Error(
        "Could not save the route. Retry routing to recover the existing configuration.",
      );
    return { provisioned: true, error: null };
  } catch {
    // Provider exceptions can contain connection details; return a fixed, safe message.
    const message =
      "Route configuration failed. Check the console's LiveKit credentials and carrier signaling allowlist, then retry routing.";
    const { error } = await db
      .from("phone_numbers")
      .update({
        status: "error",
        provisioning_error: message,
        provisioning_token: null,
        provisioning_started_at: null,
      })
      .eq("id", numberId)
      .eq("workspace_id", workspaceId)
      .eq("provisioning_token", token);
    if (error) throw new Error("Could not save route status. Retry in two minutes.");
    return { provisioned: false, error: message };
  }
}
