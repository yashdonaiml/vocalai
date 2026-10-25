import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listCallbacks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: allowed, error } = await context.supabase.rpc("is_workspace_member", { _ws: data.workspaceId, _min: "admin" });
    if (error || !allowed) throw new Error("Workspace admin access required.");
    return (await import("./callbacks.server")).callbackInbox(data.workspaceId);
  });
