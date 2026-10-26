import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Workspace = z.object({ workspaceId: z.string().uuid() }).strict();

export const beginGoogleSheetsConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((value) =>
    Workspace.extend({ returnTo: z.string().max(200) })
      .strict()
      .parse(value),
  )
  .handler(async ({ data, context }) =>
    (await import("./google-oauth.server")).beginGoogleSheetsOAuth(
      data.workspaceId,
      context.userId,
      data.returnTo,
    ),
  );

export const getGoogleSheetsConnection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((value) => Workspace.parse(value))
  .handler(async ({ data, context }) =>
    (await import("./google-oauth.server")).getGoogleConnectionStatus(
      data.workspaceId,
      context.userId,
    ),
  );

export const disconnectGoogleSheetsConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((value) => Workspace.parse(value))
  .handler(async ({ data, context }) =>
    (await import("./google-oauth.server")).disconnectGoogle(data.workspaceId, context.userId),
  );
