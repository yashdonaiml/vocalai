import fs from 'node:fs';
import {createRequire} from 'node:module';
import {Room,RoomEvent,AudioSource,LocalAudioTrack,AudioFrame,AudioStream,TrackPublishOptions,TrackSource} from '@livekit/rtc-node';
const require=createRequire(import.meta.url);
process.chdir('..');
const {loader}=require('../tests/helpers.cjs');const load=loader({});
const db=load('src/integrations/supabase/client.server.ts').supabaseAdmin;
const join=JSON.parse(fs.readFileSync('.telugu-join.local.json','utf8'));
const room=new Room();const chunks=[];let lastSound=0;let frames=0;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
room.on(RoomEvent.TrackSubscribed,(track)=>{if(track.kind!==1)return;void(async()=>{for await(const f of new AudioStream(track,24000,1)){const data=Buffer.from(f.data.buffer,f.data.byteOffset,f.data.byteLength);chunks.push(Buffer.from(data));frames++;if(f.data.some(v=>Math.abs(v)>150))lastSound=Date.now();}})().catch(()=>{});});
async function turns(){const{data,error}=await db.from('conversation_turns').select('seq,role,content').eq('conversation_id',join.sessionId).order('seq');if(error)throw Error(error.message);return data??[];}
async function waitReply(count){const end=Date.now()+55000;while(Date.now()<end){const t=await turns();if(t.filter(x=>x.role==='assistant').length>count&&frames>0&&Date.now()-lastSound>1800){console.log(JSON.stringify({turns:t,audioFrames:frames}));return t;}await sleep(900);}throw Error('Timed out waiting for spoken reply');}
function pcm(path){const b=fs.readFileSync(path);let pos=12;while(pos+8<=b.length){const n=b.readUInt32LE(pos+4);if(b.toString('ascii',pos,pos+4)==='data'){const data=b.subarray(pos+8,pos+8+n);return new Int16Array(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength));}pos+=8+n+(n%2);}throw Error('No WAV data');}
function saveAudio(){if(!chunks.length)return;const data=Buffer.concat(chunks),header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(data.length+36,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(24000,24);header.writeUInt32LE(48000,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(data.length,40);fs.writeFileSync('.telugu-agent-output.local.wav',Buffer.concat([header,data]));}
try{
 await room.connect(join.serverUrl,join.token);const source=new AudioSource(24000,1);const track=LocalAudioTrack.createAudioTrack('synthetic-qa-caller',source);const opts=new TrackPublishOptions();opts.source=TrackSource.SOURCE_MICROPHONE;await room.localParticipant.publishTrack(track,opts);
 let t=await waitReply(0);
 for(const name of ['mixed','english']){const count=t.filter(x=>x.role==='assistant').length;const data=pcm(`.telugu-${name}.local.wav`);const start=Date.now();for(let offset=0;offset<data.length;offset+=480){const frame=new Int16Array(480);frame.set(data.subarray(offset,offset+480));await source.captureFrame(new AudioFrame(frame,24000,1,480));const delay=start+(offset/24000)*1000-Date.now();if(delay>0)await sleep(delay);}await source.waitForPlayout();t=await waitReply(count);}
 if(!t.some(x=>x.role==='user'&&/[\u0c00-\u0c7f]/.test(x.content)))throw Error('No Telugu speech recognized');
 if(!t.some(x=>x.role==='assistant'&&/[\u0c00-\u0c7f]/.test(x.content)&&/[a-z]{3}/i.test(x.content)))throw Error('No mixed Telugu-English response');
 const final=t.filter(x=>x.role==='assistant').at(-1);if(/[\u0c00-\u0c7f]/.test(final.content))throw Error('English-only request was not honored');
 fs.writeFileSync('.telugu-call-results.local.json',JSON.stringify({sessionId:join.sessionId,audioFrames:frames,turns:t,passed:true},null,2));console.log('LIVE AUDIO SMOKE PASSED');
}catch(e){console.error(e.message);process.exitCode=1;}finally{saveAudio();await room.disconnect();await sleep(2000);process.exit(process.exitCode??0);}
