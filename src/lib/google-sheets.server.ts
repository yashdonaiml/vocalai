import { EgressError, guardedFetch } from "./tools/egress.server";
import type { AdapterResult, ErrorCode } from "./tools/adapters/types";

const DRIVE_ORIGIN = "https://www.googleapis.com";
const SHEETS_ORIGIN = "https://sheets.googleapis.com";
export const MARKER_HEADER = "VocollAI Request ID";
export const RECORD_KIND_HEADER = "VocollAI Record Type";

export type GoogleSpreadsheet = {
  id: string;
  name: string;
  modifiedAt: string | null;
  canEdit: boolean;
  providerLink: string;
};
export type GoogleWorksheet = {
  id: number;
  title: string;
  index: number;
  hidden: boolean;
  rowCount: number;
  columnCount: number;
};
export type EnquiryField = "name" | "phone" | "reason" | "preferred_time" | "language";
export type EnquiryColumnMapping = Record<EnquiryField, string | null> & {
  request_marker: string;
  record_kind: string;
};
export type GoogleSheetDestination = {
  spreadsheetId: string;
  worksheetId: number;
  worksheetTitle: string;
  spreadsheetName: string;
  mapping: EnquiryColumnMapping;
};
export type GoogleSheetReceipt = {
  outcome_kind: "google_sheet_row";
  completion_state: "saved";
  external_reference: string;
  provider_link: string;
  evidence_at: string;
  request_marker: string;
  row_number: number;
  already_present: boolean;
  record_kind: "test" | "live";
};
export type GoogleSheetReconciliation =
  { state: "saved"; receipt: GoogleSheetReceipt } | { state: "needs_check"; safeMessage: string };

export class GoogleSheetsError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public sent = false,
    public statusCode?: number,
  ) {
    super(message);
  }
}

type Access = { accessToken: string; connectionId: string };
type FetchResult = { status: number; text: string; host: string };
type Dependencies = {
  access?: (workspaceId: string) => Promise<Access>;
  markReconnect?: (workspaceId: string, connectionId: string) => Promise<void>;
  fetch?: (
    url: string,
    init: {
      method: string;
      headers: Headers;
      body?: string;
      timeoutMs: number;
      signal?: AbortSignal;
    },
  ) => Promise<FetchResult>;
  now?: () => Date;
};

