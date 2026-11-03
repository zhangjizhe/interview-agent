const $=id=>document.getElementById(id),escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let category='全部',descending=true;
const page=(id,html)=>{const d=document.createElement('div');d.className='page';d.id=id;d.innerHTML=html;document.querySelector('main>footer').before(d);return d};
page('articles',`<div class="page-title"><div class="eyebrow">Writing / Archive</div><h2>文章与技术笔记</h2><p class="about-copy">来自旧博客的 ${ARTICLES.length} 篇真实记录，保留原始发布日期和正文。</p></div><div class="searchbar"><input type="search" id="article-search" aria-label="搜索文章" placeholder="搜索标题、技术关键词或正文…"><button class="btn secondary" id="article-sort">最新在前 ↓</button></div><div class="filters" id="article-filters" aria-label="文章分类"></div><div class="article-count" id="article-count" role="status" aria-live="polite"></div><div class="article-list" id="article-list"></div>`);
const reader=page('read','');
page('status',`<div class="page-title"><div class="eyebrow">Service status</div><h2>服务状态</h2><p class="about-copy">查看当前网站、内容与助手的可用情况。</p></div><div class="status-box"><h3 id="health-title">正在检查…</h3><p class="status-foot" id="health-description"></p><div class="status-row"><div><strong>个人网站</strong><small>首页、作品和在线简历</small></div><span class="status-badge" id="health-site">检查中</span></div><div class="status-row"><div><strong>文章归档</strong><small>${ARTICLES.length} 篇正文，含代码块和分类</small></div><span class="status-badge">已载入</span></div><div class="status-row"><div><strong>AI 助手</strong><small>站内检索、工具调用和流式回答</small></div><span class="status-badge" id="health-agent">检查中</span></div></div><p class="status-foot" id="health-time"></p><button class="btn secondary" id="health-refresh">重新检查 ↻</button><p class="status-foot" style="margin:25px 0 65px">仅显示本次检查结果，尚未接入持续监测和历史可用率统计。</p>`);
for(const label of ['全部',...new Set(ARTICLES.map(a=>a.category))]){const b=document.createElement('button');b.className='filter';b.textContent=label;b.onclick=()=>{category=label;renderList()};$('article-filters').append(b)}
function renderList(){const terms=$('article-search').value.trim().toLowerCase().split(/\s+/).filter(Boolean);const list=ARTICLES.filter(a=>(category==='全部'||a.category===category)&&terms.every(t=>(a.title+' '+a.text+' '+a.category).toLowerCase().includes(t))).sort((a,b)=>descending?b.date.localeCompare(a.date):a.date.localeCompare(b.date));$('article-count').textContent=`共 ${list.length} 篇 · 2020 年历史归档`;$('article-list').innerHTML=list.length?list.map(a=>`<a class="article-card" href="#article/${a.id}"><span class="textlink">${escapeHTML(a.category)} <span class="tag">历史笔记</span></span><h3>${escapeHTML(a.title)}</h3><p>${escapeHTML(a.excerpt)}</p><div class="article-meta"><time>${a.date}</time><span>约 ${a.minutes} 分钟阅读</span><span style="margin-left:auto;color:var(--accent)">阅读全文 ↗</span></div></a>`).join(''):'<div class="empty">没有找到匹配文章，试试 Promise、Webpack 或算法。</div>';document.querySelectorAll('.filter').forEach(b=>{b.classList.toggle('active',b.textContent===category);b.setAttribute('aria-pressed',String(b.textContent===category))})}
$('article-search').oninput=renderList;$('article-sort').onclick=()=>{descending=!descending;$('article-sort').textContent=descending?'最新在前 ↓':'最早在前 ↑';renderList()};renderList();
function renderArticle(id){const a=ARTICLES.find(a=>a.id===id);if(!a){reader.innerHTML='<div class="page-title"><h2>未找到文章</h2><a href="#articles">返回文章列表 →</a></div>';return}const index=ARTICLES.indexOf(a),prev=ARTICLES[index-1],next=ARTICLES[index+1];reader.innerHTML=`<div class="read-top"><a class="textlink" href="#articles">← 返回文章列表</a><button class="btn secondary" id="ask-article">问问这篇文章 ✧</button></div><div class="read-layout"><article class="read-paper"><span class="textlink">${escapeHTML(a.category)} / 原始归档</span><h1>${escapeHTML(a.title)}</h1><div class="read-meta"><span>张继哲</span><time>${a.date}</time><span>约 ${a.minutes} 分钟阅读</span></div><div class="archive-notice">这是 ${a.date.slice(0,4)} 年的原始笔记，保留当时的思路与代码。部分内容可能过时，代码未因本次迁移重新验证。</div><div class="read-body" id="read-body">${a.html}</div><div class="read-nav">${prev?`<a href="#article/${prev.id}">← ${escapeHTML(prev.title)}</a>`:'<span></span>'}${next?`<a href="#article/${next.id}">${escapeHTML(next.title)} →</a>`:''}</div></article><aside class="toc" id="read-toc"><strong>本篇目录</strong></aside></div>`;const headings=$('read-body').querySelectorAll('h1,h2,h3,h4');headings.forEach((h,n)=>{h.id='part-'+n;const a=document.createElement('a');a.textContent=h.textContent;a.href='#';a.onclick=e=>{e.preventDefault();h.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'})};$('read-toc').append(a)});if(!headings.length){const p=document.createElement('p');p.textContent='本文以代码为主';$('read-toc').append(p)}$('read-body').querySelectorAll('pre').forEach(pre=>{const b=document.createElement('button');b.className='copy-code';b.textContent='复制代码';b.onclick=async()=>{try{await navigator.clipboard.writeText(pre.querySelector('code')?.textContent||pre.textContent);b.textContent='已复制';setTimeout(()=>b.textContent='复制代码',1800)}catch{b.textContent='请选中代码复制'}};pre.append(b)});$('ask-article').onclick=()=>{openChat();$('chat-input').value=`请结合原文解释《${a.title}》，并指出需要注意的地方。`;$('chat-input').focus()}}
window.siteRoute=()=>{const raw=location.hash.slice(1)||'home',article=raw.startsWith('article/');let view=article?'read':raw;if(!['home','projects','resume','articles','read','status'].includes(view))view='home';if(article)renderArticle(raw.split('/')[1]);document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id===view));document.querySelectorAll('[data-nav]').forEach(a=>{const active=a.dataset.nav===(view==='read'?'articles':view);a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});document.title=({home:'张继哲 · AI 应用前端工程师',projects:'作品 · 张继哲',articles:'文章 · 张继哲',resume:'在线简历 · 张继哲',status:'服务状态 · 张继哲',read:(ARTICLES.find(a=>a.id===raw.split('/')[1])?.title||'文章')+' · 张继哲'})[view];window.scrollTo(0,0);if(view==='status')checkHealth()};
let history=[],busy=false,aborter=null,health=null;const feed=$('chat-feed'),state=$('chat-state'),input=$('chat-input'),send=$('chat-send');
function openChat(){$('chat-panel').hidden=false;$('chat-launch').hidden=true;$('chat-launch').setAttribute('aria-expanded','true');input.focus()}
function closeChat(){$('chat-panel').hidden=true;$('chat-launch').hidden=false;$('chat-launch').setAttribute('aria-expanded','false');$('chat-launch').focus()}
$('chat-launch').onclick=openChat;$('chat-close').onclick=closeChat;$('chat-panel').onkeydown=e=>{if(e.key==='Escape'){closeChat();e.stopPropagation()}};
$('chat-reset').onclick=()=>{history=[];feed.querySelectorAll('.message').forEach(m=>m.remove());state.textContent='对话已清空'};
const scrollFeed=()=>feed.scrollTop=feed.scrollHeight;
function addMessage(role,text){const m=document.createElement('div');m.className='message '+role;const name=document.createElement('span');name.className='speaker';name.textContent=role==='user'?'你':'小哲';const p=document.createElement('div');p.className='chat-text';p.textContent=text;m.append(name,p);feed.append(m);scrollFeed();return {m,p}}
function setBusy(value){busy=value;send.textContent=value?'停止等待 ■':'发送 ↑';input.disabled=value;$('chat-reset').disabled=value;feed.setAttribute('aria-busy',String(value))}
const ADMISSION_KEY='portfolio-lab-admission/v1';
async function admissionFor(question){
 if(health?.agentMode==='direct')return {requestKey:crypto.randomUUID(),stored:false};
 const questionHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(question)))].map(b=>b.toString(16).padStart(2,'0')).join('');
 let previous;try{previous=JSON.parse(sessionStorage.getItem(ADMISSION_KEY)||'null')}catch{throw Error('请求状态存储异常，本次未发送。')}
 if(previous&&(!/^[a-f0-9-]{36}$/i.test(previous.requestKey||'')||!/^[a-f0-9]{64}$/.test(previous.questionHash||'')))throw Error('请求状态未确认，本次未发送。');
 if(previous&&previous.questionHash!==questionHash)throw Error('尚有未确认请求，请输入原问题继续确认；不会自动发起新问题。');
 const admission=previous||{requestKey:crypto.randomUUID(),questionHash};
 try{sessionStorage.setItem(ADMISSION_KEY,JSON.stringify(admission))}catch{throw Error('无法保存请求标识，本次未发送。')}
 return {...admission,stored:true};
}
async function ask(question,retry=false){
 if(busy||!question.trim())return;
 if(location.protocol==='file:'){state.textContent='当前为离线文件，助手需要在线服务。';return}
 if(question.length>500){state.textContent='问题过长，请缩短到500字符以内。';return}
 setBusy(true);
 if(!retry)addMessage('user',question);
 const controller=new AbortController();aborter=controller;
 const timeout=setTimeout(()=>controller.abort('timeout'),65000),current=addMessage('assistant','');
 let full='',done=false,admission;state.textContent='正在连接助手…';
 try{
  admission=await admissionFor(question);input.value='';
  const res=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:[...history.slice(-8),{role:'user',content:question}],requestKey:admission.requestKey}),signal:controller.signal});
  if(!res.ok){let message='助手暂不可用，请稍后继续确认。';try{message=(await res.json()).error||message}catch{}throw Error(message)}
  if(!res.headers.get('content-type')?.includes('text/event-stream'))throw Error('助手响应异常，请继续确认。');
  for await(const e of readSSE(res.body)){
   const d=JSON.parse(e.data);
   if(e.event==='status')state.textContent=d.text;
   if(e.event==='delta'){full+=d.text||'';if(full.length>22000)throw Error('回答过长。');current.p.textContent=full;scrollFeed()}
   if(e.event==='error'){const error=Error(d.message||'回答中断。');error.terminal=d.terminal===true;throw error}
   if(e.event==='sources'){
    const box=document.createElement('div');box.className='sources';
    for(const source of d.items||[]){if(!/^#(article\/[0-9]+|projects|resume|notes)$/.test(source.url)&&source.url!=='https://github.com/zhangjizhe')continue;const a=document.createElement('a');a.href=source.url;if(source.url==='https://github.com/zhangjizhe'){a.target='_blank';a.rel='noopener noreferrer'}a.textContent='↗ '+source.title;a.onclick=()=>{if(innerWidth<760)closeChat()};box.append(a)}
    current.m.append(box);scrollFeed();
   }
   if(e.event==='done')done=true;
  }
  if(!done||!full.trim())throw Error('连接中断，回答可能不完整。');
  if(admission.stored)sessionStorage.removeItem(ADMISSION_KEY);
  history.push({role:'user',content:question},{role:'assistant',content:full.slice(0,2500)});history=history.slice(-8);
  state.textContent=health?.agentMode==='direct'?'回答完成 · 请核对来源':'公开资料摘录已返回 · 每次独立提问，请核对原文';
 }catch(e){
  if(!full)current.p.remove();const p=document.createElement('p');p.className='chat-error';
  const lab=health?.agentMode!=='direct';
  p.textContent=controller.signal.aborted?(lab?'已停止等待；服务端运行可能仍在继续，不代表取消或退款。':(controller.signal.reason==='timeout'?'响应超时，已停止。':'已停止生成。')):e.message;
  current.m.append(p);if(e.terminal===true&&admission?.stored){try{sessionStorage.removeItem(ADMISSION_KEY)}catch{}}else{const b=document.createElement('button');b.className='chat-retry';b.textContent=lab?'继续确认原请求':'重新尝试';b.onclick=()=>{current.m.remove();ask(question,true)};current.m.append(b);}
  input.value=question;state.textContent='回答未完成，未加入对话上下文';scrollFeed();
 }finally{clearTimeout(timeout);setBusy(false);if(aborter===controller)aborter=null;input.focus()}
}
$('chat-form').onsubmit=e=>{e.preventDefault();if(busy){aborter?.abort();return}ask(input.value.trim())};input.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();if(!busy)ask(input.value.trim())}};document.querySelectorAll('[data-prompt]').forEach(b=>b.onclick=()=>ask(b.dataset.prompt));
async function checkHealth(){const started=performance.now();let title='网站已打开',description='当前为离线文件。文章、作品和简历可阅读，助手需要在线服务。',site='离线可读';try{if(!['http:','https:'].includes(location.protocol))throw Error();const r=await fetch('/api/health',{cache:'no-store',signal:AbortSignal.timeout(6000)});if(!r.ok)throw Error();health=await r.json();if(typeof health.agentConfigured!=='boolean')throw Error();site='正常';title=health.agentConfigured?'站点服务可用':'站点可用 · 助手待启用';description=health.agentConfigured?(health.agentMode==='agent-lab'?'Agent Lab 地址配置检查通过；实际运行和围栏以请求验收为准。':'直连模型配置检查通过。真实可用性以对话请求结果为准。'):'文章、作品和简历已就绪。助手尚未配置，暂不能生成回答。'}catch{health={agentConfigured:false};if(location.protocol!=='file:'){site='接口不可达';title='页面可阅读 · 后端未连接';description='静态内容已载入，但服务接口暂不可用。'}}$('health-title').textContent=title;$('health-description').textContent=description;$('health-site').textContent=site;$('health-agent').textContent=health.agentConfigured?'已配置':'未启用';$('health-time').textContent=`检查于 ${new Date().toLocaleString('zh-CN')} · 耗时 ${Math.round(performance.now()-started)} ms`;$('chat-availability').textContent=health.agentConfigured?(health.agentMode==='agent-lab'?'通过 Agent Lab 查询公开资料；每次独立提问，完成后展示原文摘录。':'已显式启用直连模型模式，请核对回答来源。'):'助手暂未启用，可先浏览文章或邮件联系。'}$('health-refresh').onclick=checkHealth;checkHealth();
