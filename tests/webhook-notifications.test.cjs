const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loader, database } = require('./helpers.cjs');

function fixture() {
  const tables = {
    domain_events: [{ id: 'event-1', workspace_id: 'ws', type: 'tool.succeeded', payload: { invocation_id: 'invoke-1', tool_id: 'tool-1', tool_name: 'book_service', context: 'workflow' }, created_at: new Date().toISOString(), processed_at: null }],
    webhook_endpoints: [
      { id: 'endpoint-a', workspace_id: 'ws', url: 'https://one.example/hook', events: ['tool.succeeded'], enabled: true, secret_ciphertext: 'cipher-a' },
      { id: 'endpoint-b', workspace_id: 'ws', url: 'https://two.example/hook', events: ['tool.succeeded'], enabled: true, secret_ciphertext: 'cipher-b' },
    ],
    webhook_deliveries: [],
  };
  const db = database(tables);
  const requests = [];
  let statuses = [200, 503, 201];
  const load = loader({
    '@/integrations/supabase/client.server': { supabaseAdmin: db },
    './crypto.server': { decryptSecret: async (secret) => secret, hmacHex: async (secret, value) => `${secret}:${value.length}` },
    './tools/egress.server': { guardedFetch: async (url, init) => {
      requests.push({ url, init, body: JSON.parse(init.body) });
      return { status: statuses.shift() ?? 200 };
    } },
  });
  return { tables, requests, events: load('src/lib/events.server.ts'), setStatuses: (next) => { statuses = next; } };
}

test('successful tool events retry failed endpoints without resending endpoints already acknowledged', async () => {
  const f = fixture();
  const first = await f.events.deliverEvents({ ids: ['event-1'] });
  assert.deepEqual(first, { events: 1, delivered: 1, failed: 1 });
  assert.equal(f.tables.domain_events[0].processed_at, null);
  assert.equal(f.tables.webhook_deliveries[0].domain_event_id, 'event-1');
  assert.equal(f.tables.webhook_deliveries[0].status, 200);
  assert.equal(f.tables.webhook_deliveries[1].status, 503);
  assert.deepEqual(f.requests[0].body.data, { invocation_id: 'invoke-1', tool_id: 'tool-1', tool_name: 'book_service', context: 'workflow' });
  assert.equal(f.requests[0].init.headers.get('x-aviroh-signature')?.startsWith('cipher-a:'), true);

  f.setStatuses([202]);
  const retried = await f.events.deliverEvents({ ids: ['event-1'] });
  assert.deepEqual(retried, { events: 1, delivered: 1, failed: 0 });
  assert.equal(f.requests.length, 3);
  assert.equal(f.requests[2].url, 'https://two.example/hook');
  assert.ok(f.tables.domain_events[0].processed_at);
  assert.equal(f.tables.webhook_deliveries.length, 3);

  const afterComplete = await f.events.deliverEvents({ ids: ['event-1'] });
  assert.equal(afterComplete.events, 0);
  assert.equal(f.requests.length, 3);
});

test('an event with no subscribers is acknowledged without outbound requests', async () => {
  const f = fixture();
  f.tables.webhook_endpoints.forEach((endpoint) => { endpoint.events = ['workflow.published']; });
  const result = await f.events.deliverEvents({ ids: ['event-1'] });
  assert.deepEqual(result, { events: 1, delivered: 0, failed: 0 });
  assert.ok(f.tables.domain_events[0].processed_at);
  assert.equal(f.requests.length, 0);
});

test('concurrent outbox workers claim an event only once', async () => {
  const f = fixture();
  f.setStatuses([200, 201]);
  await Promise.all([f.events.deliverEvents({ ids: ['event-1'] }), f.events.deliverEvents({ ids: ['event-1'] })]);
  assert.equal(f.requests.length, 2);
  assert.equal(f.tables.webhook_deliveries.length, 2);
  assert.ok(f.tables.domain_events[0].processed_at);
});
