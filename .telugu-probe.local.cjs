const {loader}=require('./tests/helpers.cjs');
const load=loader({});
(async()=>{
 const db=load('src/integrations/supabase/client.server.ts').supabaseAdmin;
 const {data:agent,error}=await db.from('agents').select('id,name,workspace_id,config').eq('id','d533231b-4db0-4656-8f08-de4319f3bd68').single();if(error)throw Error(error.message);
 const {data:ws}=await db.from('workspaces').select('org_id').eq('id',agent.workspace_id).single();
 const registry=load('src/lib/providers/registry.server.ts');
 const cred=await registry.resolveCredential(ws.org_id,'cartesia');
 const res=await fetch('https://api.cartesia.ai/voices?limit=100&language=te',{headers:{'X-API-Key':cred.apiKey,'Cartesia-Version':'2026-03-01'}});
 const data=await res.json();require('node:fs').writeFileSync('.telugu-voices.local.json',JSON.stringify(data));
 console.log(JSON.stringify({status:res.status,agent:agent.name,mode:agent.config.runtime.mode,voices:Array.isArray(data)?data:data.data??data}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
