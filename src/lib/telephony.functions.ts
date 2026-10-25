import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RouteInput = z.object({
  workspaceId: z.string().uuid(),
  agentId: z.string().uuid(),
  environmentId: z.string().uuid(),
});
const NumberInput = z.object({ workspaceId: z.string().uuid(), numberId: z.string().uuid() });

async function requireAdmin(
  context: {
    supabase: {
      rpc: (
        name: "is_workspace_member",
        args: { _ws: string; _min: "admin" },
      ) => PromiseLike<{ data: boolean | null }>;
    };
  },
  workspaceId: string,
) {
  const { data: allowed } = await context.supabase.rpc("is_workspace_member", {
    _ws: workspaceId,
    _min: "admin",
  });
  if (!allowed) throw new Error("Only workspace admins can change phone routes.");
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

export const addPhoneNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    RouteInput.extend({
      e164: z.string().regex(/^\+[1-9][0-9]{6,14}$/),
      carrier: z.enum(["telnyx", "twilio", "other"]),
    }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context, data.workspaceId);
    const { provisionPhoneNumber } = await import("./telephony.server");
    await (await import("./managed-telephony.server")).requireInboundDeployment(data.workspaceId, data.agentId, data.environmentId);
    const { data: row, error } = await db
      .from("phone_numbers")
      .insert({
        workspace_id: data.workspaceId,
        e164: data.e164,
        carrier: data.carrier,
        agent_id: data.agentId,
        environment_id: data.environmentId,
      })
      .select("id")
      .single();
    if (error || !row)
      throw new Error(
        error?.code === "23505"
          ? "This number is already registered. Use Retry routing on its existing route."
          : "Could not save the phone number.",
      );
    return provisionPhoneNumber(data.workspaceId, row.id);
  });

export const retryPhoneNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => NumberInput.parse(raw))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context, data.workspaceId);
    const { data: number } = await db
      .from("phone_numbers")
      .select("management_mode")
      .eq("id", data.numberId)
      .eq("workspace_id", data.workspaceId)
      .single();
    if (number?.management_mode === "managed")
      throw new Error("Use Check setup on this managed number.");
    return (await import("./telephony.server")).provisionPhoneNumber(
      data.workspaceId,
      data.numberId,
    );
  });

export const getPhoneServiceSetup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => (await import("./runtime/livekit.server")).phoneServiceSetup());

export const updatePhoneRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => RouteInput.extend({ numberId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context, data.workspaceId);
    await (await import("./managed-telephony.server")).requireInboundDeployment(data.workspaceId, data.agentId, data.environmentId);
    const { data: number } = await db
      .from("phone_numbers")
      .select("management_mode")
      .eq("id", data.numberId)
      .eq("workspace_id", data.workspaceId)
      .single();
    if (number?.management_mode === "managed") {
      const { data: order } = await db
        .from("managed_number_orders")
        .select("state, lease_at")
        .eq("number_id", data.numberId)
        .eq("workspace_id", data.workspaceId)
        .single();
      if (!order || order.state !== "ready" || order.lease_at)
        throw new Error("Wait for number setup to finish before changing its agent.");
      const { error } = await db.rpc("assign_managed_phone_route", {
        _workspace: data.workspaceId,
        _number: data.numberId,
        _agent: data.agentId,
        _environment: data.environmentId,
      });
      if (error)
        throw new Error("The number is busy or its deployment changed. Refresh and try again.");
      return { ok: true };
    }
    const { data: saved, error } = await db
      .from("phone_numbers")
      .update({ agent_id: data.agentId, environment_id: data.environmentId })
      .eq("id", data.numberId)
      .eq("workspace_id", data.workspaceId)
      .neq("status", "removing")
      .select("id")
      .single();
    if (error || !saved) throw new Error("Could not update this phone route.");
    return { ok: true };
  });

export const removePhoneNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => NumberInput.parse(raw))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context, data.workspaceId);
    const { data: number } = await db
      .from("phone_numbers")
      .select("*")
      .eq("id", data.numberId)
      .eq("workspace_id", data.workspaceId)
      .single();
    if (!number) throw new Error("Phone route not found.");
    if (number.management_mode === "managed")
      throw new Error("Use Release number to stop this managed number's rental and calls.");
    if (
      number.provisioning_started_at &&
      Date.parse(number.provisioning_started_at) > Date.now() - 120_000
    )
      throw new Error("Wait for route configuration to finish before removing it.");
    // Disable inbound session resolution first. A cleanup failure stays visible and retryable.
    const token = crypto.randomUUID();
    const { data: paused, error: pauseError } = await db
      .from("phone_numbers")
      .update({
        status: "removing",
        provisioning_token: token,
        provisioning_started_at: new Date().toISOString(),
      })
      .eq("id", number.id)
      .eq("workspace_id", data.workspaceId)
      .or(
        `provisioning_started_at.is.null,provisioning_started_at.lt.${new Date(Date.now() - 120_000).toISOString()}`,
      )
      .select("id")
      .maybeSingle();
    if (pauseError || !paused)
      throw new Error(
        "Could not pause this route. Wait for any current configuration attempt to finish.",
      );
    try {
      await (
        await import("./runtime/livekit.server")
      ).removeInboundNumber({
        numberId: number.id,
        e164: number.e164,
        ruleRef: number.dispatch_rule_ref,
      });
      const { data: removed, error } = await db
        .from("phone_numbers")
        .delete()
        .eq("id", number.id)
        .eq("workspace_id", data.workspaceId)
        .eq("provisioning_token", token)
        .select("id")
        .maybeSingle();
      if (error || !removed) throw new Error("Could not remove route");
    } catch {
      await db
        .from("phone_numbers")
        .update({
          provisioning_token: null,
          provisioning_started_at: null,
          provisioning_error: "Route disabled. Cleanup failed; retry removal.",
        })
        .eq("id", number.id)
        .eq("workspace_id", data.workspaceId)
        .eq("provisioning_token", token);
      throw new Error(
        "Route disabled. Could not finish cleanup at the voice service; retry removal.",
      );
    }
    return { ok: true };
  });
