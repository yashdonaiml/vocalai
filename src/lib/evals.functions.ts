import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const runEvaluation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((value) => z.object({ suiteId: z.string().uuid(), agentId: z.string().uuid(), version: z.number().int().positive() }).strict().parse(value))
  .handler(async ({ data, context }) => {
    const { data: suite, error } = await context.supabase.from("eval_suites").select("workspace_id").eq("id", data.suiteId).single();
    if (error || !suite) throw new Error("Evaluation suite not found.");
    const { data: allowed, error: permissionError } = await context.supabase.rpc("is_workspace_member", { _ws: suite.workspace_id, _min: "admin" });
    if (permissionError || !allowed) throw new Error("Workspace admin required to run evaluations.");
    const { runTextEvaluation } = await import("./evals.server");
    return runTextEvaluation({ ...data, userId: context.userId });
  });
