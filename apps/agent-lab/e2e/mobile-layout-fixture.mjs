// UI-only fixtures. Use a dedicated static preview, never a real authenticated service.
export async function installMobileLayoutFixture({ page, context }) {
if (page.url() !== 'about:blank' && !page.url().startsWith('http://127.0.0.1:5186/')) throw new Error('Use only the isolated static preview on port 5186');
const long='mobile-layout-fixture-'+ 'x'.repeat(64);
const text='合成资料：用于验证手机页面上的长标题、来源和操作，不代表真实评测。';
const pub={id:'mobile-version',agentId:'mobile-agent',version:'1.0.0',status:'PUBLISHED',systemPrompt:text,modelConfig:{provider:'qwen',maxTokens:64,temperature:.2},runtimeConfig:{adapter:'single-agent-v1',maxEstimatedCostCny:.05,maxDurationMs:10000}};
const agent={id:'mobile-agent',key:long,name:'手机适配验收 · 合成 Agent',type:'CUSTOM',description:text,status:'ACTIVE',currentVersion:pub,versions:[pub],_count:{versions:1}};
const harness={id:'mobile-harness',type:'SYNTHETIC',status:'FAILED',agent:{agentKey:long,version:'1.0.0',runtimeVersion:'fixture'},datasetVersion:long,metrics:{qualityScore:.5,structuredOutputValidRate:1},durationMs:1234,inputTokens:300,outputTokens:120,estimatedCostCny:.01,failures:[{caseId:'fixture',category:'SYNTHETIC_LAYOUT_FAILURE',severity:'HIGH'}],startedAt:'2026-11-17T01:00:00Z'};
const runtime={id:'mobile-run-'+long,status:'FAILED',agentId:agent.id,agentVersionId:pub.id,agent:{name:agent.name,key:long},agentVersion:{version:'1.0.0'},application:long,createdAt:'2026-11-17T01:00:00Z',error:text,input:{message:text},output:{response:text}};
const mobileFixture={agent,pub,runtime,errors:[],unknown:[],mutations:[]};
page.on('pageerror',e=>mobileFixture.errors.push(e.message));
await page.route('**/api/**',async route=>{const r=route.request(),url=new URL(r.url()),p=url.pathname;let data;
 if(p==='/api/auth/change-password/request')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({challengeId:'SYNTHETIC-UI-ONLY',maskedEmail:'f***@example.invalid'})});
 if(r.method()!=='GET') {mobileFixture.mutations.push(p);return route.fulfill({status:405,contentType:'application/json',body:'{"message":"No real writes or model calls in mobile layout fixture"}'});}
 if(p==='/api/admin/mcp-servers')data={servers:[{name:long,displayName:'手机适配 · 合成工具',enabled:true,status:'builtin',transport:'internal',executable:true,description:text}],count:1,runningCount:1};
 else if(p==='/api/agent-lab/dashboard')data={dataset:{version:long,caseCount:1,responseCount:1,validationStatus:'SYNTHETIC'},summary:{runCount:1,failedRunCount:1,latestDecision:null,experimentCount:1},thresholds:{qualityScore:.8,structuredOutputValidRate:1,latencyMs:10000,estimatedCostCny:.05},runs:[harness],decisions:[{id:'fixture-decision',decision:'NEEDS_REVIEW',rationale:text,agent:harness.agent,datasetVersion:long,createdAt:harness.startedAt}],experiments:[{id:'fixture-experiment',name:'合成实验',hypothesis:text,status:'COMPLETED',datasetVersion:long,control:harness.agent,treatment:harness.agent,runCount:2}]};
 else if(p==='/api/agent-lab/recorded-imports')data=[{id:'fixture-import',receiptHash:'a'.repeat(64),status:'FAILED',submittedBy:'fixture',error:text,createdAt:harness.startedAt,agent:harness.agent,datasetVersion:long,metrics:harness.metrics,failureCount:1}];
 else if(p==='/api/agent-lab/agents')data=[agent];
 else if(p==='/api/agent-lab/agents/mobile-agent')data=agent;
 else if(p.endsWith('/mobile-agent/versions'))data=[pub];
 else if(p.endsWith('/mobile-agent/evaluations'))data=[];
 else if(['/api/agent-lab/datasets','/api/agent-lab/evaluators'].includes(p))data=[];
 else if(p==='/api/agent-lab/runtime/models')data=[{provider:'qwen',model:long,enabled:true}];
 else if(p==='/api/agent-lab/runs')data=[runtime];
 else if(p===`/api/agent-lab/runs/${runtime.id}`)data=runtime;
 else if(p===`/api/agent-lab/runs/${runtime.id}/trace`)data=[{id:'fixture-event',seq:1,type:'RUN_FAILED',name:long,runId:runtime.id,createdAt:harness.startedAt,error:text,metadata:{reason:long},payload:{source:'https://example.invalid/'+long.repeat(3)}}];
 else if(p==='/api/agent-lab/data-collections')data={items:[{id:'mobile-collection',name:'手机资料 · 合成集合',kind:'DOCUMENT',access:'OWNER',_count:{records:1}}],hasMore:false,page:1};
 else if(p==='/api/agent-lab/data-collections/mobile-collection/records')data={items:[{id:'mobile-record',collectionId:'mobile-collection',tags:['fixture'],title:text,content:text.repeat(4),sourceUrl:'https://example.invalid/'+long.repeat(3),revision:1}],hasMore:false,page:1,access:'OWNER'};
 else if(/mobile-collection\/(grants|audit)$/.test(p))data={items:[],hasMore:false,page:1};
 else if(p==='/api/knowledge-base/list')data={items:[{id:'mobile-knowledge',title:text,body:text.repeat(4),topic:'手机验收',tags:['fixture']}]};
 else if(p==='/api/interview/question-bank/list')data={results:Array.from({length:12},(_,i)=>({id:'mobile-q-'+i,questionId:'mobile-q-'+i,question:`合成题目 ${i}：${text}`,answer:text.repeat(4),position:'前端开发工程师',level:'P5',category:'布局验收',tags:[long],source:'https://example.invalid/'+long.repeat(3)}))};
 else if(p==='/api/interview/question-bank/catalog/status')data={contractVersion:'question-catalog/v1',mode:'LEGACY',canonicalStore:'milvus-legacy',adoptionRequired:true};
 else if(p==='/api/agent-lab/audit')data={kind:'RUN',page:1,limit:20,total:1,hasMore:false,items:[{...harness,createdAt:harness.startedAt}]};
 else if(p==='/api/agent-lab/operation-logs')data={page:1,limit:20,total:1,hasMore:false,items:[{id:'fixture-log',actorId:'fixture-admin',action:'MCP_CONFIG_RELOAD',objectType:'MCP_REGISTRY',objectId:long,outcome:'SUCCEEDED',createdAt:harness.startedAt}]};
 else {mobileFixture.unknown.push(p);return route.fulfill({status:404,contentType:'application/json',body:'{"message":"Undefined synthetic mobile fixture route"}'});}
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
});
await page.addInitScript(()=>{localStorage.setItem('ia_user_role','ADMIN');localStorage.setItem('ia_access_token','SYNTHETIC-MOBILE-UI-NOT-A-REAL-SESSION');});
const mobileCdp=await context.newCDPSession(page);
const mobileMetrics=async(width,height)=>{await mobileCdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:3,mobile:true,screenWidth:width,screenHeight:height});await mobileCdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});};
const measureMobile=async()=>await page.evaluate(()=>{const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};const nodes=[...document.querySelectorAll('main *, .lab-navigation *')].filter(visible);return {viewport:innerWidth,layout:document.documentElement.clientWidth,width:document.documentElement.scrollWidth,over:nodes.filter(e=>{const r=e.getBoundingClientRect();return r.right>document.documentElement.clientWidth+1||r.left< -1;}).slice(0,8).map(e=>({tag:e.tagName,cls:e.className,w:Math.round(e.getBoundingClientRect().width)})),small:[...document.querySelectorAll('button,summary')].filter(visible).filter(e=>{const r=e.getBoundingClientRect();return r.height<43.9||r.width<43.9;}).map(e=>({tag:e.tagName,text:e.textContent?.slice(0,50),height:e.getBoundingClientRect().height,width:e.getBoundingClientRect().width})),smallFonts:[...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=file]),select,textarea')].filter(visible).filter(e=>parseFloat(getComputedStyle(e).fontSize)<16).map(e=>({tag:e.tagName,cls:e.className,font:getComputedStyle(e).fontSize})).slice(0,5)};});


return {mobileFixture,mobileMetrics,measureMobile,detach:()=>mobileCdp.detach()};
}

