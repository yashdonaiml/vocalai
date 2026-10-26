import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";

const Scope = z.object({ workspaceId: z.string().uuid() }).strict();

export const developerStudioAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data) => Scope.parse(data))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as SupabaseClient;
    const { data: allowed, error } = await db.rpc("can_use_developer_studio", {
      _ws: data.workspaceId,
      _actor: context.userId,
    });
    if (error) throw new Error("Developer access could not be checked.");
    return { allowed: allowed === true };
  });
