import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { businessProfileSchema } from "./business-profile";

const Scope = z.object({ workspaceId: z.string().uuid(), setupId: z.string().uuid() });

export const getBusinessProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data) => Scope.strict().parse(data))
  .handler(async ({ data, context }) =>
    (await import("./business-profile.server")).getBusinessProfileSetup(
      data.workspaceId,
      data.setupId,
      context.userId,
    ),
  );

export const saveBusinessProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    Scope.extend({
      expectedRevision: z.number().int().positive(),
      profile: businessProfileSchema,
    })
      .strict()
      .parse(data),
  )
  .handler(async ({ data, context }) =>
    (await import("./business-profile.server")).saveBusinessProfileSetup({
      ...data,
      actorId: context.userId,
    }),
  );
