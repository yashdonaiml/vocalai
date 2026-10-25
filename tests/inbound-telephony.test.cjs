const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { loader, database } = require('./helpers.cjs');

function routes() {
  const workspace = crypto.randomUUID(), agent = crypto.randomUUID(), environment = crypto.randomUUID(), number = crypto.randomUUID();
  const tables = { agents: [{ id: agent, workspace_id: workspace, status: 'draft' }], environments: [{ id: environment, workspace_id: workspace }], phone_numbers: [{ id: number, workspace_id: workspace, agent_id: agent, environment_id: environment, e164: '+15551234567', carrier: 'telnyx', status: 'pending' }] };
  const db = database(tables);
  const calls = [];
  let fail = false;
  const load = loader({
    '@/integrations/supabase/client.server': { supabaseAdmin: db },
    './runtime/livekit.server': { mediaConfigured: () => true, provisionInboundNumber: async (input) => { calls.push(input); if (fail) throw new Error('secret provider details'); return { trunkRef: 'trunk', ruleRef: 'rule' }; } },
  });
  return { workspace, agent, environment, number, tables, calls, load, fail: () => { fail = true; } };
}

test('phone route validation rejects foreign agents and environments before provisioning', async () => {
  const f = routes();
  const api = f.load('src/lib/telephony.server.ts');
  await assert.rejects(api.validatePhoneRoute(f.workspace, crypto.randomUUID(), f.environment), /in this workspace/);
  await assert.rejects(api.validatePhoneRoute(f.workspace, f.agent, crypto.randomUUID()), /in this workspace/);
  f.tables.agents[0].status = 'archived';
  await assert.rejects(api.provisionPhoneNumber(f.workspace, f.number), /available agent/);
  assert.equal(f.calls.length, 0);
});

test('provisioning persists recoverable failures without leaking provider errors', async () => {
  const f = routes();
  f.fail();
  const result = await f.load('src/lib/telephony.server.ts').provisionPhoneNumber(f.workspace, f.number);
  assert.equal(result.provisioned, false);
  assert.equal(f.tables.phone_numbers[0].status, 'error');
  assert.equal(f.tables.phone_numbers[0].provisioning_token, null);
  assert.ok(!JSON.stringify(result).includes('secret provider details'));
});

