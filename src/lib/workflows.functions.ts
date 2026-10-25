import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const runWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid(), conversationId: z.string().uuid().nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: wf } = await context.supabase.from("workflows").select("id, workspace_id, name").eq("id", data.id).maybeSingle();
    if (!wf) throw new Error("Workflow not found");
    const { data: ok } = await context.supabase.rpc("is_workspace_member", { _ws: wf.workspace_id, _min: "admin" });
    if (!ok) throw new Error("Only organization owners and admins can do this");
    if (data.conversationId) {
      const { data: c } = await context.supabase.from("conversations").select("id").eq("id", data.conversationId).eq("workspace_id", wf.workspace_id).maybeSingle();
      if (!c) throw new Error("Call not found");
    }
    const { executeWorkflow } = await import("./workflows.server");
    return executeWorkflow(wf.id, data.conversationId, "manual", context.userId);
  });