async function defaultAccess(workspaceId: string): Promise<Access> {
  const oauth = await import("./google-oauth.server");
  const token = await oauth.getGoogleAccessToken(workspaceId);
  return { accessToken: token.accessToken, connectionId: token.connectionId };
}
async function defaultMarkReconnect(workspaceId: string, connectionId: string) {
  const oauth = await import("./google-oauth.server");
  await oauth.markGoogleConnectionReconnectNeeded(workspaceId, connectionId);
}
async function defaultFetch(
  url: string,
  init: {
    method: string;
    headers: Headers;
    body?: string;
    timeoutMs: number;
    signal?: AbortSignal;
  },
) {
  return guardedFetch(url, { ...init, maxBytes: 1_000_000 });
}
function parseJson(text: string, sent: boolean): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new GoogleSheetsError(
      sent ? "OUTCOME_UNKNOWN" : "RESPONSE_INVALID",
      "Google returned an invalid reply",
      sent,
    );
  }
}
function classify(status: number, sent: boolean, write: boolean): never {
  if (status === 401)
    throw new GoogleSheetsError("AUTH_INVALID", "Reconnect Google to continue", sent, status);
  if (status === 403)
    throw new GoogleSheetsError(
      "AUTH_FORBIDDEN",
      "The selected sheet does not allow this action",
      sent,
      status,
    );
  if (status === 404)
    throw new GoogleSheetsError(
      "TOOL_UNAVAILABLE",
      "The selected spreadsheet or tab is no longer available",
      sent,
      status,
    );
  if (status === 429)
    throw new GoogleSheetsError("RATE_LIMITED", "Google is temporarily busy", sent, status);
  if (write && sent && status >= 500)
    throw new GoogleSheetsError(
      "OUTCOME_UNKNOWN",
      "The row may have been saved; check before retrying",
      true,
      status,
    );
  throw new GoogleSheetsError(
    "REMOTE_ERROR",
    "Google could not complete the request",
    sent,
    status,
  );
}
async function googleJson<T>(
  workspaceId: string,
  url: string,
  init: {
    method?: string;
    body?: unknown;
    timeoutMs?: number;
    signal?: AbortSignal;
    write?: boolean;
  },
  deps: Dependencies,
): Promise<T> {
  const access = await (deps.access ?? defaultAccess)(workspaceId);
  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${access.accessToken}`,
  });
  const body = init.body === undefined ? undefined : JSON.stringify(init.body);
  if (body !== undefined) headers.set("content-type", "application/json");
  try {
    const response = await (deps.fetch ?? defaultFetch)(url, {
      method: init.method ?? "GET",
      headers,
      ...(body === undefined ? {} : { body }),
      timeoutMs: init.timeoutMs ?? 10_000,
      ...(init.signal ? { signal: init.signal } : {}),
    });
    if (response.status < 200 || response.status >= 300)
      classify(response.status, true, init.write === true);
    return parseJson(response.text, init.write === true) as T;
  } catch (error) {
    if (error instanceof GoogleSheetsError) {
      if (error.code === "AUTH_INVALID")
        await (deps.markReconnect ?? defaultMarkReconnect)(workspaceId, access.connectionId);
      throw error;
    }
    if (error instanceof EgressError) {
      const code = init.write && error.sent ? "OUTCOME_UNKNOWN" : error.code;
      throw new GoogleSheetsError(
        code,
        code === "OUTCOME_UNKNOWN"
          ? "The row may have been saved; check before retrying"
          : error.message,
        error.sent,
      );
    }
    throw new GoogleSheetsError(
      init.write ? "OUTCOME_UNKNOWN" : "REMOTE_ERROR",
      init.write
        ? "The row may have been saved; check before retrying"
        : "Google could not be reached",
      init.write === true,
    );
  }
}
function safeId(value: string, label: string): string {
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(value))
    throw new GoogleSheetsError("SCHEMA_INVALID", `${label} is invalid`);
  return value;
}
function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => character.charCodeAt(0) < 32);
}
function quoteSheet(title: string): string {
  if (!title || title.length > 200 || hasControlCharacters(title))
    throw new GoogleSheetsError("SCHEMA_INVALID", "Worksheet title is invalid");
  return `'${title.replaceAll("'", "''")}'`;
}
const normalize = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const ALIASES: Record<EnquiryField, string[]> = {
  name: ["name", "full name", "customer name", "caller name"],
  phone: ["phone", "phone number", "mobile", "mobile number", "telephone"],
  reason: ["reason", "enquiry", "inquiry", "message", "request", "reason for calling"],
  preferred_time: ["preferred time", "callback time", "best time", "requested time"],
  language: ["language", "preferred language"],
};
export function suggestEnquiryColumnMapping(headers: string[]): {
  mapping: EnquiryColumnMapping;
  missingRequired: EnquiryField[];
  systemColumnsMissing: string[];
} {
  const usable = headers
    .map((header) => ({ header: header.trim(), normalized: normalize(header) }))
    .filter((x) => x.header);
  const pick = (field: EnquiryField) =>
    usable.find((x) => ALIASES[field].includes(x.normalized))?.header ?? null;
  const system = (name: string) =>
    usable.find((x) => x.normalized === normalize(name))?.header ?? name;
  const mapping: EnquiryColumnMapping = {
    name: pick("name"),
    phone: pick("phone"),
    reason: pick("reason"),
    preferred_time: pick("preferred_time"),
    language: pick("language"),
    request_marker: system(MARKER_HEADER),
    record_kind: system(RECORD_KIND_HEADER),
  };
  const missingRequired = (["name", "phone", "reason"] as EnquiryField[]).filter(
    (field) => !mapping[field],
  );
  const systemColumnsMissing = [MARKER_HEADER, RECORD_KIND_HEADER].filter(
    (name) => !headers.some((header) => normalize(header) === normalize(name)),
  );
  return { mapping, missingRequired, systemColumnsMissing };
}

