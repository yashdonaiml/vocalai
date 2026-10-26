import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Scope = z
  .object({
    workspaceId: z.string().uuid(),
    agentId: z.union([z.string().uuid(), z.literal("new")]),
    conversationKey: z.string().uuid(),
  })
  .strict();

export const getBuilderConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data) => Scope.parse(data))
  .handler(async ({ data, context }) =>
    (await import("./builder-chat.server")).getBuilderConversation({
      ...data,
      actorId: context.userId,
    }),
  );

export const proposeBuilderChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    Scope.extend({
      requestKey: z.string().uuid(),
      message: z.string().trim().min(1).max(4000),
      browserTimezone: z.string().trim().min(1).max(100),
    }).parse(data),
  )
  .handler(async ({ data, context }) =>
    (await import("./builder-chat.server")).proposeBuilderChange({
      ...data,
      actorId: context.userId,
    }),
  );

export const applyBuilderProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    Scope.extend({ proposalId: z.string().uuid(), requestKey: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) =>
    (await import("./builder-chat.server")).applyBuilderProposal({
      ...data,
      actorId: context.userId,
    }),
  );

export const rejectBuilderProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => Scope.extend({ proposalId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) =>
    (await import("./builder-chat.server")).rejectBuilderProposal({
      ...data,
      actorId: context.userId,
    }),
  );
