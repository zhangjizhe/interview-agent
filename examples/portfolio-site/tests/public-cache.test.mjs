import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {handleRequest} from '../src/app.mjs';
import articles from '../src/articles.json' with {type:'json'};

const marker='hidden-source-map';
const promise=articles.find(a=>a.title==='promise实现');
const env={ASSISTANT_MODE:'direct',MODEL_BASE_URL:'https://model.example/v1',MODEL_NAME:'fixture',MODEL_API_KEY:'test-secret'};
function inlineArticles(html){
 const markerText='const ARTICLES=';
 const start=html.indexOf(markerText);
 assert.ok(start>=0);
 const end=html.indexOf(';\n',start);
 return JSON.parse(html.slice(start+markerText.length,end));
}
function cacheable(headers){
 assert.match(headers.get('cache-control'),/^public, max-age=300$/);
 assert.equal(headers.get('cloudflare-cdn-cache-control'),'public, max-age=86400, stale-while-revalidate=604800');
 assert.equal(headers.get('cdn-cache-control'),null);
 assert.doesNotMatch(headers.get('cache-control'),/no-store|private|no-cache/);
}
function uncached(headers){
 assert.equal(headers.get('cache-control'),'no-store');
 assert.equal(headers.get('cdn-cache-control'),'no-store');
 assert.equal(headers.get('cloudflare-cdn-cache-control'),null);
}

test('public homepage inlines the catalog only and is cacheable',async()=>{
 const response=await handleRequest(new Request('https://site.example/'));
 assert.equal(response.status,200);
 cacheable(response.headers);
 assert.match(response.headers.get('content-security-policy'),/script-src 'self' 'unsafe-inline'/);
 const html=await response.text();
 assert.ok(html.length<180000,`homepage is ${html.length} bytes`);
 assert.ok(gzipSync(html).length<70000);
 assert.equal(html.includes(marker),false);
 assert.equal(html.includes('const ARTICLE_BODIES='),false);
 assert.match(html,/\/articles\/'\+encodeURIComponent\(id\)\+'\.js'/);
 const list=inlineArticles(html);
 assert.equal(list.length,articles.length);
 assert.deepEqual(Object.keys(list[0]).sort(),['category','date','excerpt','id','minutes','title']);
 assert.equal(list.some(item=>item.html||item.text||item.sourcePath||item.experience),false);
 assert.equal(list.some(item=>item.title==='promise实现'),true);
 const head=await handleRequest(new Request('https://site.example/',{method:'HEAD'}));
 assert.equal(head.status,200);cacheable(head.headers);assert.equal(await head.text(),'');
 const cached=await handleRequest(new Request('https://site.example/index.html',{headers:{'If-None-Match':response.headers.get('etag')}}));
 assert.equal(cached.status,304);cacheable(cached.headers);assert.equal(await cached.text(),'');
});

test('opening an article loads that article body from a cacheable document',async()=>{
 const response=await handleRequest(new Request('https://site.example/articles/'+promise.id+'.js'));
 assert.equal(response.status,200);
 cacheable(response.headers);
 assert.equal(response.headers.get('content-type'),'application/json; charset=utf-8');
 assert.equal(response.headers.get('x-content-type-options'),'nosniff');
 const raw=await response.text();
 assert.ok(raw.length<80000);
 assert.equal(raw.includes('<'),false);
 const doc=JSON.parse(raw);
 assert.equal(doc.id,promise.id);
 assert.match(doc.html,/<pre><code>/);
 assert.equal(doc.html,promise.html);
 assert.deepEqual(Object.keys(doc).sort(),['category','date','excerpt','html','id','minutes','title']);
 const head=await handleRequest(new Request('https://site.example/articles/'+promise.id+'.js',{method:'HEAD'}));
 assert.equal(head.status,200);assert.equal(await head.text(),'');cacheable(head.headers);
 const again=await handleRequest(new Request('https://site.example/articles/'+promise.id+'.js',{headers:{'If-None-Match':'W/'+response.headers.get('etag')}}));
 assert.equal(again.status,304);
});

test('dynamic routes stay uncached and unknown articles are not the homepage',async()=>{
 const health=await handleRequest(new Request('https://site.example/api/health'));
 uncached(health.headers);assert.equal((await health.json()).articles,articles.length);
 const search=await handleRequest(new Request('https://site.example/api/search?q=Promise'));
 uncached(search.headers);assert.equal((await search.json()).items[0].title,'promise实现');
 const encoder=new TextEncoder(),frame=c=>'data: '+JSON.stringify(c)+'\n\n';
 const chat=await handleRequest(new Request('https://site.example/api/chat',{method:'POST',headers:{'Content-Type':'application/json','cf-connecting-ip':'public-cache'},body:JSON.stringify({messages:[{role:'user',content:'介绍 Promise'}]})}),env,{fetcher:async()=>new Response(new ReadableStream({start(c){c.enqueue(encoder.encode(frame({choices:[{delta:{content:'公开回答。'}}]})+frame({choices:[{delta:{},finish_reason:'stop'}]})+'data: [DONE]\n\n'));c.close()}}),{headers:{'Content-Type':'text/event-stream'}})});
 uncached(chat.headers);assert.match(chat.headers.get('content-type'),/text\/event-stream/);assert.match(await chat.text(),/event: done/);
 const missing=await handleRequest(new Request('https://site.example/articles/999999.js'));
 assert.equal(missing.status,404);
 assert.equal(missing.headers.get('cache-control'),'public, max-age=60');
 assert.equal(missing.headers.get('cdn-cache-control'),null);
 const blocked=['/articles/1','/articles/../secret.js','/nope','/api/chat'];
 for(const path of blocked){
  const response=await handleRequest(new Request('https://site.example'+path));
  assert.notEqual(response.status,200);
  uncached(response.headers);
 }
 const preview=readFileSync(new URL('../preview/index.html',import.meta.url),'utf8');
 assert.match(preview,/const ARTICLE_BODIES=/);
 assert.match(preview,/hidden-source-map/);
 const {default:worker}=await import('../dist/server/index.js');
 const bundled=await worker.fetch(new Request('https://site.example/articles/'+promise.id+'.js'));
 cacheable(bundled.headers);
 const bundledDoc=await bundled.json();
 assert.equal(bundledDoc.html,promise.html);
 const bundledHome=await worker.fetch(new Request('https://site.example/'));
 cacheable(bundledHome.headers);
 assert.equal((await bundledHome.text()).includes(marker),false);
});