export async function listGoogleSpreadsheets(
  workspaceId: string,
  pageToken?: string,
  deps: Dependencies = {},
) {
  const query = new URLSearchParams({
    q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
    pageSize: "100",
    fields: "nextPageToken,files(id,name,modifiedTime,webViewLink,capabilities(canEdit))",
    orderBy: "modifiedTime desc",
  });
  if (pageToken) query.set("pageToken", pageToken);
  const data = await googleJson<{
    nextPageToken?: string;
    files?: Array<{
      id?: string;
      name?: string;
      modifiedTime?: string;
      webViewLink?: string;
      capabilities?: { canEdit?: boolean };
    }>;
  }>(workspaceId, `${DRIVE_ORIGIN}/drive/v3/files?${query}`, {}, deps);
  const items: GoogleSpreadsheet[] = (data.files ?? []).flatMap((file) =>
    !file.id || !file.name || file.capabilities?.canEdit !== true
      ? []
      : [
          {
            id: file.id,
            name: file.name,
            modifiedAt: file.modifiedTime ?? null,
            canEdit: true,
            providerLink: `https://docs.google.com/spreadsheets/d/${file.id}/edit`,
          },
        ],
  );
  return { items, nextPageToken: data.nextPageToken ?? null };
}
export async function listGoogleWorksheets(
  workspaceId: string,
  spreadsheetId: string,
  deps: Dependencies = {},
) {
  const id = safeId(spreadsheetId, "Spreadsheet");
  const fields = encodeURIComponent(
    "properties(title),sheets(properties(sheetId,title,index,hidden,gridProperties(rowCount,columnCount)))",
  );
  const data = await googleJson<{
    properties?: { title?: string };
    sheets?: Array<{
      properties?: {
        sheetId?: number;
        title?: string;
        index?: number;
        hidden?: boolean;
        gridProperties?: { rowCount?: number; columnCount?: number };
      };
    }>;
  }>(workspaceId, `${SHEETS_ORIGIN}/v4/spreadsheets/${id}?fields=${fields}`, {}, deps);
  const worksheets: GoogleWorksheet[] = (data.sheets ?? []).flatMap((sheet) => {
    const p = sheet.properties;
    return !p || !Number.isInteger(p.sheetId) || !p.title || !Number.isInteger(p.index)
      ? []
      : [
          {
            id: p.sheetId!,
            title: p.title,
            index: p.index!,
            hidden: p.hidden === true,
            rowCount: p.gridProperties?.rowCount ?? 0,
            columnCount: p.gridProperties?.columnCount ?? 0,
          },
        ];
  });
  return { spreadsheetName: data.properties?.title ?? "Spreadsheet", worksheets };
}
export async function getGoogleSheetHeaders(
  workspaceId: string,
  spreadsheetId: string,
  worksheetTitle: string,
  deps: Dependencies = {},
) {
  const range = encodeURIComponent(`${quoteSheet(worksheetTitle)}!1:1`);
  const data = await googleJson<{ values?: unknown[][] }>(
    workspaceId,
    `${SHEETS_ORIGIN}/v4/spreadsheets/${safeId(spreadsheetId, "Spreadsheet")}/values/${range}?majorDimension=ROWS`,
    {},
    deps,
  );
  return (data.values?.[0] ?? []).map((value) =>
    typeof value === "string" ? value.trim() : String(value ?? "").trim(),
  );
}

async function getGoogleSpreadsheet(
  workspaceId: string,
  spreadsheetId: string,
  deps: Dependencies,
) {
  const id = safeId(spreadsheetId, "Spreadsheet");
  const data = await googleJson<{
    id?: string;
    name?: string;
    capabilities?: { canEdit?: boolean };
  }>(
    workspaceId,
    `${DRIVE_ORIGIN}/drive/v3/files/${id}?fields=id,name,capabilities(canEdit)`,
    {},
    deps,
  );
  if (data.id !== id || !data.name)
    throw new GoogleSheetsError("TOOL_UNAVAILABLE", "The selected spreadsheet is unavailable");
  if (data.capabilities?.canEdit !== true)
    throw new GoogleSheetsError("AUTH_FORBIDDEN", "The selected spreadsheet is read-only");
  return { id, name: data.name };
}

