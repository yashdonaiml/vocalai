const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { loader, database } = require('./helpers.cjs');

const options = (extra = {}) => ({ method: 'GET', headers: new Headers(), timeoutMs: 1000, maxBytes: 64, ...extra });
function transportFixture({ records = [{ address: '93.184.216.34', family: 4 }], reply = {}, dns } = {}) {
  const calls = [], resolutions = [];
  const load = loader({
    'node:dns/promises': { lookup: async (host, opts) => { resolutions.push({host, opts}); return dns ? dns(host, opts) : records; } },
    'node:https': { request: (url, opts, callback) => {
      const req = new EventEmitter();
      const call = { url, opts, body: null }; calls.push(call);
      const abort = () => req.emit('error', opts.signal.reason);
      opts.signal.addEventListener('abort', abort, {once:true});
      req.end = (body) => {
        call.body = body;
        opts.lookup(url.hostname, {}, (error, address, family) => {
          call.address = address; call.family = family;
          if (error) { req.emit('error', error); return; }
          if (reply.hang) return;
          const res = new PassThrough();
          res.statusCode = reply.status ?? 200;
          res.headers = reply.headers ?? {};
          res.rawHeaders = Object.entries(res.headers).flat();
          res.on('close', () => opts.signal.removeEventListener('abort',abort));
          queueMicrotask(() => {
            callback(res);
            for (const chunk of reply.chunks ?? ['ok']) { if (!res.destroyed) res.write(Buffer.from(chunk)); }
            if (!res.destroyed) res.end();
          });
        });
      };
      return req;
    } },
  });
  return { api: load('src/lib/tools/egress.server.ts'), calls, resolutions };
}

test('egress rejects private, mapped, transition, reserved and mixed DNS answers before connecting', async () => {
  const blocked = [
    ['127.0.0.1',4], ['10.0.0.2',4], ['169.254.169.254',4], ['172.16.1.1',4], ['192.168.1.1',4],
    ['100.64.0.1',4], ['0.1.2.3',4], ['224.1.2.3',4], ['198.18.0.1',4], ['198.51.100.1',4],
    ['192.0.2.1',4], ['203.0.113.1',4], ['192.88.99.1',4], ['255.255.255.255',4],
    ['::1',6], ['::ffff:127.0.0.1',6], ['::ffff:7f00:1',6], ['::ffff:a00:1',6],
    ['64:ff9b::a00:1',6], ['fc00::1',6], ['fe80::1',6], ['2001:db8::1',6], ['2002:7f00:1::',6], ['3fff::1',6],
  ];
  for (const [address,family] of blocked) {
    const f = transportFixture({records:[{address:'93.184.216.34',family:4},{address,family}]});
    await assert.rejects(f.api.guardedFetch('https://customer.example/',options()), e => e.code === 'EGRESS_DENIED' && e.sent === false, address);
    assert.equal(f.calls.length,0,address);
  }
});

test('egress rejects IP URL encodings, private hostname suffixes, ports and embedded credentials', async () => {
  for (const url of ['https://127.1','https://0x7f000001','https://2130706433','https://[::ffff:7f00:1]/','https://localhost./','https://a.localhost./','https://internal/','http://public.example','https://public.example:444/','https://u:p@public.example/']) {
    const f=transportFixture();
    await assert.rejects(f.api.guardedFetch(url,options()),e=>e.code==='EGRESS_DENIED',url);
    assert.equal(f.resolutions.length,0); assert.equal(f.calls.length,0);
  }
});