test('only one concurrent provisioning attempt can claim a number', async () => {
  const f = routes();
  const api = f.load('src/lib/telephony.server.ts');
  const results = await Promise.allSettled([api.provisionPhoneNumber(f.workspace, f.number), api.provisionPhoneNumber(f.workspace, f.number)]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(f.calls.length, 1);
  assert.equal(f.tables.phone_numbers[0].status, 'routed');
});

test('phone server functions require workspace admin permission before changing routes', async () => {
  const f = routes();
  const api = loader({
    '@tanstack/react-start': { createServerFn: () => {
      let validate = (v) => v;
      const chain = { middleware: () => chain, validator: (fn) => { validate = fn; return chain; }, handler: (fn) => (args) => fn({ ...args, data: validate(args.data) }) };
      return chain;
    } },
    '@/integrations/supabase/auth-middleware': { requireSupabaseAuth: {} },
    '@/integrations/supabase/client.server': { supabaseAdmin: database(f.tables) },
  })('src/lib/telephony.functions.ts');
  const context = { supabase: { rpc: async () => ({ data: false }) } };
  await assert.rejects(api.addPhoneNumber({ context, data: { workspaceId: f.workspace, agentId: f.agent, environmentId: f.environment, e164: '+15551234568', carrier: 'telnyx' } }), /Only workspace admins/);
  await assert.rejects(api.retryPhoneNumber({ context, data: { workspaceId: f.workspace, numberId: f.number } }), /Only workspace admins/);
  await assert.rejects(api.removePhoneNumber({ context, data: { workspaceId: f.workspace, numberId: f.number } }), /Only workspace admins/);
  assert.equal(f.tables.phone_numbers.length, 1);
});

test('inbound session creation pins the deployment and repeated opens preserve the version and caller', async () => {
  const f = routes(), deployment = crypto.randomUUID(), bundle = crypto.randomUUID();
  Object.assign(f.tables.phone_numbers[0], { status: 'routed', sip_trunk_ref: 'trunk', dispatch_rule_ref: 'rule' });
  f.tables.workspaces = [{ id: f.workspace, org_id: crypto.randomUUID() }];
  f.tables.deployments = [{ id: deployment, workspace_id: f.workspace, agent_id: f.agent, environment_id: f.environment, status: 'active', canary_percent: 100, agent_version: 1, bundle_id: bundle }];
  f.tables.runtime_bundles = [{ id: bundle, workspace_id: f.workspace, agent_id: f.agent, environment_id: f.environment, agent_version: 1, checksum: 'checksum', bundle: { runtime: { mode: 'native', realtime: { provider: 'openai', model: 'test' }, voice: 'test' } } }];
  const load = loader({
    '@/integrations/supabase/client.server': { supabaseAdmin: database(f.tables) },
    './bundle.server': { bundleCredentials: async () => ({ test: 'session-key' }) },
    '../workflows.server': { dispatchWorkflows: async () => undefined },
  });
  const api = load('src/lib/runtime/session.server.ts');
  const input = { phone_number_id: f.number, session_ref: `pstn-${f.number}-call`, caller: '+15557654321' };
  const first = await api.openSession(input);
  assert.equal(f.tables.conversations.length, 1);
  assert.equal(f.tables.conversations[0].caller_number, input.caller);
  assert.equal(f.tables.conversations[0].runtime_bundle_id, bundle);
  assert.equal(f.tables.conversations[0].runtime_mode, 'native');
  // The fake database represents the workspace join returned by Supabase.
  f.tables.conversations[0].workspaces = { org_id: f.tables.workspaces[0].org_id };
  f.tables.deployments[0].status = 'superseded';
  assert.equal((await api.openSession(input)).session_id, first.session_id);
  assert.equal(f.tables.conversations.length, 1);
  f.tables.phone_numbers[0].status = 'pending';
  await assert.rejects(api.openSession({ ...input, session_ref: `pstn-${f.number}-new` }), /not configured/);
});

test('inbound calls reject canary-only deployments and foreign workspace routing', async () => {
  const f = routes();
  Object.assign(f.tables.phone_numbers[0], { status: 'routed', sip_trunk_ref: 'trunk', dispatch_rule_ref: 'rule' });
  f.tables.deployments = [{ workspace_id: f.workspace, agent_id: f.agent, environment_id: f.environment, status: 'active', canary_percent: 10, bundle_id: crypto.randomUUID() }];
  const api = loader({ '@/integrations/supabase/client.server': { supabaseAdmin: database(f.tables) } })('src/lib/runtime/session.server.ts');
  const input = { phone_number_id: f.number, session_ref: `pstn-${f.number}-call` };
  await assert.rejects(api.openSession(input), /100%/);
  f.tables.agents[0].workspace_id = crypto.randomUUID();
  await assert.rejects(api.openSession(input), /in this workspace/);
});

test('partial remote provisioning recovers its trunk on retry and enforces encrypted carrier-restricted media', async () => {
  process.env.LIVEKIT_URL = 'wss://project.livekit.cloud';
  process.env.LIVEKIT_API_KEY = 'test'; process.env.LIVEKIT_API_SECRET = 'test';
  process.env.TELNYX_SIP_ALLOWED_ADDRESSES = '192.76.120.10/32,64.16.250.10/32';
  const trunks = [], rules = [];
  let failRule = true, createdTrunks = 0;
  class SipClient {
    async listSipInboundTrunk() { return trunks; }
    async listSipDispatchRule() { return rules; }
    async createSipInboundTrunk(name, numbers, opts) { const t = { name, numbers, ...opts, sipTrunkId: 'trunk' }; trunks.push(t); createdTrunks++; return t; }
    async updateSipInboundTrunkFields(id, opts) { Object.assign(trunks[0], { numbers: opts.numbers.set, allowedAddresses: opts.allowedAddresses.set, mediaEncryption: opts.mediaEncryption }); return trunks[0]; }
    async createSipDispatchRule(rule, opts) { if (failRule) throw new Error('network timeout'); const r = { ...opts, rule, sipDispatchRuleId: 'rule' }; rules.push(r); return r; }
  }
  const api = loader({ 'livekit-server-sdk': { SipClient } })('src/lib/runtime/livekit.server.ts');
  const input = { e164: '+15551234567', numberId: crypto.randomUUID(), carrier: 'telnyx' };
  await assert.rejects(api.provisionInboundNumber(input), /network timeout/);
  failRule = false;
  assert.deepEqual(await api.provisionInboundNumber(input), { trunkRef: 'trunk', ruleRef: 'rule' });
  assert.deepEqual(await api.provisionInboundNumber(input), { trunkRef: 'trunk', ruleRef: 'rule' });
  assert.equal(createdTrunks, 1);
  assert.equal(rules.length, 1);
  assert.equal(trunks[0].mediaEncryption, 2);
  assert.deepEqual(trunks[0].allowedAddresses, ['192.76.120.10/32', '64.16.250.10/32']);
  assert.equal(rules[0].roomConfig.agents[0].agentName, 'aviroh-runtime');
  assert.equal(JSON.parse(rules[0].roomConfig.agents[0].metadata).phone_number_id, input.numberId);
  process.env.TELNYX_SIP_ALLOWED_ADDRESSES = '0.0.0.0/0';
  assert.throws(() => api.carrierAddresses('telnyx'), /Invalid signaling/);
  delete process.env.TELNYX_SIP_ALLOWED_ADDRESSES;
  assert.throws(() => api.carrierAddresses('telnyx'), /Set TELNYX/);
});

function engineLoader() {
  return loader({
    '@livekit/rtc-node': { RoomEvent: { ParticipantConnected: 'joined', ParticipantDisconnected: 'left', Disconnected: 'disconnected' }, ParticipantKind: { SIP: 'sip', AGENT: 'agent' } },
    '@livekit/agents-plugin-openai': {}, '@livekit/agents-plugin-google': {}, '@livekit/agents-plugin-deepgram': {}, '@livekit/agents-plugin-elevenlabs': {}, '@livekit/agents-plugin-cartesia': {}, '@livekit/agents-plugin-silero': {},
  })('runtime/src/engines.ts');
}

test('separate voice engine preserves Telugu pronunciation and multilingual recognition', async () => {
  const instances=[];
  class Fake { constructor(options){this.options=options;instances.push(options);} }
  const api=loader({
    '@livekit/rtc-node': {},
    '@livekit/agents-plugin-openai': {}, '@livekit/agents-plugin-google': {LLM:Fake},
    '@livekit/agents-plugin-deepgram': {STT:Fake}, '@livekit/agents-plugin-elevenlabs': {},
    '@livekit/agents-plugin-cartesia': {TTS:Fake}, '@livekit/agents-plugin-silero': {},
  })('runtime/src/engines.ts');
  const options=await api.buildSessionOptions({runtime:{mode:'composable',stt:{provider:'deepgram',model:'nova-3',language:'multi'},llm:{provider:'google',model:'test'},tts:{provider:'cartesia',model:'sonic-3.6',voice:'native-telugu',language:'te'}}},{deepgram:'test',google:'test',cartesia:'test'},{});
  assert.equal(options.stt.options.language,'multi');assert.equal(options.tts.options.language,'te');assert.equal(options.tts.options.voice,'native-telugu');
});

test('telephone startup waits for a SIP caller and ignores unrelated participants', async () => {
  const api = engineLoader();
  const room = new EventEmitter(); room.remoteParticipants = new Map([['observer', { identity: 'observer', kind: 'agent' }]]);
  const waiting = api.waitForCaller({ room }, true, 1000);
  room.emit('joined', { identity: 'browser', kind: 'standard' });
  const caller = { identity: 'caller', kind: 'sip', attributes: { 'sip.phoneNumber': '+15551234567' } };
  room.emit('joined', caller);
  assert.equal(await waiting, caller);
  assert.equal(room.listenerCount('joined'), 0);
  assert.equal(api.callerNumber(caller), '+15551234567');
  assert.equal(api.callerNumber({ attributes: { 'sip.phoneNumber': 'anonymous' } }), undefined);
});

test('caller disconnect watching ignores other participants and removes its listeners', async () => {
  const api = engineLoader();
  const room = new EventEmitter(); room.remoteParticipants = new Map([['caller', {}]]);
  let calls = 0;
  const unwatch = api.watchCaller({ room }, 'caller', () => { calls++; });
  room.emit('left', { identity: 'observer' }); assert.equal(calls, 0);
  room.emit('left', { identity: 'caller' }); assert.equal(calls, 1);
  unwatch(); room.emit('disconnected'); assert.equal(calls, 1);
  assert.equal(room.listenerCount('left'), 0);
  await assert.rejects(api.waitForCaller({ room }, true, 1), /timeout/);
  assert.equal(room.listenerCount('joined'), 0);
});

test('failed event batches retain their identity and payload; shutdown sends the end once', async () => {
  const { SessionEvents } = loader({})('runtime/src/session-events.ts');
  const sent = [];
  let fail = true;
  const queue = new SessionEvents(async (id, events) => { sent.push({ id, events: structuredClone(events) }); if (fail) throw new Error('connection lost after commit'); });
  queue.append({ type: 'turn', role: 'user', content: 'Hello' });
  await assert.rejects(queue.flush());
  queue.append({ type: 'turn', role: 'assistant', content: 'Welcome' });
  fail = false;
  await Promise.all([queue.finish('caller_left', 0), queue.finish('caller_left', 0)]);
  assert.equal(sent[0].id, sent[1].id);
  assert.deepEqual(sent[0].events, sent[1].events);
  assert.deepEqual(sent[2].events.map((e) => e.type), ['turn', 'end']);
  queue.append({ type: 'turn', role: 'user', content: 'late' });
  await queue.flush(); assert.equal(sent.length, 3);
});

test('event delivery serializes overlapping flushes and limits batches to 200 events', async () => {
  const { SessionEvents } = loader({})('runtime/src/session-events.ts');
  const sent = [];
  let release;
  const queue = new SessionEvents(async (id, events) => { sent.push(events); if (sent.length === 1) await new Promise((r) => { release = r; }); });
  for (let i = 0; i < 201; i++) queue.append({ type: 'turn', role: 'user', content: String(i) });
  const first = queue.flush(), second = queue.flush();
  assert.equal(first, second);
  await new Promise((r) => setImmediate(r)); release();
  await first;
  assert.deepEqual(sent.map((e) => e.length), [200, 1]);
});

test('worker configuration fails early without secrets or with an insecure production origin', () => {
  const { validateWorkerEnvironment } = loader({})('runtime/src/configuration.ts');
  assert.throws(() => validateWorkerEnvironment({}), /Missing worker environment/);
  const env = { LIVEKIT_URL: 'wss://project.livekit.cloud', LIVEKIT_API_KEY: 'key', LIVEKIT_API_SECRET: 'secret', AVIROH_CONTROL_PLANE_URL: 'https://console.example', RUNTIME_SHARED_SECRET: 'x'.repeat(64) };
  assert.doesNotThrow(() => validateWorkerEnvironment(env));
  assert.throws(() => validateWorkerEnvironment({ ...env, AVIROH_CONTROL_PLANE_URL: 'http://console.example' }), /HTTPS origin/);
  assert.throws(() => validateWorkerEnvironment({ ...env, AVIROH_CONTROL_PLANE_URL: 'https://console.example/path' }), /without a path/);
});

function workerFixture(failStartup = false) {
  const calls = [], callbacks = [], sessions = [];
  let callerLeft, shutdowns = 0, shutdownReason;
  let done;
  const stopped = new Promise((resolve) => { done = resolve; });
  class AgentSession extends EventEmitter {
    constructor() { super(); sessions.push(this); }
    async start(input) { this.input = input; }
    async generateReply() { this.greeted = true; }
    async close() { this.emit('close', { error: null }); }
  }
  const ctx = {
    connect: async () => undefined, job: { metadata: JSON.stringify({ phone_number_id: crypto.randomUUID() }) }, proc: { userData: {} }, room: { name: 'test-room' },
    addShutdownCallback: (fn) => callbacks.push(fn), shutdown: (reason) => { shutdowns++; shutdownReason = reason; done(); },
  };
  const prompt = { persona: 'Test', instructions: 'Help callers', language: 'English', greeting: 'Hello', guardrails: '', handoff: '' };
  const api = loader({
    '@livekit/agents': { defineAgent: (definition) => definition, cli: { runApp: () => undefined }, WorkerOptions: class {}, voice: { Agent: class {}, AgentSession, AgentSessionEventTypes: { UserInputTranscribed: 'transcribed', ConversationItemAdded: 'item', Close: 'close' } }, llm: { tool: (opts) => opts } },
    './engines.js': { prewarmVoice: async () => ({}), waitForCaller: async () => ({ identity: 'caller' }), callerNumber: () => '+15551234567', watchCaller: (job, id, listener) => { callerLeft = listener; return () => undefined; }, buildSessionOptions: async () => { if (failStartup) throw new Error('private provider details'); return {}; } },
    './control-plane.js': { controlPlane: { openSession: async () => ({ session_id: crypto.randomUUID(), bundle: { prompt, runtime: { mode: 'composable' }, knowledge: { knowledge_base_ids: [] }, tools: [] }, credentials: {} }), events: async (id, batchId, events) => { calls.push({ id, batchId, events: structuredClone(events) }); }, cancel: async () => undefined } },
  })('runtime/src/agent.ts').default;
  return { api, ctx, calls, callbacks, sessions, leave: () => callerLeft(), stopped, shutdowns: () => shutdowns, reason: () => shutdownReason };
}

test('worker hangup flushes the final transcript, sends one end, and requests shutdown once', async () => {
  const f = workerFixture();
  await f.api.entry(f.ctx);
  const session = f.sessions[0];
  assert.equal(session.greeted, true);
  assert.equal(session.input.inputOptions.participantIdentity, 'caller');
  assert.equal(session.input.inputOptions.textEnabled, false);
  session.emit('item', { item: { role: 'user', textContent: 'Hello' } });
  session.emit('item', { item: { role: 'assistant', textContent: 'Welcome' } });
  f.leave();
  await f.stopped;
  await Promise.all(f.callbacks.map((fn) => fn()));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.shutdowns(), 1);
  assert.equal(f.reason(), 'caller_left');
  assert.deepEqual(f.calls.flatMap((c) => c.events).map((e) => e.type), ['turn', 'turn', 'end']);
});

test('worker startup errors finalize the saved call as a runtime error without leaking provider details', async () => {
  const f = workerFixture(true);
  await assert.rejects(f.api.entry(f.ctx), (error) => /startup failed/.test(error.message) && !error.message.includes('private provider'));
  assert.equal(f.shutdowns(), 1);
  assert.equal(f.calls.flatMap((c) => c.events).at(-1).reason, 'runtime_error');
});