/** Finalizes a reviewed destination. It can only append the two platform safety
 * columns; it never edits or renames customer columns. An uncertain update is
 * reconciled by one header read, never by repeating the write. */
export async function prepareGoogleSheetDestination(
  input: {
    workspaceId: string;
    spreadsheetId: string;
    worksheetId: number;
    allowAddSystemColumns: boolean;
  },
  deps: Dependencies = {},
): Promise<{
  destination: GoogleSheetDestination;
  addedSystemColumns: string[];
  missingRequired: EnquiryField[];
}> {
  const file = await getGoogleSpreadsheet(input.workspaceId, input.spreadsheetId, deps);
  const book = await listGoogleWorksheets(input.workspaceId, input.spreadsheetId, deps);
  const worksheet = book.worksheets.find((item) => item.id === input.worksheetId && !item.hidden);
  if (!worksheet)
    throw new GoogleSheetsError("TOOL_UNAVAILABLE", "The selected worksheet is unavailable");
  let headers = await getGoogleSheetHeaders(
    input.workspaceId,
    input.spreadsheetId,
    worksheet.title,
    deps,
  );
  const initial = suggestEnquiryColumnMapping(headers);
  const missing = initial.systemColumnsMissing;
  if (missing.length && !input.allowAddSystemColumns)
    throw new GoogleSheetsError(
      "CONTRACT_DRIFT",
      "Review and approve the columns used for test labels and duplicate protection",
    );
  if (missing.length) {
    const start = columnName(headers.length);
    const end = columnName(headers.length + missing.length - 1);
    const range = encodeURIComponent(`${quoteSheet(worksheet.title)}!${start}1:${end}1`);
    const url = `${SHEETS_ORIGIN}/v4/spreadsheets/${safeId(input.spreadsheetId, "Spreadsheet")}/values/${range}?valueInputOption=RAW`;
    try {
      await googleJson(
        input.workspaceId,
        url,
        { method: "PUT", body: { majorDimension: "ROWS", values: [missing] }, write: true },
        deps,
      );
    } catch (error) {
      headers = await getGoogleSheetHeaders(
        input.workspaceId,
        input.spreadsheetId,
        worksheet.title,
        deps,
      );
      if (suggestEnquiryColumnMapping(headers).systemColumnsMissing.length) throw error;
    }
    headers = await getGoogleSheetHeaders(
      input.workspaceId,
      input.spreadsheetId,
      worksheet.title,
      deps,
    );
  }
  const final = suggestEnquiryColumnMapping(headers);
  if (final.systemColumnsMissing.length)
    throw new GoogleSheetsError(
      "CONTRACT_DRIFT",
      "Google did not save the required safety columns",
    );
  return {
    destination: {
      spreadsheetId: file.id,
      worksheetId: worksheet.id,
      worksheetTitle: worksheet.title,
      spreadsheetName: file.name,
      mapping: final.mapping,
    },
    addedSystemColumns: missing,
    missingRequired: final.missingRequired,
  };
}
function columnName(index: number): string {
  let n = index + 1,
    out = "";
  while (n > 0) {
    n--;
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26);
  }
  return out;
}
function rowNumber(updatedRange: string): number | null {
  const match = /![A-Z]+(\d+)(?::[A-Z]+\d+)?$/i.exec(updatedRange);
  return match ? Number(match[1]) : null;
}
const providerLink = (d: GoogleSheetDestination, row: number) =>
  `https://docs.google.com/spreadsheets/d/${d.spreadsheetId}/edit#gid=${d.worksheetId}&range=A${row}`;
