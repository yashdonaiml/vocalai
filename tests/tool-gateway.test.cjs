const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loader, database } = require('./helpers.cjs');

function fixture(risk = 'read') {
  process.env.PROVIDER_KEY_SECRET = 'test-only-encryption-key';
  const tables = {
    tool_definitions: [{ id: 'tool', workspace_id: 'ws', connector_id: 'connector', stable_slug: 'lookup', state: 'active', current_revision_id: 'rev' }],
    tool_revisions: [{ id: 'rev', workspace_id: 'ws', tool_id: 'tool', display_name: 'Lookup', input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false } }],
    tool_connectors: [{ id: 'connector', workspace_id: 'ws', canonical_origin: 'https://business.example', admin_enabled: true, health: 'healthy', type: 'http' }],
    tool_approvals: [{ tool_revision_id: 'rev', workspace_id: 'ws', status: 'approved', risk_class: risk, confirmation_minimum: 'none', policy_revision: 1, allowed_contexts: ['voice_session', 'workflow'] }],
    workspaces: [{ id: 'ws', org_id: 'org' }],
    tool_policies: [], tool_credentials: [],
    workflow_tool_bindings: [{ workspace_id: 'ws', workflow_version_id: 'version', step_id: 'step', tool_revision_id: 'rev' }],
    workflow_versions: [{ id: 'version', workspace_id: 'ws', workflow_id: 'wf' }],
    workflow_runs: [{ id: 'run', workspace_id: 'ws', workflow_id: 'wf', workflow_version_id: 'version', status: 'running' }],
  };
  const calls = [];
  let response = { ok: true, output: { answer: 42 }, host: 'business.example', statusCode: 200 };
  const binding = { tool_id: 'tool', tool_revision_id: 'rev', alias: 'lookup' };
  const session = { workspace_id: 'ws', deployment_id: 'deployment' };
  const db = database(tables);
  const load = loader({
    '@/integrations/supabase/client.server': { supabaseAdmin: db },
    './adapters/http.server': { invokeHttp: async (req) => { calls.push(req); return response; } },
    './adapters/mcp.server': { invokeMcp: async () => { throw new Error('Unexpected MCP'); } },
    './bindings.server': { sessionBinding: async () => ({ session, binding }) },
  });
  return { tables, calls, binding, session, load, gateway: load('src/lib/tools/gateway.server.ts'), respond: (r) => { response = r; } };
}

const voice = { kind: 'voice_session', sessionId: 'session', turnId: 'turn', deploymentId: 'deployment' };
const request = (context = voice) => ({ workspaceId: 'ws', toolId: 'tool', toolRevisionId: 'rev', context, arguments: { id: 'customer-1' } });

test('voice calls use the gateway adapter and record the invocation and attempt', async () => {
  const f = fixture();
  const result = await f.gateway.invokeTool(request());
  assert.equal(result.status, 'succeeded');
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.calls[0].args, { id: 'customer-1' });
  assert.equal(f.tables.tool_invocations[0].session_id, 'session');
  assert.equal(f.tables.tool_attempts.length, 1);
  assert.match(result.forModel, /trusted="false"/);
});

test('voice cannot widen its deployed revision binding', async () => {
  const f = fixture();
  f.binding.tool_revision_id = 'different';
  assert.equal((await f.gateway.invokeTool(request())).status, 'blocked');
  assert.equal(f.calls.length, 0);
});

test('workflow uses its run/version/step binding and blocks confirmation-required actions', async () => {
  const f = fixture('write');
  const workflow = { kind: 'workflow', workflowVersionId: 'version', runId: 'run', stepId: 'step' };
  const result = await f.gateway.invokeTool(request(workflow));
  assert.equal(result.error.code, 'CONFIRM_REQUIRED');
  assert.equal(f.calls.length, 0);
  f.tables.workflow_runs[0].workflow_version_id = 'other-version';
  assert.equal((await f.gateway.invokeTool(request(workflow))).error.code, 'POLICY_DENIED');
});

test('approved workflow reads use the gateway with their explicit arguments', async () => {
  const f = fixture();
  f.tables.workflow_runs[0].source = 'live';
  const result = await f.gateway.invokeTool(request({ kind: 'workflow', workflowVersionId: 'version', runId: 'run', stepId: 'step' }));
  assert.equal(result.status, 'succeeded');
  assert.deepEqual(f.calls[0].args, { id: 'customer-1' });
  assert.equal(f.tables.tool_invocations[0].workflow_step_id, 'step');
  const event = f.tables.domain_events.find((row) => row.type === 'tool.succeeded');
  assert.equal(event.payload.invocation_id, result.invocationId);
  assert.deepEqual(Object.keys(event.payload).sort(), ['context', 'invocation_id', 'tool_id', 'tool_name']);
});

