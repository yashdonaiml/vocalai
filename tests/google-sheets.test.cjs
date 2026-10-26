const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loader } = require("./helpers.cjs");

class EgressError extends Error {
  constructor(code, message, sent = false) {
    super(message);
    this.code = code;
    this.sent = sent;
  }
}

const sheets = () =>
  loader({
    "./tools/egress.server": {
      EgressError,
      guardedFetch: async () => {
        throw new Error("unexpected network");
      },
    },
    "./tools/adapters/types": {},
    "./google-oauth.server": {
      getGoogleAccessToken: async () => ({ accessToken: "token", connectionId: "connection" }),
    },
  })("src/lib/google-sheets.server.ts");

const destination = {
  spreadsheetId: "sheet_abcdefghijk",
  worksheetId: 17,
  worksheetTitle: "Enquiries",
  spreadsheetName: "Customer enquiries",
  mapping: {
    name: "Name",
    phone: "Phone",
    reason: "Reason",
    preferred_time: "Preferred time",
    language: null,
    request_marker: "VocollAI Request ID",
    record_kind: "VocollAI Record Type",
  },
};

function reply(status, value) {
  return { status, text: JSON.stringify(value), host: "sheets.googleapis.com" };
}

test("Sheets discovery exposes editable resources and generates business field mappings", async () => {
  const api = sheets();
  const calls = [];
  const deps = {
    access: async () => ({ accessToken: "secret", connectionId: "connection" }),
    fetch: async (url, init) => {
      calls.push({ url, authorization: init.headers.get("authorization") });
      if (url.includes("/drive/v3/files"))
        return reply(200, {
          files: [
            {
              id: "sheet_abcdefghijk",
              name: "Enquiries",
              modifiedTime: "2026-10-25T00:00:00Z",
              capabilities: { canEdit: true },
            },
            { id: "readonly_abcdefghij", name: "Read only", capabilities: { canEdit: false } },
          ],
        });
      if (url.includes("fields="))
        return reply(200, {
          properties: { title: "Enquiries" },
          sheets: [
            {
              properties: {
                sheetId: 17,
                title: "October",
                index: 0,
                gridProperties: { rowCount: 20, columnCount: 5 },
              },
            },
          ],
        });
      return reply(200, { values: [["Full name", "Mobile", "Message"]] });
    },
  };
  const files = await api.listGoogleSpreadsheets("workspace", undefined, deps);
  const tabs = await api.listGoogleWorksheets("workspace", "sheet_abcdefghijk", deps);
  const headers = await api.getGoogleSheetHeaders(
    "workspace",
    "sheet_abcdefghijk",
    "October",
    deps,
  );
  const suggested = api.suggestEnquiryColumnMapping(headers);
  assert.equal(files.items[0].canEdit, true);
  assert.equal(files.items.length, 1);
  assert.equal(tabs.worksheets[0].title, "October");
  assert.equal(suggested.mapping.name, "Full name");
  assert.equal(suggested.mapping.phone, "Mobile");
  assert.equal(suggested.mapping.reason, "Message");
  assert.deepEqual(suggested.systemColumnsMissing, ["VocollAI Request ID", "VocollAI Record Type"]);
  assert.ok(calls.every((call) => call.authorization === "Bearer secret"));
});

test("destination preparation adds only reviewed safety columns and reconciles an uncertain header write", async () => {
  const api = sheets();
  let headerReads = 0,
    writes = 0;
  const fetch = async (url, init) => {
    if (url.includes("/drive/v3/files/sheet_abcdefghijk"))
      return reply(200, {
        id: "sheet_abcdefghijk",
        name: "Customer enquiries",
        capabilities: { canEdit: true },
      });
    if (url.includes("?fields="))
      return reply(200, {
        properties: { title: "Customer enquiries" },
        sheets: [{ properties: { sheetId: 17, title: "Enquiries", index: 0, hidden: false } }],
      });
    if (url.includes("1%3A1")) {
      headerReads++;
      return reply(200, {
        values: [
          [
            "Name",
            "Phone",
            "Reason",
            "Preferred time",
            ...(headerReads > 1 ? ["VocollAI Request ID", "VocollAI Record Type"] : []),
          ],
        ],
      });
    }
    if (init.method === "PUT") {
      writes++;
      throw new EgressError("TIMEOUT", "timeout", true);
    }
    throw new Error(`unexpected ${url}`);
  };
  const prepared = await api.prepareGoogleSheetDestination(
    {
      workspaceId: "workspace",
      spreadsheetId: "sheet_abcdefghijk",
      worksheetId: 17,
      allowAddSystemColumns: true,
    },
    { access: async () => ({ accessToken: "secret", connectionId: "connection" }), fetch },
  );
  assert.deepEqual(prepared.addedSystemColumns, ["VocollAI Request ID", "VocollAI Record Type"]);
  assert.deepEqual(prepared.missingRequired, []);
  assert.equal(prepared.destination.mapping.request_marker, "VocollAI Request ID");
  assert.equal(writes, 1);
  assert.ok(headerReads >= 2);
});