function makeReceipt(
  d: GoogleSheetDestination,
  marker: string,
  row: number,
  present: boolean,
  recordKind: "test" | "live",
  now: Date,
): GoogleSheetReceipt {
  return {
    outcome_kind: "google_sheet_row",
    completion_state: "saved",
    external_reference: `${d.spreadsheetId}:${d.worksheetId}:${row}`,
    provider_link: providerLink(d, row),
    evidence_at: now.toISOString(),
    request_marker: marker,
    row_number: row,
    already_present: present,
    record_kind: recordKind,
  };
}
function validateMapping(headers: string[], mapping: EnquiryColumnMapping): void {
  const expected = [
    mapping.name,
    mapping.phone,
    mapping.reason,
    mapping.request_marker,
    mapping.record_kind,
    mapping.preferred_time,
    mapping.language,
  ].filter(Boolean) as string[];
  if (expected.some((header) => !headers.includes(header)))
    throw new GoogleSheetsError(
      "CONTRACT_DRIFT",
      "Enquiry columns changed; review the destination mapping",
    );
  if (new Set(expected).size !== expected.length)
    throw new GoogleSheetsError(
      "CONTRACT_DRIFT",
      "Each enquiry field must use a different worksheet column",
    );
}
function validateDestination(destination: GoogleSheetDestination, requestMarker: string): void {
  safeId(destination.spreadsheetId, "Spreadsheet");
  quoteSheet(destination.worksheetTitle);
  if (!Number.isInteger(destination.worksheetId) || destination.worksheetId < 0)
    throw new GoogleSheetsError("SCHEMA_INVALID", "Worksheet is invalid");
  if (!requestMarker || requestMarker.length > 200 || hasControlCharacters(requestMarker))
    throw new GoogleSheetsError("SCHEMA_INVALID", "Request marker is invalid");
}
async function findMarker(
  workspaceId: string,
  destination: GoogleSheetDestination,
  headers: string[],
  marker: string,
  deps: Dependencies,
): Promise<number | null> {
  const index = headers.indexOf(destination.mapping.request_marker);
  if (index < 0)
    throw new GoogleSheetsError("CONTRACT_DRIFT", `The ${MARKER_HEADER} column is missing`);
  const range = encodeURIComponent(
    `${quoteSheet(destination.worksheetTitle)}!${columnName(index)}2:${columnName(index)}`,
  );
  const data = await googleJson<{ values?: unknown[][] }>(
    workspaceId,
    `${SHEETS_ORIGIN}/v4/spreadsheets/${safeId(destination.spreadsheetId, "Spreadsheet")}/values/${range}?majorDimension=ROWS`,
    {},
    deps,
  );
  const found = (data.values ?? []).findIndex((row) => String(row[0] ?? "") === marker);
  return found < 0 ? null : found + 2;
}
export async function appendGoogleSheetEnquiry(
  input: {
    workspaceId: string;
    requestMarker: string;
    destination: GoogleSheetDestination;
    recordKind: "test" | "live";
    enquiry: {
      name: string;
      phone: string;
      reason: string;
      preferred_time?: string | null;
      language?: string | null;
    };
    signal?: AbortSignal;
  },
  deps: Dependencies = {},
): Promise<GoogleSheetReceipt> {
  validateDestination(input.destination, input.requestMarker);
  const headers = await getGoogleSheetHeaders(
    input.workspaceId,
    input.destination.spreadsheetId,
    input.destination.worksheetTitle,
    deps,
  );
  validateMapping(headers, input.destination.mapping);
  const existing = await findMarker(
    input.workspaceId,
    input.destination,
    headers,
    input.requestMarker,
    deps,
  );
  const now = deps.now ?? (() => new Date());
  if (existing)
    return makeReceipt(
      input.destination,
      input.requestMarker,
      existing,
      true,
      input.recordKind,
      now(),
    );
  const values = headers.map((header) => {
    const entry = Object.entries(input.destination.mapping).find(
      ([, mapped]) => mapped === header,
    )?.[0];
    if (entry === "request_marker") return input.requestMarker;
    if (entry === "record_kind")
      return input.recordKind === "test" ? "Test enquiry" : "Live enquiry";
    return entry && entry in input.enquiry
      ? (input.enquiry[entry as keyof typeof input.enquiry] ?? "")
      : "";
  });
  const range = encodeURIComponent(
    `${quoteSheet(input.destination.worksheetTitle)}!A:${columnName(Math.max(0, headers.length - 1))}`,
  );
  const url = `${SHEETS_ORIGIN}/v4/spreadsheets/${safeId(input.destination.spreadsheetId, "Spreadsheet")}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS&includeValuesInResponse=false`;
  const data = await googleJson<{ updates?: { updatedRange?: string; updatedRows?: number } }>(
    input.workspaceId,
    url,
    {
      method: "POST",
      body: { majorDimension: "ROWS", values: [values] },
      write: true,
      ...(input.signal ? { signal: input.signal } : {}),
    },
    deps,
  );
  const row = rowNumber(data.updates?.updatedRange ?? "");
  if (data.updates?.updatedRows !== 1 || !row)
    throw new GoogleSheetsError(
      "OUTCOME_UNKNOWN",
      "The row may have been saved; check before retrying",
      true,
    );
  return makeReceipt(input.destination, input.requestMarker, row, false, input.recordKind, now());
}
export async function reconcileGoogleSheetWrite(
  input: {
    workspaceId: string;
    requestMarker: string;
    destination: GoogleSheetDestination;
    recordKind: "test" | "live";
  },
  deps: Dependencies = {},
): Promise<GoogleSheetReconciliation> {
  validateDestination(input.destination, input.requestMarker);
  const headers = await getGoogleSheetHeaders(
    input.workspaceId,
    input.destination.spreadsheetId,
    input.destination.worksheetTitle,
    deps,
  );
  validateMapping(headers, input.destination.mapping);
  const row = await findMarker(
    input.workspaceId,
    input.destination,
    headers,
    input.requestMarker,
    deps,
  );
  return row
    ? {
        state: "saved",
        receipt: makeReceipt(
          input.destination,
          input.requestMarker,
          row,
          true,
          input.recordKind,
          (deps.now ?? (() => new Date()))(),
        ),
      }
    : {
        state: "needs_check",
        safeMessage:
          "Google did not confirm this enquiry. Check the selected sheet before trying again.",
      };
}
export async function invokeGoogleSheetsAdapter(
  input: {
    workspaceId: string;
    invocationId: string;
    args: Record<string, unknown>;
    configuration: Record<string, unknown>;
    isSetupPreview: boolean;
    signal?: AbortSignal;
  },
  deps: Dependencies = {},
): Promise<AdapterResult> {
  const host = "sheets.googleapis.com";
  try {
    const destination = input.configuration["destination"] as GoogleSheetDestination | undefined;
    if (!destination || input.configuration["operation"] !== "append_google_sheet")
      throw new GoogleSheetsError("CONTRACT_DRIFT", "Google Sheets destination is not configured");
    const enquiry = {
      name: String(input.args["name"] ?? "").trim(),
      phone: String(input.args["phone"] ?? "").trim(),
      reason: String(input.args["reason"] ?? "").trim(),
      preferred_time:
        input.args["preferred_time"] == null ? null : String(input.args["preferred_time"]).trim(),
      language: input.args["language"] == null ? null : String(input.args["language"]).trim(),
    };
    if (!enquiry.name || !enquiry.phone || !enquiry.reason)
      throw new GoogleSheetsError("SCHEMA_INVALID", "Name, phone and reason are required");
    const output = await appendGoogleSheetEnquiry(
      {
        workspaceId: input.workspaceId,
        requestMarker: input.invocationId,
        destination,
        recordKind: input.isSetupPreview ? "test" : "live",
        enquiry,
        ...(input.signal ? { signal: input.signal } : {}),
      },
      deps,
    );
    return { ok: true, output, statusCode: output.already_present ? 200 : 201, host };
  } catch (error) {
    const e =
      error instanceof GoogleSheetsError
        ? error
        : new GoogleSheetsError("REMOTE_ERROR", "Google Sheets is unavailable");
    return {
      ok: false,
      code: e.code,
      message: e.message,
      ...(e.statusCode ? { statusCode: e.statusCode } : {}),
      host,
      sent: e.sent,
    };
  }
}
