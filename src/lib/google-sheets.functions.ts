import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Workspace = z.object({ workspaceId: z.string().uuid() });
const Spreadsheet = Workspace.extend({
  spreadsheetId: z.string().regex(/^[A-Za-z0-9_-]{10,200}$/),
});

async function authorized(workspaceId: string, actorId: string) {
  const oauth = await import("./google-oauth.server");
  await oauth.requireGoogleWorkspaceAdmin(workspaceId, actorId);
  return import("./google-sheets.server");
}

export const listGoogleSheetsSpreadsheets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((value) =>
    Workspace.extend({ pageToken: z.string().min(1).max(1000).optional() })
      .strict()
      .parse(value),
  )
  .handler(async ({ data, context }) =>
    (await authorized(data.workspaceId, context.userId)).listGoogleSpreadsheets(
      data.workspaceId,
      data.pageToken,
    ),
  );

export const listGoogleSheetsWorksheets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((value) => Spreadsheet.strict().parse(value))
  .handler(async ({ data, context }) =>
    (await authorized(data.workspaceId, context.userId)).listGoogleWorksheets(
      data.workspaceId,
      data.spreadsheetId,
    ),
  );

export const previewGoogleSheetsMapping = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((value) =>
    Spreadsheet.extend({ worksheetTitle: z.string().trim().min(1).max(200) })
      .strict()
      .parse(value),
  )
  .handler(async ({ data, context }) => {
    const sheets = await authorized(data.workspaceId, context.userId);
    const headers = await sheets.getGoogleSheetHeaders(
      data.workspaceId,
      data.spreadsheetId,
      data.worksheetTitle,
    );
    return { headers, ...sheets.suggestEnquiryColumnMapping(headers) };
  });

export const prepareGoogleSheetsColumns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((value) =>
    Spreadsheet.extend({
      worksheetId: z.number().int().nonnegative(),
      approveSystemColumns: z.literal(true),
    })
      .strict()
      .parse(value),
  )
  .handler(async ({ data, context }) => {
    const sheets = await authorized(data.workspaceId, context.userId);
    return sheets.prepareGoogleSheetDestination({
      workspaceId: data.workspaceId,
      spreadsheetId: data.spreadsheetId,
      worksheetId: data.worksheetId,
      allowAddSystemColumns: data.approveSystemColumns,
    });
  });
