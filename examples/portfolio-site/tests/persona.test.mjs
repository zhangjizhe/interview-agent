import test from 'node:test';
import assert from 'node:assert/strict';
import {runLabAgent} from '../src/agent-lab.mjs';

test('an immediate AI-persona greeting completes with sources and no polling or extra POST',async()=>{
 const events=[];let calls=0;
 await runLabAgent({request:{message:'你好',requestKey:'615cb67f-15ae-4372-a848-13914964126b'},config:{base:'https://lab.example/api',origin:'https://site.example'},signal:new AbortController().signal,
  emit:(event,data)=>events.push({event,data}),fetcher:async url=>{
   calls++;assert.equal(url,'https://lab.example/api/portfolio-assistant/chat');
   return new Response(JSON.stringify({contractVersion:'portfolio-assistant/v1',status:'COMPLETED',answer:'你好，我是张继哲的 AI 分身。',evidenceMode:'grounded-first-person/v1',sources:[{id:'profile',title:'个人介绍',href:'#resume',quote:'公开个人介绍'}]}),{headers:{'Content-Type':'application/json'}});
  }});
 assert.equal(calls,1);assert.equal(events.find(e=>e.event==='delta').data.text,'你好，我是张继哲的 AI 分身。');
 assert.equal(events.at(-1).event,'done');assert.equal(events.at(-1).data.evidenceMode,'grounded-first-person/v1');
 assert.equal(events.find(e=>e.event==='sources').data.items[0].url,'#resume');
});
