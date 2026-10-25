const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loader, database } = require('./helpers.cjs');

function fixture() {
  const tables = {
    conversations: [{ id: 'call', workspace_id: 'ws', agent_id: 'agent', status: 'active', runtime_bundle_id: 'bundle', workspaces: { org_id: 'org' } }],
    runtime_bundles: [{ id: 'bundle', workspace_id: 'ws', agent_id: 'agent', bundle: { knowledge: { knowledge_base_ids: ['published-kb'] } } }],
    agent_knowledge_bases: [{ workspace_id: 'ws', agent_id: 'agent', knowledge_base_id: 'new-draft-kb' }],
    knowledge_bases: [{ id: 'published-kb', workspace_id: 'ws' }],
  };
  const searches = [];
  const load = loader({
    '@/integrations/supabase/client.server': { supabaseAdmin: database(tables) },
    '../knowledge.server': { searchKnowledge: async (ids, query) => { searches.push({ ids, query }); return [{ content: 'Published fact', similarity: 0.9 }]; } },
  });
  return { tables, searches, api: load('src/lib/runtime/session.server.ts') };
}

test('live knowledge search uses pinned bundle references after draft associations change', async () => {
  const f = fixture();
  assert.deepEqual(await f.api.retrieve({ session_id: 'call', query: 'hours?' }), { results: [{ content: 'Published fact', score: 0.9 }] });
  assert.deepEqual(f.searches, [{ ids: ['published-kb'], query: 'hours?' }]);
});

test('ended sessions, foreign bundle rows and foreign knowledge references cannot retrieve', async () => {
  for (const tamper of [
    f => { f.tables.conversations[0].status = 'completed'; },
    f => { f.tables.runtime_bundles[0].workspace_id = 'other'; },
    f => { f.tables.knowledge_bases[0].workspace_id = 'other'; },
    f => { delete f.tables.runtime_bundles[0].bundle.knowledge; },
  ]) {
    const f = fixture(); tamper(f);
    await assert.rejects(f.api.retrieve({ session_id: 'call', query: 'private facts' }), /Session/);
    assert.equal(f.searches.length, 0);
  }
});

test('bundle compilation rejects cross-workspace agents and knowledge before saving a bundle', async () => {
  for (const foreignAgent of [true, false]) {
    const tables = {
      agents: [{ id: 'agent', workspace_id: foreignAgent ? 'other' : 'ws', config: { knowledge_base_ids: ['kb'] } }],
      knowledge_bases: [{ id: 'kb', workspace_id: 'other' }],
      runtime_bundles: [],
    };
    const load = loader({
      '@/integrations/supabase/client.server': { supabaseAdmin: database(tables) },
      '../tools/bindings.server': { agentBindings: async () => [] },
    });
    await assert.rejects(load('src/lib/runtime/bundle.server.ts').compileBundle({ workspaceId: 'ws', agentId: 'agent', agentVersion: null, environmentId: null, userId: 'user' }), /configuration not found|Knowledge base/);
    assert.equal(tables.runtime_bundles.length, 0);
  }
});