test('HTTPS connects only to validated DNS address while preserving certificate hostname and stripping forged routing headers', async () => {
  let dnsCalls=0;
  const f=transportFixture({dns:async()=>++dnsCalls===1?[{address:'93.184.216.34',family:4}]:[{address:'127.0.0.1',family:4}]});
  const result=await f.api.guardedFetch('https://customer.example./path?q=1#fragment',options({headers:new Headers({host:'localhost',connection:'keep-alive','proxy-authorization':'secret',authorization:'Bearer business-key'})}));
  assert.equal(result.text,'ok');assert.equal(dnsCalls,1);
  const c=f.calls[0]; assert.equal(c.address,'93.184.216.34'); assert.equal(c.opts.servername,'customer.example');
  assert.equal(c.opts.family,4);assert.equal(c.opts.agent,false);assert.equal(c.opts.maxHeaderSize,16384);
  assert.equal(c.opts.headers.host,'customer.example');assert.equal(c.opts.headers['proxy-authorization'],undefined);
  assert.equal(c.opts.headers.authorization,'Bearer business-key');assert.equal(c.url.hash,'');
  assert.equal(c.opts.headers['accept-encoding'],'identity');
});

test('public IPv6 is pinned and supported without a second resolver', async()=>{
  const f=transportFixture({records:[{address:'2606:4700:4700::1111',family:6}]});
  assert.equal((await f.api.guardedFetch('https://business.example',options())).status,200);
  assert.equal(f.calls[0].address,'2606:4700:4700::1111');assert.equal(f.calls[0].opts.family,6);
});

test('redirects, compressed payloads and oversized replies are rejected without following or buffering them',async()=>{
  for(const reply of [{status:302,headers:{location:'http://169.254.169.254/'}},{headers:{'content-length':'1024'}},{chunks:['a'.repeat(40),'b'.repeat(40)]},{headers:{'content-encoding':'gzip'}}]){
    const f=transportFixture({reply});
    await assert.rejects(f.api.guardedFetch('https://business.example',options()),e=>e.code==='RESPONSE_INVALID'&&e.sent===true);
    assert.equal(f.calls.length,1);
  }
});

test('the request deadline includes DNS and cancellation stops before a connection',async()=>{
  const f=transportFixture({dns:()=>new Promise(()=>{})});
  await assert.rejects(f.api.guardedFetch('https://business.example',options({timeoutMs:10})),e=>e.code==='TIMEOUT'&&e.sent===false);
  assert.equal(f.calls.length,0);
  const stopped=transportFixture();const ctrl=new AbortController();ctrl.abort(new Error('user cancelled'));
  await assert.rejects(stopped.api.guardedFetch('https://business.example',options({signal:ctrl.signal})),/user cancelled/);
  assert.equal(stopped.calls.length,0);
  const hung=transportFixture({reply:{hang:true}});
  await assert.rejects(hung.api.guardedFetch('https://business.example',options({timeoutMs:10})),e=>e.code==='TIMEOUT'&&e.sent===true);
});

const serverFn = {createServerFn:()=>{let validate=v=>v;const c={middleware:()=>c,validator:fn=>{validate=fn;return c;},handler:fn=>args=>fn({...args,data:validate(args.data)})};return c;}};
test('retired tool create/edit/test routes fail closed without reaching a database or network',async()=>{
  const mocks={'@tanstack/react-start':serverFn,'@/integrations/supabase/auth-middleware':{requireSupabaseAuth:{}}};
  const load=loader(mocks);const old=load('src/lib/console.functions.ts');const platform=load('src/lib/platform.functions.ts');
  await assert.rejects(old.testTool({data:{id:crypto.randomUUID()},context:{}}),/Legacy tool tests are disabled/);
  await assert.rejects(old.updateTool({data:{id:crypto.randomUUID()},context:{}}),/Legacy tool editing is disabled/);
  await assert.rejects(platform.createTool({data:{workspaceId:crypto.randomUUID(),name:'legacy',description:'',parameters:'{}',endpointUrl:'https://example.com',method:'POST',timeoutMs:1000},context:{}}),/Legacy tools are disabled/);
});