test("a server-authorized preview appends one visibly marked row and returns a bounded provider receipt", async () => {
  const api = sheets();
  const posts = [];
  const deps = {
    access: async () => ({ accessToken: "secret", connectionId: "connection" }),
    now: () => new Date("2026-10-25T12:00:00Z"),
    fetch: async (url, init) => {
      if (url.includes("1%3A1"))
        return reply(200, {
          values: [
            [
              "Name",
              "Phone",
              "Reason",
              "Preferred time",
              "VocollAI Request ID",
              "VocollAI Record Type",
            ],
          ],
        });
      if (url.includes("E2%3AE")) return reply(200, { values: [] });
      if (init.method === "POST") {
        posts.push(JSON.parse(init.body));
        return reply(200, { updates: { updatedRange: "Enquiries!A7:F7", updatedRows: 1 } });
      }
      throw new Error(`unexpected ${url}`);
    },
  };
  const result = await api.invokeGoogleSheetsAdapter(
    {
      workspaceId: "workspace",
      invocationId: "invocation-1",
      args: { name: "Alex", phone: "+13125550100", reason: "Repair", preferred_time: "Tuesday" },
      configuration: { operation: "append_google_sheet", destination },
      isSetupPreview: true,
    },
    deps,
  );
  assert.equal(result.ok, true);
  assert.equal(result.output.record_kind, "test");
  assert.equal(result.output.external_reference, "sheet_abcdefghijk:17:7");
  assert.equal(
    result.output.provider_link,
    "https://docs.google.com/spreadsheets/d/sheet_abcdefghijk/edit#gid=17&range=A7",
  );
  assert.deepEqual(posts[0].values[0], [
    "Alex",
    "+13125550100",
    "Repair",
    "Tuesday",
    "invocation-1",
    "Test enquiry",
  ]);
});

test("the stable invocation marker returns an existing receipt without another append", async () => {
  const api = sheets();
  let posts = 0;
  const deps = {
    access: async () => ({ accessToken: "secret", connectionId: "connection" }),
    fetch: async (url, init) => {
      if (url.includes("1%3A1"))
        return reply(200, {
          values: [
            [
              "Name",
              "Phone",
              "Reason",
              "Preferred time",
              "VocollAI Request ID",
              "VocollAI Record Type",
            ],
          ],
        });
      if (url.includes("E2%3AE")) return reply(200, { values: [["old"], ["same-invocation"]] });
      if (init.method === "POST") posts++;
      throw new Error(`unexpected ${url}`);
    },
  };
  const output = await api.appendGoogleSheetEnquiry(
    {
      workspaceId: "workspace",
      requestMarker: "same-invocation",
      destination,
      recordKind: "live",
      enquiry: { name: "A", phone: "B", reason: "C" },
    },
    deps,
  );
  assert.equal(output.already_present, true);
  assert.equal(output.row_number, 3);
  assert.equal(posts, 0);
});

test("an uncertain append is never retried and reconciliation only looks up its marker", async () => {
  const api = sheets();
  let posts = 0;
  const baseFetch = async (url, init) => {
    if (url.includes("1%3A1"))
      return reply(200, {
        values: [
          [
            "Name",
            "Phone",
            "Reason",
            "Preferred time",
            "VocollAI Request ID",
            "VocollAI Record Type",
          ],
        ],
      });
    if (url.includes("E2%3AE")) return reply(200, { values: [] });
    if (init.method === "POST") {
      posts++;
      throw new EgressError("TIMEOUT", "timeout", true);
    }
    throw new Error(`unexpected ${url}`);
  };
  const result = await api.invokeGoogleSheetsAdapter(
    {
      workspaceId: "workspace",
      invocationId: "uncertain",
      args: { name: "A", phone: "B", reason: "C" },
      configuration: { operation: "append_google_sheet", destination },
      isSetupPreview: false,
    },
    {
      access: async () => ({ accessToken: "secret", connectionId: "connection" }),
      fetch: baseFetch,
    },
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "OUTCOME_UNKNOWN");
  assert.equal(result.sent, true);
  assert.equal(posts, 1);
  const state = await api.reconcileGoogleSheetWrite(
    { workspaceId: "workspace", requestMarker: "uncertain", destination, recordKind: "live" },
    {
      access: async () => ({ accessToken: "secret", connectionId: "connection" }),
      fetch: baseFetch,
    },
  );
  assert.equal(state.state, "needs_check");
  assert.equal(posts, 1);
});

test("renamed required columns and revoked authorization fail closed", async () => {
  const api = sheets();
  const drift = await api.invokeGoogleSheetsAdapter(
    {
      workspaceId: "workspace",
      invocationId: "drift",
      args: { name: "A", phone: "B", reason: "C" },
      configuration: { operation: "append_google_sheet", destination },
      isSetupPreview: true,
    },
    {
      access: async () => ({ accessToken: "secret", connectionId: "connection" }),
      fetch: async () =>
        reply(200, {
          values: [
            [
              "Name",
              "Phone",
              "Changed",
              "Preferred time",
              "VocollAI Request ID",
              "VocollAI Record Type",
            ],
          ],
        }),
    },
  );
  assert.equal(drift.ok, false);
  assert.equal(drift.code, "CONTRACT_DRIFT");
  const revoked = await api.invokeGoogleSheetsAdapter(
    {
      workspaceId: "workspace",
      invocationId: "revoked",
      args: { name: "A", phone: "B", reason: "C" },
      configuration: { operation: "append_google_sheet", destination },
      isSetupPreview: true,
    },
    {
      access: async () => {
        throw new api.GoogleSheetsError("AUTH_INVALID", "Reconnect Google");
      },
    },
  );
  assert.equal(revoked.ok, false);
  assert.equal(revoked.code, "AUTH_INVALID");
});

test("a Google 401 marks only the access-token connection for reconnect", async () => {
  const api = sheets();
  const marked = [];
  await assert.rejects(
    api.listGoogleWorksheets("workspace", "sheet_abcdefghijk", {
      access: async () => ({ accessToken: "stale", connectionId: "old-connection" }),
      markReconnect: async (...args) => marked.push(args),
      fetch: async () => reply(401, { error: "invalid token" }),
    }),
    (error) => error.code === "AUTH_INVALID",
  );
  assert.deepEqual(marked, [["workspace", "old-connection"]]);
});
