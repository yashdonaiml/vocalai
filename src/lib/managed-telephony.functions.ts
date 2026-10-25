import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Workspace = z.object({ workspaceId: z.string().uuid() });
const NumberInput = Workspace.extend({ numberId: z.string().uuid() });
type Context = {
  supabase: {
    rpc: (
      name: "is_workspace_member",
      args: { _ws: string; _min: "member" | "admin" },
    ) => PromiseLike<{ data: boolean | null }>;
  };
};
async function access(context: Context, workspaceId: string, write = true) {
  const { data } = await context.supabase.rpc("is_workspace_member", {
    _ws: workspaceId,
    _min: write ? "admin" : "member",
  });
  if (!data)
    throw new Error(
      write
        ? "Only workspace admins can purchase, assign or test phone numbers."
        : "Workspace access is required.",
    );
  return import("./managed-telephony.server");
}

export const getManagedPhoneOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => Workspace.parse(raw))
  .handler(async ({ data, context }) =>
    (await access(context, data.workspaceId, false)).managedOverview(data.workspaceId),
  );

export const searchManagedPhoneNumbers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    Workspace.extend({
      areaCode: z
        .string()
        .regex(/^[2-9][0-9]{2}$/)
        .optional(),
    }).parse(raw),
  )
  .handler(async ({ data, context }) =>
    (await access(context, data.workspaceId)).searchManagedNumbers(data.workspaceId, data.areaCode),
  );

export const purchaseManagedPhoneNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    Workspace.extend({
      quoteId: z.string().uuid(),
      agentId: z.string().uuid(),
      environmentId: z.string().uuid(),
      requestId: z.string().uuid(),
      acceptCharges: z.literal(true),
    }).parse(raw),
  )
  .handler(async ({ data, context }) =>
    (await access(context, data.workspaceId)).purchaseManagedNumber(data),
  );

export const checkManagedPhoneOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => Workspace.extend({ orderId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    await (
      await access(context, data.workspaceId)
    ).advanceManagedOrder(data.workspaceId, data.orderId);
    return { ok: true };
  });

export const releaseManagedPhoneNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    Workspace.extend({ orderId: z.string().uuid(), confirmRelease: z.literal(true) }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    await (
      await access(context, data.workspaceId)
    ).releaseManagedNumber(data.workspaceId, data.orderId);
    return { ok: true };
  });

export const beginPhoneTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => NumberInput.parse(raw))
  .handler(async ({ data, context }) =>
    (await access(context, data.workspaceId)).startPhoneVerification(
      data.workspaceId,
      data.numberId,
    ),
  );

export const getPhoneTest = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => NumberInput.parse(raw))
  .handler(async ({ data, context }) =>
    (await access(context, data.workspaceId, false)).phoneVerificationStatus(
      data.workspaceId,
      data.numberId,
    ),
  );

export const confirmPhoneTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => NumberInput.extend({ heardAgent: z.literal(true) }).parse(raw))
  .handler(async ({ data, context }) =>
    (await access(context, data.workspaceId)).confirmPhoneVerification(
      data.workspaceId,
      data.numberId,
    ),
  );