test('manual workflow tool tests do not enqueue owner notifications', async () => {
  const f = fixture();
  f.tables.workflow_runs[0].source = 'manual';
  const result = await f.gateway.invokeTool(request({ kind: 'workflow', workflowVersionId: 'version', runId: 'run', stepId: 'step' }));
  assert.equal(result.status, 'succeeded');
  assert.equal((f.tables.domain_events ?? []).some((row) => row.type === 'tool.succeeded'), false);
});

test('sandbox tool tests require sandbox permission rather than mock permission', async () => {
  const permissions = [];
  const invocations = [];
  const api = loader({
    '@tanstack/react-start': { createServerFn: () => {
      let validate = (value) => value;
      const chain = { middleware: () => chain, validator: (fn) => { validate = fn; return chain; }, handler: (fn) => (args) => fn({ ...args, data: validate(args.data) }) };
      return chain;
    } },
    '@/integrations/supabase/auth-middleware': { requireSupabaseAuth: {} },
    './tools/gateway.server': { invokeTool: async (request) => { invocations.push(request); return { status: 'succeeded', output: { ok: true } }; } },
  })('src/lib/tools.functions.ts');
  const context = { userId: 'user', supabase: { rpc: async (_fn, args) => { permissions.push(args._perm); return { data: args._perm === 'tool.test.sandbox' }; } } };
  await api.testToolCall({ context, data: { workspaceId: crypto.randomUUID(), toolId: crypto.randomUUID(), mode: 'sandbox', input: '{}' } });
  assert.deepEqual(permissions, ['tool.test.sandbox']);
  assert.equal(invocations[0].context.mode, 'sandbox');
  await assert.rejects(api.testToolCall({ context, data: { workspaceId: crypto.randomUUID(), toolId: crypto.randomUUID(), mode: 'mock', input: '{}' } }), /don't have permission/);
  assert.deepEqual(permissions, ['tool.test.sandbox', 'tool.test.mock']);
});

test('session tools resolve from their pinned bundle and fail closed after hangup or tenant mismatch', async () => {
  const tables = {
    conversations: [{ id: 'session', workspace_id: 'ws', agent_id: 'agent', agent_version: 2, deployment_id: 'deployment', status: 'active' }],
    deployments: [{ id: 'deployment', workspace_id: 'ws', agent_id: 'agent', agent_version: 2, bundle_id: 'bundle' }],
    runtime_bundles: [{ id: 'bundle', workspace_id: 'ws', agent_id: 'agent', bundle: { tools: [{ tool_id: 'tool', tool_revision_id: 'rev', alias: 'lookup' }] } }],
  };
  const { sessionBinding } = loader({ '@/integrations/supabase/client.server': { supabaseAdmin: database(tables) } })('src/lib/tools/bindings.server.ts');
  assert.equal((await sessionBinding('session', 'lookup')).binding.tool_revision_id, 'rev');
  await assert.rejects(sessionBinding('session', 'unbound'), /not in this session/);
  tables.conversations[0].status = 'completed';
  await assert.rejects(sessionBinding('session', 'lookup'), /not active/);
  tables.conversations[0].status = 'active';
  tables.runtime_bundles[0].workspace_id = 'other-tenant';
  await assert.rejects(sessionBinding('session', 'lookup'), /not in this session/);
});

test('legacy bundles resolve only the migrated immutable revision with the same schema', async () => {
  const schema = { type: 'object', properties: { id: { type: 'string' } } };
  const tables = {
    conversations: [{ id: 'session', workspace_id: 'ws', agent_id: 'agent', agent_version: 1, deployment_id: 'deployment', status: 'active' }],
    deployments: [{ id: 'deployment', workspace_id: 'ws', agent_id: 'agent', agent_version: 1, bundle_id: 'bundle' }],
    runtime_bundles: [{ id: 'bundle', workspace_id: 'ws', agent_id: 'agent', bundle: { tools: [{ id: 'legacy-tool', name: 'lookup', parameters: schema }] } }],
    tool_connectors: [{ id: 'connector', workspace_id: 'ws', configuration: { legacy_tool_id: 'legacy-tool' } }],
    tool_definitions: [{ id: 'tool', workspace_id: 'ws', connector_id: 'connector', stable_slug: 'lookup' }],
    tool_revisions: [{ id: 'migrated-revision', workspace_id: 'ws', tool_id: 'tool', revision_no: 1, input_schema: schema }],
  };
  const { sessionBinding } = loader({ '@/integrations/supabase/client.server': { supabaseAdmin: database(tables) } })('src/lib/tools/bindings.server.ts');
  assert.equal((await sessionBinding('session', 'lookup')).binding.tool_revision_id, 'migrated-revision');
  tables.runtime_bundles[0].bundle.tools[0].parameters = { type: 'string' };
  await assert.rejects(sessionBinding('session', 'lookup'), /no pinned tool revision/);
});

test('live workflow executes the published graph with mapped inputs and does not retry gateway failures', async () => {
  const f = fixture();
  f.tables.workflows = [{ id: 'wf', workspace_id: 'ws', name: 'Lookup', trigger: 'call.ended', published_version_id: 'version', steps: [] }];
  f.tables.workflow_versions[0].graph = { version: 1, nodes: [
    { id: 'start', type: 'trigger' },
    { id: 'step', type: 'action', kind: 'call_tool', value: 'tool', mappings: [{ key: 'id', source: 'literal', value: 'explicit-input' }] },
    { id: 'end', type: 'end' },
  ], edges: [{ id: 'edge', source: 'start', target: 'step' }, { id: 'finish', source: 'step', target: 'end' }] };
  f.respond({ ok: false, sent: true, code: 'REMOTE_ERROR', statusCode: 500, host: 'business.example' });
  const result = await f.load('src/lib/workflows.server.ts').executeWorkflow('wf', null, 'live', null);
  assert.equal(result.status, 'failed');
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.calls[0].args, { id: 'explicit-input' });
  assert.equal(f.tables.workflow_runs.at(-1).workflow_version_id, 'version');
});

