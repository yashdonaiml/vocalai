const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loader, database } = require('./helpers.cjs');

test('Telugu-English style reaches text and voice instructions without changing ordinary agents', () => {
 const {effectiveInstructions,normalizeConfig}=loader({})('src/lib/agent-config.ts');
 const ordinary=normalizeConfig({instructions:'Approved facts only.'});
 assert.equal(effectiveInstructions(ordinary),'Approved facts only.');
 const mixed=effectiveInstructions({...ordinary,speechStyle:'te-en'});
 assert.match(mixed,/Telugu script/);assert.match(mixed,/do not switch TTS language/i);assert.match(mixed,/fully in English/);
 assert.match(mixed,/successful tool receipt/);
});

test('provider-backed JSON resolves the workspace organization, prioritizes BYOK and supports each vendor', async () => {
 const previous = {...process.env}, oldFetch = global.fetch;
 const workspace = crypto.randomUUID(), org = crypto.randomUUID();
 const tables = {workspaces:[{id:workspace,org_id:org}],provider_accounts:[{org_id:org,provider:'openai',key_ciphertext:'encrypted'},{org_id:crypto.randomUUID(),provider:'anthropic',key_ciphertext:'foreign'}]};
 const db=database(tables); const requests=[];
 global.fetch=async(url,init)=>{
  requests.push({url,headers:init.headers,body:JSON.parse(init.body),signal:init.signal});
  const text=JSON.stringify({result:'ok'});
  const body=url.includes('openai.com')?{choices:[{message:{content:text}}]}:url.includes('anthropic.com')?{content:[{type:'text',text}]}:{candidates:[{content:{parts:[{text}]}}]};
  return Response.json(body);
 };
 try {
  process.env.OPENAI_API_KEY='platform-openai';process.env.ANTHROPIC_API_KEY='platform-anthropic';process.env.GOOGLE_API_KEY='platform-google';delete process.env.CONTROL_PLANE_AI_MODEL;
  const registry=loader({'@/integrations/supabase/client.server':{supabaseAdmin:db},'../crypto.server':{decryptSecret:async()=> 'workspace-openai'}})('src/lib/providers/registry.server.ts');
  for(const provider of ['openai','anthropic','google']) {
   process.env.CONTROL_PLANE_AI_PROVIDER=provider;
   assert.deepEqual(await registry.generateWorkspaceJson(workspace,'Return a result',{text:'untrusted instruction'}),{result:'ok'});
  }
  assert.equal(requests[0].headers.authorization,'Bearer workspace-openai');
  assert.equal(requests[1].headers['x-api-key'],'platform-anthropic');
  assert.equal(requests[2].headers['x-goog-api-key'],'platform-google');
  assert.ok(requests.every(r=>r.signal instanceof AbortSignal && !r.body.tools));
  await assert.rejects(registry.generateWorkspaceJson(crypto.randomUUID(),'Test',{}),/Workspace not found/);
  assert.equal(requests.length,3);
  global.fetch=async()=>Response.json({candidates:[{content:{parts:[{text:'[]'}]}}]});
  await assert.rejects(registry.generateWorkspaceJson(workspace,'Test',{}),/not valid JSON/);
 } finally {global.fetch=oldFetch;for(const k of Object.keys(process.env))if(!(k in previous))delete process.env[k];Object.assign(process.env,previous);}
});

test('judgments reject unknown labels, missing confidence and out-of-range evidence scores',async()=>{
 let reply;
 const api=loader({'./providers/registry.server':{generateWorkspaceJson:async()=>reply}})('src/lib/judgments.server.ts');
 const workspace=crypto.randomUUID();
 reply={answers:{pick:{choice:'invented',confidence:1}}};
 await assert.rejects(api.chooseLabel(workspace,'Which label?',{qualified:'Interested'},{}),/unknown choice/);
 reply={answers:{pick:{choice:'qualified'}}};
 await assert.rejects(api.chooseLabel(workspace,'Which label?',{qualified:'Interested'},{}));
 reply={answers:{check:{noul:2}}};await assert.rejects(api.judgeCondition(workspace,'Interested?',{}));
 reply={answers:{pick:{choice:'qualified',confidence:0.2}}};assert.equal(await api.chooseLabel(workspace,'Which label?',{qualified:'Interested'},{}),null);
 reply={answers:{pick:{choice:'qualified',confidence:0.9}}};assert.deepEqual(await api.chooseLabel(workspace,'Which label?',{qualified:'Interested'},{}),{choice:'qualified',confidence:0.9});
});

