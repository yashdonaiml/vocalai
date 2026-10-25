const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loader, database } = require("./helpers.cjs");
const serverFn = {
  createServerFn: () => {
    let validate = (v) => v;
    const c = {
      middleware: () => c,
      validator: (fn) => {
        validate = fn;
        return c;
      },
      handler: (fn) => (args) => fn({ ...args, data: validate(args.data) }),
    };
    return c;
  },
};
function fixture() {
  const ids = Object.fromEntries(
    ["tool", "revision", "ws", "connector", "user"].map((k) => [k, crypto.randomUUID()]),
  );
  const tables = {
    tool_definitions: [
      {
        id: ids.tool,
        workspace_id: ids.ws,
        current_revision_id: ids.revision,
        connector_id: ids.connector,
        state: "active",
      },
    ],
    tool_revisions: [
      {
        id: ids.revision,
        tool_id: ids.tool,
        workspace_id: ids.ws,
        adapter_mapping: { integration_task: "support_ticket" },
      },
    ],
    tool_approvals: [
      {
        tool_revision_id: ids.revision,
        status: "approved",
        allowed_contexts: ["console_test"],
        policy_revision: 1,
        created_at: "2026-01-01",
      },
    ],
    tool_invocations: [
      {
        id: "receipt",
        workspace_id: ids.ws,
        tool_id: ids.tool,
        tool_revision_id: ids.revision,
        context_kind: "console_test",
        mode: "live",
        status: "succeeded",
        started_at: new Date().toISOString(),
      },
    ],
    tool_connectors: [{ id: ids.connector, workspace_id: ids.ws, type: "http", archived_at: null }],
  };
  let permitted = true;
  const permissions = [],
    operations = [];
  const db = database(tables);
  const api = loader({
    "@tanstack/react-start": serverFn,
    "@/integrations/supabase/auth-middleware": { requireSupabaseAuth: {} },
    "@/integrations/supabase/client.server": { supabaseAdmin: db },
    "./tools/catalog.server": {
      upsertOperation: async (...args) => {
        operations.push(args);
        return { toolId: ids.tool };
      },
    },
  })("src/lib/tools.functions.ts");
  const context = {
    userId: ids.user,
    supabase: {
      rpc: async (_, args) => {
        permissions.push(args);
        return { data: permitted };
      },
    },
  };
  return {
    ids,
    tables,
    api,
    context,
    operations,
    permissions,
    deny: () => {
      permitted = false;
    },
  };
}
test("guided task contracts produce supported query/body mappings and reject unsafe paths", () => {
  const api = loader({})("src/lib/integration-tasks.ts");
  const read = api.taskOperation("customer_lookup", "/customers");
  assert.equal(read.mapping.params.email, "query");
  assert.equal(read.risk, "read");
  const write = api.taskOperation("support_ticket", "/tickets");
  assert.equal(write.mapping.params.subject, "body");
  assert.equal(write.inputSchema.additionalProperties, false);
  for (const path of [
    "//other.example",
    "/tickets?token=secret",
    "/tickets/{id}",
    "https://other.example",
  ])
    assert.throws(() => api.taskOperation("support_ticket", path));
  assert.throws(() => api.taskOperation("invented", "/tickets"));
});
test("guided setup uses existing workspace-scoped catalog and never approves during configuration", async () => {
  const f = fixture();
  await f.api.configureIntegration({
    data: { connectorId: f.ids.connector, taskId: "support_ticket", path: "/tickets" },
    context: f.context,
  });
  assert.equal(f.operations[0][0], f.ids.ws);
  assert.equal(f.operations[0][2].mapping.integration_task, "support_ticket");
  assert.equal(f.tables.tool_approvals.length, 1);
  f.deny();
  await assert.rejects(
    f.api.configureIntegration({
      data: { connectorId: f.ids.connector, taskId: "support_ticket", path: "/tickets" },
      context: f.context,
    }),
    /permission/,
  );
  assert.equal(f.operations.length, 1);
});
test("live approval requires permission and successful real evidence on the exact workspace and revision", async () => {
  for (const change of [
    (f) => f.deny(),
    (f) => {
      f.tables.tool_invocations = [];
    },
    (f) => {
      f.tables.tool_invocations[0].mode = "mock";
    },
    (f) => {
      f.tables.tool_invocations[0].status = "pending_confirmation";
    },
    (f) => {
      f.tables.tool_invocations[0].tool_revision_id = crypto.randomUUID();
    },
    (f) => {
      f.tables.tool_invocations[0].workspace_id = crypto.randomUUID();
    },
    (f) => {
      f.tables.tool_invocations[0].started_at = "2020-01-01";
    },
    (f) => {
      f.tables.tool_approvals[0].status = "revoked";
    },
  ]) {
    const f = fixture();
    change(f);
    await assert.rejects(
      f.api.approveIntegration({ data: { toolId: f.ids.tool }, context: f.context }),
    );
    assert.equal(f.tables.tool_approvals.length, 1);
  }
  const f = fixture();
  await f.api.approveIntegration({ data: { toolId: f.ids.tool }, context: f.context });
  const approval = f.tables.tool_approvals[1];
  assert.deepEqual(approval.allowed_contexts, ["console_test", "voice_session"]);
  assert.equal(approval.confirmation_minimum, "voice_readback");
  assert.equal(approval.safe_to_retry, false);
});
test("advanced review cannot bypass the real-test requirement for a guided action", async () => {
  const f = fixture();
  f.tables.tool_invocations = [];
  await assert.rejects(
    f.api.reviewTool({
      data: {
        revisionId: f.ids.revision,
        decision: "approve",
        riskClass: "write",
        confirmation: "voice_readback",
        contexts: ["voice_session"],
        safeToRetry: false,
      },
      context: f.context,
    }),
    /successful real test/,
  );
  assert.equal(f.tables.tool_approvals.length, 1);
});
