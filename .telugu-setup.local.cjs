const fs=require('node:fs');
const {loader}=require('./tests/helpers.cjs');
const load=loader({});
(async()=>{
 if(process.env.MANAGED_TELEPHONY_ENABLED!=='false')throw Error('Purchases must remain disabled');
 const db=load('src/integrations/supabase/client.server.ts').supabaseAdmin;
 const agentId='d533231b-4db0-4656-8f08-de4319f3bd68';
 const {data:users,error:authError}=await db.auth.admin.listUsers();if(authError)throw authError;
 const userId=users.users.find(x=>x.email==='admin@vocollai.com')?.id;if(!userId)throw Error('Owned test admin not found');
 const configured=await load('src/lib/receptionist.server.ts').configureReceptionist(agentId,userId,'te-en');
 const {data:agent,error}=await db.from('agents').select('workspace_id,config').eq('id',agentId).single();if(error)throw Error(error.message);
 const {data:ws}=await db.from('workspaces').select('org_id').eq('id',agent.workspace_id).single();
 const credentials=await load('src/lib/runtime/bundle.server.ts').bundleCredentials(ws.org_id,agent.config.runtime);
 // Synthetic QA audio only. Keys use the same registry resolution as the runtime.
 const clips=[['mixed','నమస్కారం అండి. VocollAI platform గురించి చెప్పండి. నాకు ఒక demo కావాలి.'],['english','Please speak only in English. What can VocollAI do?']];
 const probes=[];
 for(const [name,text] of clips){
  const res=await fetch('https://api.cartesia.ai/tts/bytes',{method:'POST',headers:{'X-API-Key':credentials.cartesia,'Cartesia-Version':'2025-04-16','Content-Type':'application/json'},body:JSON.stringify({model_id:'sonic-3.6',transcript:text,voice:{mode:'id',id:agent.config.runtime.tts.voice},language:name==='mixed'?'te':'en',output_format:{container:'wav',encoding:'pcm_s16le',sample_rate:24000}}),signal:AbortSignal.timeout(40000)});
  if(!res.ok)throw Error(`Cartesia clip failed: ${res.status} ${await res.text()}`);
  const bytes=Buffer.from(await res.arrayBuffer());fs.writeFileSync(`.telugu-${name}.local.wav`,bytes);
  const stt=await fetch('https://api.deepgram.com/v1/listen?model=nova-3&language=multi&smart_format=true',{method:'POST',headers:{Authorization:`Token ${credentials.deepgram}`,'Content-Type':'audio/wav'},body:bytes,signal:AbortSignal.timeout(40000)});
  const result=await stt.json();if(!stt.ok)throw Error(`Deepgram probe failed: ${stt.status}`);
  const alt=result.results?.channels?.[0]?.alternatives?.[0];probes.push({name,transcript:alt?.transcript,languages:alt?.languages,confidence:alt?.confidence,bytes:bytes.length});
 }
 fs.writeFileSync('.telugu-probe-results.local.json',JSON.stringify(probes,null,2));
 const functions=loader({'@tanstack/react-start':{createServerFn:()=>{let validate=v=>v;const c={middleware:()=>c,inputValidator:fn=>{validate=fn;return c;},handler:fn=>args=>fn({...args,data:validate(args.data)})};return c;}},'@/integrations/supabase/auth-middleware':{requireSupabaseAuth:{}}})('src/lib/platform.functions.ts');
 const join=await functions.startTestSession({data:{agentId},context:{supabase:db,userId}});
 fs.writeFileSync('.telugu-join.local.json',JSON.stringify(join));
 console.log(JSON.stringify({configured,sessionId:join.sessionId,probes,purchasesDisabled:true}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
