import test from 'node:test';
import assert from 'node:assert/strict';
import {labConfig,runLabAgent} from '../src/agent-lab.mjs';
const config=labConfig({AGENT_LAB_BASE_URL:'https://lab.example/api'},'https://site.example');
const request={message:'Which document describes audit events?',requestKey:'550e8400-e29b-41d4-a716-446655440000'};
const refusal={contractVersion:'portfolio-assistant/v1',status:'REFUSED',answer:'Only public documents.',sources:[]};
test('configured Site adapter uses a Workers-supported no-follow mode',async()=>{
 const events=[];
 await runLabAgent({request,config,signal:new AbortController().signal,emit:(event,data)=>events.push({event,data}),fetcher:async(url,init)=>{
  if(init.redirect!=='manual')throw new TypeError('Workers supports follow/manual, not error');
  return new Response(JSON.stringify(refusal),{headers:{'Content-Type':'application/json'}});
 }});
 assert.equal(events.at(-1).event,'done');
});
test('redirect replies cannot cause a second request or release an answer',async()=>{
 for(const status of [301,302,307,308]){
  let calls=0;const events=[];
  await assert.rejects(runLabAgent({request,config,signal:new AbortController().signal,emit:(event,data)=>events.push({event,data}),fetcher:async()=>{
   calls++;return new Response(JSON.stringify(refusal),{status,headers:{'Content-Type':'application/json',Location:'https://other.example'}});
  }}));
  assert.equal(calls,1);assert.equal(events.some(x=>x.event==='delta'),false);
 }
});
test('dedicated gateway key is server configuration, not visitor authority',async()=>{
 const secret='synthetic-gateway-key-not-for-production-1234';
 const configured=labConfig({AGENT_LAB_BASE_URL:'https://lab.example/api',AGENT_LAB_GATEWAY_KEY:secret},'https://site.example');
 let headers;
 await runLabAgent({request,config:configured,signal:new AbortController().signal,emit:()=>{},fetcher:async(url,init)=>{
  headers=init.headers;return new Response(JSON.stringify(refusal),{headers:{'Content-Type':'application/json'}});
 }});
 assert.equal(headers['X-Portfolio-Gateway-Key'],secret);assert.equal(headers.Authorization,undefined);
});
test('invalid dedicated gateway key fails before a request',()=>{
 assert.throws(()=>labConfig({AGENT_LAB_BASE_URL:'https://lab.example/api',AGENT_LAB_GATEWAY_KEY:'bad'},'https://site.example'));
});