test('agent drafting authorizes the workspace before reaching the AI provider',async()=>{
 let calls=0;
 const api=loader({'@tanstack/react-start':{createServerFn:()=>{let validate=v=>v;const c={middleware:()=>c,validator:fn=>{validate=fn;return c;},handler:fn=>args=>fn({...args,data:validate(args.data)})};return c;}},'@/integrations/supabase/auth-middleware':{requireSupabaseAuth:{}},'./providers/registry.server':{generateWorkspaceJson:async()=>{calls++;return{name:'Receptionist',steps:[]};}}})('src/lib/agent-draft.functions.ts');
 const data={workspaceId:crypto.randomUUID(),description:'Handle appointment calls'};
 await assert.rejects(api.draftAgent({data,context:{supabase:{rpc:async()=>({data:false})}}}),/Workspace access/);
 assert.equal(calls,0);
 assert.equal((await api.draftAgent({data,context:{supabase:{rpc:async()=>({data:true})}}})).name,'Receptionist');assert.equal(calls,1);
});

test('auth redirects reject external origins, encoded slashes and backslash targets',()=>{
 const {safeAuthRedirect}=loader({})('src/lib/auth-redirect.ts');
 for(const path of ['https://example.com','//example.com','/\\example.com','/%2fexample.com','/%5cexample.com','/%0aexample.com','/%broken'])assert.equal(safeAuthRedirect(path),'/agents');
 assert.equal(safeAuthRedirect('/telephony?tab=numbers'),'/telephony?tab=numbers');
});

test('general scheduler auth uses platform-owned secrets and supports rotation',async()=>{
 const old=process.env.CRON_SECRET,oldPrevious=process.env.CRON_SECRET_PREVIOUS;
 const {authenticateCronRequest}=loader({})('src/integrations/supabase/cron-auth.ts');
 try {
  process.env.CRON_SECRET='current-test-secret';process.env.CRON_SECRET_PREVIOUS='previous-test-secret';
  assert.equal(await authenticateCronRequest(new Request('https://vocollai.invalid',{headers:{authorization:'Bearer current-test-secret'}})),null);
  assert.equal(await authenticateCronRequest(new Request('https://vocollai.invalid',{headers:{authorization:'Bearer previous-test-secret'}})),null);
  assert.equal((await authenticateCronRequest(new Request('https://vocollai.invalid',{headers:{authorization:'Bearer wrong'}}))).status,401);
 } finally {if(old===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=old;if(oldPrevious===undefined)delete process.env.CRON_SECRET_PREVIOUS;else process.env.CRON_SECRET_PREVIOUS=oldPrevious;}
});

test('agent publish readiness blocks publishing without the configured provider key', async () => {
 const workspace = crypto.randomUUID(), org = crypto.randomUUID(), agentId = crypto.randomUUID();
 const db = database({
     workspaces: [{ id: workspace, org_id: org }],
     agents: [{ id: agentId, workspace_id: workspace, config: {
         runtime: {
             mode: 'composable',
             llm: { provider: 'openai', model: 'gpt-4.1-mini' },
             stt: { provider: 'deepgram', model: 'nova-3' },
             tts: { provider: 'cartesia', model: 'sonic-3.6', voice: 'voice-1' },
         },
     } }],
 });
 const mod = loader({
     '@/integrations/supabase/client.server': { supabaseAdmin: db },
     '../providers/registry.server': { resolveCredential: async (requestedOrg, provider) => {
         if (requestedOrg !== org || provider !== 'openai') throw new Error(`No ${provider} key: add one under Models & Keys`);
         return { provider, apiKey: 'ok', source: 'platform' };
     } },
 })('src/lib/tools/readiness.server.ts');
 const readiness = await mod.agentPublishReadiness(workspace, agentId);
 assert.match(readiness[0], /deepgram key under Providers before publishing this agent\./);
});
