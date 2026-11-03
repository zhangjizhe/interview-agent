import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
const client=readFileSync(new URL('../src/client.mjs',import.meta.url),'utf8');
const fn=client.match(/async function admissionFor\(question\)\{[\s\S]*?\n\}/)?.[0];
assert.ok(fn,'actual browser admission implementation must be tested');
function admission(health,crypto){
 const values=new Map();
 const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
 return runInNewContext(fn+';admissionFor',{health,crypto,sessionStorage:storage,ADMISSION_KEY:'fixture-admission',TextEncoder,Uint8Array});
}
test('unconfigured actual client refuses before touching unavailable browser crypto',async()=>{
 await assert.rejects(admission({agentConfigured:false},{})('公开问题'),/尚未启用/);
});
test('insecure browser context has an actionable failure before POST or storage admission',async()=>{
 await assert.rejects(admission({agentConfigured:true},{})('公开问题'),/HTTPS 或 localhost/);
});
test('actual secure browser admission retains the same UUID and rejects a different pending question',async()=>{
 const make=admission({agentConfigured:true,agentMode:'agent-lab'},webcrypto);
 const first=await make('介绍你的项目'),second=await make('介绍你的项目');
 assert.equal(first.requestKey,second.requestKey);assert.equal(first.questionHash,second.questionHash);
 await assert.rejects(make('另一个问题'),/尚有未确认请求/);
});