test('workflow execution follows the selected branch and records skipped nodes and the terminal node', async () => {
  const f = fixture();
  f.tables.conversations = [{ id: 'call', workspace_id: 'ws', agent_id: 'agent', summary: 'Long call', duration_seconds: 45, channel: 'web', started_at: new Date().toISOString(), session_ref: 'call' }];
  f.tables.workflows = [{ id: 'wf', workspace_id: 'ws', name: 'Branch check', trigger: 'call.ended', published_version_id: 'version', steps: [], agent_id: null }];
  f.tables.workflow_tool_bindings = [
    { workspace_id: 'ws', workflow_version_id: 'version', step_id: 'yes-action', tool_revision_id: 'rev' },
    { workspace_id: 'ws', workflow_version_id: 'version', step_id: 'no-action', tool_revision_id: 'rev' },
  ];
  f.tables.workflow_versions[0].graph = { version: 1, nodes: [
    { id: 'start', type: 'trigger' },
    { id: 'condition', type: 'condition', kind: 'duration_over', value: '30' },
    { id: 'yes-action', type: 'action', kind: 'call_tool', value: 'tool', mappings: [{ key: 'id', source: 'literal', value: 'customer-1' }] },
    { id: 'no-action', type: 'action', kind: 'call_tool', value: 'tool', mappings: [{ key: 'id', source: 'literal', value: 'customer-2' }] },
    { id: 'end', type: 'end' },
  ], edges: [
    { id: 'start-condition', source: 'start', target: 'condition' },
    { id: 'yes-action-edge', source: 'condition', target: 'yes-action', outcome: 'yes' },
    { id: 'no-action-edge', source: 'condition', target: 'no-action', outcome: 'no' },
    { id: 'yes-end', source: 'yes-action', target: 'end' },
    { id: 'no-end', source: 'no-action', target: 'end' },
  ] };
  const result = await f.load('src/lib/workflows.server.ts').executeWorkflow('wf', 'call', 'live', null);
  assert.equal(result.status, 'succeeded');
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].args.id, 'customer-1');
  const byNode = new Map(result.steps.map((step) => [step.nodeId, step]));
  assert.equal(byNode.get('condition').outcome, 'yes');
  assert.equal(byNode.get('yes-action').status, 'ok');
  assert.equal(byNode.get('no-action').status, 'skipped');
  assert.equal(byNode.get('end').status, 'ok');
});

test('write arguments are encrypted, frozen, and execute only once after confirmation', async () => {
  const f = fixture('write');
  const result = await f.gateway.invokeTool(request());
  assert.equal(result.status, 'pending_confirmation');
  assert.equal(f.calls.length, 0);
  assert.ok(!f.tables.tool_pending_actions[0].frozen_arguments.includes('customer-1'));
  const confirmed = await f.gateway.executePendingAction('ws', result.confirmation.id, { channel: 'caller' }, 'confirm');
  assert.equal(confirmed.status, 'succeeded');
  assert.equal((await f.gateway.executePendingAction('ws', result.confirmation.id, {}, 'confirm')).status, 'blocked');
  assert.equal(f.calls.length, 1);
});

