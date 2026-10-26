import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Scope = z.object({ workspaceId: z.string().uuid() });
const Business = z.object({
  name: z.string().trim().min(1).max(120),
  brief: z.string().trim().min(10).max(4000),
});
const SheetMapping = z
  .object({
    name: z.string().min(1).max(256),
    phone: z.string().min(1).max(256),
    reason: z.string().min(1).max(256),
    preferred_time: z.string().min(1).max(256).nullable(),
    language: z.string().min(1).max(256).nullable(),
    request_marker: z.string().min(1).max(256),
    record_kind: z.string().min(1).max(256),
  })
  .strict();
export const beginEnquirySetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    Scope.extend({
      agentId: z.string().uuid().optional(),
      requestKey: z.string().uuid(),
      name: Business.shape.name,
      brief: Business.shape.brief,
    })
      .strict()
      .parse(d),
  )
  .handler(async ({ data, context }) =>
    (await import("./setup.server")).beginEnquiry(
      data.workspaceId,
      context.userId,
      data.requestKey,
      { name: data.name, brief: data.brief },
      data.agentId,
    ),
  );
export const getEnquirySetup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d) => Scope.extend({ agentId: z.string().uuid() }).strict().parse(d))
  .handler(async ({ data, context }) =>
    (await import("./setup.server")).getEnquirySetupState(
      data.workspaceId,
      data.agentId,
      context.userId,
    ),
  );
export const saveEnquirySetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    Scope.extend({
      setupId: z.string().uuid(),
      expectedRevision: z.number().int().positive(),
      businessDraft: Business,
    })
      .strict()
      .parse(d),
  )
  .handler(async ({ data, context }) =>
    (await import("./setup.server")).saveEnquiry(
      data.workspaceId,
      data.setupId,
      context.userId,
      data.expectedRevision,
      data.businessDraft,
    ),
  );
export const startEnquiryPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    Scope.extend({
      setupId: z.string().uuid(),
      expectedRevision: z.number().int().positive(),
      requestKey: z.string().uuid(),
    })
      .strict()
      .parse(d),
  )
  .handler(async ({ data, context }) =>
    (await import("./setup.server")).startEnquiry(
      data.workspaceId,
      data.setupId,
      context.userId,
      data.expectedRevision,
      data.requestKey,
    ),
  );
export const saveEnquirySetupDestination = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    Scope.extend({
      setupId: z.string().uuid(),
      expectedRevision: z.number().int().positive(),
      destination: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("callback_inbox") }).strict(),
        z
          .object({
            kind: z.literal("google_sheets"),
            spreadsheetId: z.string().min(10).max(200),
            spreadsheetName: z.string().min(1).max(500),
            worksheetId: z.number().int().nonnegative(),
            worksheetTitle: z.string().min(1).max(200),
            mapping: SheetMapping,
          })
          .strict(),
      ]),
    })
      .strict()
      .parse(d),
  )
  .handler(async ({ data, context }) =>
    (await import("./setup.server")).saveEnquiryDestination(
      data.workspaceId,
      data.setupId,
      context.userId,
      data.expectedRevision,
      data.destination,
    ),
  );
export const getEnquiryPreviewResult = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    Scope.extend({ setupId: z.string().uuid(), sessionId: z.string().uuid() }).strict().parse(d),
  )
  .handler(async ({ data, context }) =>
    (await import("./setup.server")).getEnquiryPreviewState(
      data.workspaceId,
      data.setupId,
      data.sessionId,
      context.userId,
    ),
  );