// These are synthetic viewport models, not native WeChat/WebKit engines.
export async function verifyKeyboardLayoutModels({ page, expect, mobileMetrics, measureMobile }) {
await page.addInitScript(()=>{
 const mode=new URL(location.href).searchParams.get('keyboardModel');
 if(mode==='visual-only'){
  const viewport=new EventTarget();Object.assign(viewport,{height:844,offsetTop:0,offsetLeft:0,scale:1});
  Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport});window.__viewportFixture=viewport;
 }
 if(mode==='window-fallback')Object.defineProperty(window,'visualViewport',{configurable:true,value:undefined});
});
const results=[];
for(const model of ['layout-resize','visual-only','window-fallback']) {
 await mobileMetrics(390,844);
 await page.goto('http://127.0.0.1:5186/?view=mcp&keyboardModel='+model,{waitUntil:'networkidle'});
 await expect(page.locator('meta[name=viewport]')).toHaveAttribute('content',/interactive-widget=resizes-content/);
 await page.getByRole('button',{name:'打开导航',exact:true}).click();await page.getByRole('button',{name:/账号安全/}).click();
 await page.getByRole('button',{name:'发送邮箱验证码',exact:true}).click();await page.getByLabel('邮箱验证码',{exact:true}).waitFor();
 if(model==='layout-resize')await mobileMetrics(390,320);
 else await page.evaluate(mode=>{if(mode==='visual-only'){Object.assign(window.__viewportFixture,{height:320,offsetTop:90});window.__viewportFixture.dispatchEvent(new Event('resize'));window.__viewportFixture.dispatchEvent(new Event('scroll'));}else{Object.defineProperty(window,'innerHeight',{configurable:true,value:320});window.dispatchEvent(new Event('resize'));}},model);
 await expect(page.locator('.agent-security-backdrop')).toHaveCSS('height','320px');
 await page.getByLabel('邮箱验证码',{exact:true}).fill('123456');await expect(page.getByLabel('邮箱验证码',{exact:true})).toBeFocused();
 const bounds=await page.getByRole('dialog').evaluate(el=>{const r=el.getBoundingClientRect();const backdrop=el.parentElement.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,areaTop:backdrop.top,areaBottom:backdrop.bottom};});
 if(bounds.top<bounds.areaTop-1||bounds.bottom>bounds.areaBottom+1)throw new Error('Dialog outside visible area: '+JSON.stringify({model,bounds}));
 const input=await page.getByLabel('邮箱验证码',{exact:true}).evaluate(el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom};});
 if(input.top<bounds.top-1||input.bottom>bounds.bottom+1)throw new Error('Focused input outside dialog area: '+JSON.stringify({model,input,bounds}));
 await page.getByRole('button',{name:'关闭',exact:true}).click();
 await expect(page.getByRole('button',{name:'打开导航',exact:true})).toBeFocused();await expect(page.locator('body')).not.toHaveCSS('overflow','hidden');
 await mobileMetrics(844,390);
 await page.getByRole('button',{name:'打开导航',exact:true}).click();await page.getByRole('button',{name:'题库治理',exact:true}).click();
 await page.getByRole('button',{name:'导入题目',exact:true}).click();await page.getByRole('button',{name:'网页链接',exact:true}).click();
 await page.getByLabel('网页地址').fill('https://example.invalid/keyboard-layout-only');
 const layout=await measureMobile();if(layout.width>layout.layout+1||layout.small.length||layout.smallFonts.length)throw new Error(JSON.stringify({model,layout}));
 results.push({model,bounds,input,landscapeWidth:layout.width,landscapeViewport:layout.layout,focusRestored:true,scrollRestored:true});
}

return results;
}