test('web test calls record a null deployment ID and can confirm against their session', async () => {
  const f = fixture('write');
  f.session.deployment_id = null;
  const result = await f.gateway.invokeTool(request({ ...voice, deploymentId: '' }));
  assert.equal(f.tables.tool_invocations[0].deployment_id, null);
  assert.equal((await f.gateway.executePendingAction('ws', result.confirmation.id, {}, 'confirm')).status, 'succeeded');
});

test('concurrent confirmations claim a frozen action at most once', async () => {
  const f = fixture('write');
  const pending = await f.gateway.invokeTool(request());
  const results = await Promise.all([
    f.gateway.executePendingAction('ws', pending.confirmation.id, {}, 'confirm'),
    f.gateway.executePendingAction('ws', pending.confirmation.id, {}, 'confirm'),
  ]);
  assert.equal(results.filter((r) => r.status === 'succeeded').length, 1);
  assert.equal(f.calls.length, 1);
});

test('revocation and tampered frozen arguments fail closed before execution', async () => {
  for (const mutate of [
    (f) => { f.tables.tool_connectors[0].admin_enabled = false; },
    (f) => { f.tables.tool_pending_actions[0].args_digest = 'tampered'; },
  ]) {
    const f = fixture('write');
    const result = await f.gateway.invokeTool(request());
    mutate(f);
    assert.equal((await f.gateway.executePendingAction('ws', result.confirmation.id, {}, 'confirm')).status, 'blocked');
    assert.equal(f.calls.length, 0);
  }
});

test('sent writes with an unknown outcome are never retried', async () => {
  const f = fixture('write');
  f.tables.tool_approvals[0].safe_to_retry = true;
  f.respond({ ok: false, sent: true, code: 'TIMEOUT', host: 'business.example' });
  const pending = await f.gateway.invokeTool(request());
  const result = await f.gateway.executePendingAction('ws', pending.confirmation.id, {}, 'confirm');
  assert.equal(result.status, 'outcome_unknown');
  assert.equal(f.calls.length, 1);
});

test('caller confirmation rejects negations, ambiguous speech and low confidence', () => {
  const classify = loader({})('src/lib/runtime/confirmation.ts').classifyConfirmation;
  assert.equal(classify('Yes, please.'), 'confirm');
  assert.equal(classify("Yes but don't do it"), 'deny');
  assert.equal(classify('Yes', 0.69), 'unclear');
  assert.equal(classify('I suppose you could'), 'unclear');
});

test('Telugu callback confirmation accepts explicit assent and rejects corrections or uncertainty', () => {
  const classify = loader({})('src/lib/runtime/confirmation.ts').classifyConfirmation;
  for (const utterance of ['అవును.', 'అవును save చేయండి', 'avunu save cheyandi', 'సరే']) assert.equal(classify(utterance), 'confirm');
  for (const utterance of ['వద్దు', 'కాదు', 'రద్దు చేయండి', 'vaddu']) assert.equal(classify(utterance), 'deny');
  for (const utterance of ['అవును కానీ number మార్చండి', 'అవును వద్దు', 'maybe', 'ఆ పేరు కాదు']) assert.equal(classify(utterance), 'unclear');
  assert.equal(classify('అవును', 0.6), 'unclear');
});

test('runtime signatures bind the nonce and body and reject replays and invalid timestamps', async () => {
  process.env.RUNTIME_SHARED_SECRET = 'test-only-runtime-secret';
  const db = database({});
  const load = loader({ '@/integrations/supabase/client.server': { supabaseAdmin: db } });
  const { verifyRuntimeRequest } = load('src/lib/runtime/session.server.ts');
  const { hmacHex } = load('src/lib/crypto.server.ts');
  const body = '{"session_id":"session"}';
  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomUUID();
  const sig = await hmacHex(process.env.RUNTIME_SHARED_SECRET, `${ts}.${nonce}.${body}`);
  const make = (timestamp = ts, content = body) => new Request('https://console.example/api/public/runtime/tool', { method: 'POST', body: content, headers: { 'x-aviroh-timestamp': timestamp, 'x-aviroh-nonce': nonce, 'x-aviroh-signature': sig } });
  assert.deepEqual(await verifyRuntimeRequest(make()), { session_id: 'session' });
  await assert.rejects(verifyRuntimeRequest(make()), (e) => e.status === 401);
  await assert.rejects(verifyRuntimeRequest(make('NaN')), (e) => e.status === 401);
  await assert.rejects(verifyRuntimeRequest(make(String(Number(ts) - 61))), (e) => e.status === 401);
  await assert.rejects(verifyRuntimeRequest(make(ts, '{}')), (e) => e.status === 401);
});