test('knowledge URL ingestion uses bounded guarded transport and preserves failed status on denied egress',async()=>{
  const id=crypto.randomUUID(); const tables={knowledge_sources:[{id,workspace_id:'ws',knowledge_base_id:'kb',kind:'url',source_url:'https://private.example'}]};
  const db=database(tables);const calls=[];
  const api=loader({'@tanstack/react-start':serverFn,'@/integrations/supabase/auth-middleware':{requireSupabaseAuth:{}},'@/integrations/supabase/client.server':{supabaseAdmin:db},'./knowledge.server':{},'./tools/egress.server':{guardedFetch:async(url,opts)=>{calls.push({url,opts});throw new Error('destination denied');}}})('src/lib/platform.functions.ts');
  await assert.rejects(api.ingestSource({data:{sourceId:id},context:{supabase:db}}),/destination denied/);
  assert.equal(calls.length,1);assert.equal(calls[0].opts.maxBytes,2000000);assert.equal(calls[0].opts.timeoutMs,15000);
  assert.equal(tables.knowledge_sources[0].status,'failed');
});

test('event delivery and webhook tests never bypass guarded egress',async()=>{
  const endpointId=crypto.randomUUID();const tables={domain_events:[{id:'ev',workspace_id:'ws',type:'tool.changed',payload:{tool_id:'t'},created_at:new Date().toISOString()}],webhook_endpoints:[{id:endpointId,workspace_id:'ws',url:'https://receiver.example',enabled:true,secret_ciphertext:'encrypted',events:['tool.changed']}]};
  const db=database(tables);const calls=[];const guardedFetch=async(url,opts)=>{calls.push({url,opts});throw new Error('private destination denied');};
  const load=loader({'@tanstack/react-start':serverFn,'@/integrations/supabase/auth-middleware':{requireSupabaseAuth:{}},'@/integrations/supabase/client.server':{supabaseAdmin:db},'./crypto.server':{decryptSecret:async()=> 'key',hmacHex:async()=> 'signature'},'./tools/egress.server':{guardedFetch}});
  await load('src/lib/events.server.ts').deliverEvents();
  assert.equal(calls.length,1);assert.equal(calls[0].opts.maxBytes,65536);assert.equal(calls[0].opts.timeoutMs,8000);
  assert.match(tables.webhook_deliveries[0].error,/destination denied/);
  const context={supabase:{...db,rpc:async()=>({data:true})},userId:'user'};
  const tested=await load('src/lib/console.functions.ts').testWebhook({data:{id:endpointId},context});
  assert.equal(tested.status,null);assert.match(tested.error,/destination denied/);
  assert.equal(calls.length,2);assert.equal(calls[1].opts.maxBytes,262144);
});

test('workflow summary delivery records an egress denial without performing an unsafe fetch',async()=>{
  const graph={version:1,nodes:[{id:'start',type:'trigger'},{id:'step',type:'action',kind:'send_summary',value:'https://receiver.example'},{id:'end',type:'end'}],edges:[{id:'e',source:'start',target:'step'},{id:'finish',source:'step',target:'end'}]};
  const tables={workflows:[{id:'wf',workspace_id:'ws',name:'Notify',trigger:'call.ended',published_version_id:'ver'}],workflow_versions:[{id:'ver',workflow_id:'wf',workspace_id:'ws',graph}],workspaces:[{id:'ws',org_id:'org'}]};
  const db=database(tables),calls=[];
  const api=loader({'@/integrations/supabase/client.server':{supabaseAdmin:db},'./tools/egress.server':{guardedFetch:async(url,opts)=>{calls.push({url,opts});throw new Error('private destination denied');}}})('src/lib/workflows.server.ts');
  const result=await api.executeWorkflow('wf',null,'live',null);
  assert.equal(result.status,'failed');assert.ok(calls.length>0);assert.equal(calls[0].opts.maxBytes,65536);
  assert.equal(tables.workflow_runs[0].status,'failed');
});

test('HEAD reachability checks do not reject the resource size as a response body',async()=>{
  const f=transportFixture({reply:{headers:{'content-length':'10000000'},chunks:[]}});
  assert.equal((await f.api.guardedFetch('https://business.example',options({method:'HEAD'}))).status,200);
});
