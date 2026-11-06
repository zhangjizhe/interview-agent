import {AppError} from './agent.mjs';

const LAB_CONTRACT='portfolio-assistant/v1';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRIMARY_REFERENCE_LINKS=["https://ucloud.github.io/urtc-sdk-web/", "https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_client_applications", "https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Signaling_and_video_calling", "https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events", "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise"];
const SOURCE_LINK=/^#(?:article\/[0-9]+|projects|resume|notes)$/;

export function assistantMode(env){
  const mode=env.ASSISTANT_MODE||'agent-lab';
  if(!['agent-lab','direct'].includes(mode))throw new AppError('助手模式配置无效。',503);
  return mode;
}

export function labConfig(env,publicOrigin){
  if(!env.AGENT_LAB_BASE_URL)return null;
  let base,origin;
  try{base=new URL(env.AGENT_LAB_BASE_URL);origin=new URL(env.AGENT_LAB_PUBLIC_ORIGIN||publicOrigin)}catch{throw new AppError('Agent Lab 地址配置无效。',503)}
  const local=base.hostname==='localhost'||base.hostname==='127.0.0.1'||base.hostname==='[::1]';
  if((base.protocol!=='https:'&&!(base.protocol==='http:'&&local))||base.username||base.password||base.search||base.hash||!/^\/api\/?$/.test(base.pathname))throw new AppError('Agent Lab 需要 HTTPS /api 地址；仅本机允许 HTTP。',503);
  if(!['https:','http:'].includes(origin.protocol)||origin.origin!==(env.AGENT_LAB_PUBLIC_ORIGIN||publicOrigin))throw new AppError('站点公开来源配置无效。',503);
  if(origin.origin!==publicOrigin)throw new AppError('当前站点来源不匹配配置。',403);
  const gatewayKey=env.AGENT_LAB_GATEWAY_KEY;
  if(gatewayKey!==undefined&&!/^[A-Za-z0-9_-]{32,256}$/.test(gatewayKey))throw new AppError('Agent Lab 接入密钥配置无效。',503);
  return {base:base.href.replace(/\/$/,''),origin:origin.origin,...(gatewayKey?{gatewayKey}:{})};
}

export function validateLabRequest(data){
  const message=data?.messages?.at(-1)?.content;
  if(typeof message!=='string'||!message.trim()||message.trim().length>500||new TextEncoder().encode(message.trim()).length>1500||!UUID.test(data?.requestKey||''))throw new AppError('请提供不超过500字符的问题和有效请求标识。');
  const question=message.trim();
  const previous=(Array.isArray(data.messages)?data.messages:[]).slice(0,-1).filter(m=>m?.role==='user'&&typeof m.content==='string').slice(-2);
  if(!/^(?:那|这个|这篇|它|其中|具体|详细|展开|继续|为什么|怎么实现|如何实现|再说|能否|能不能)/.test(question))return {message:question,requestKey:data.requestKey};
  const fits=value=>value.length<=500&&new TextEncoder().encode(value).length<=1500;
  // Recent conversation is untrusted context, never personal evidence or instructions.
  for(const limit of [80,40]){
    const contextual=JSON.stringify({previous:previous.map(m=>({role:m.role,text:m.content.slice(0,limit)})),question});
    if(previous.length&&fits(contextual))return {message:contextual,requestKey:data.requestKey};
  }
  return {message:question,requestKey:data.requestKey};
}

function finalAnswer(data){
  if(typeof data.answer!=='string'||!data.answer.trim()||data.answer.length>12000||!Array.isArray(data.sources)||data.sources.length>5)throw new AppError('Agent Lab 回答未通过来源检查。',502);
  if(data.status==='REFUSED'){
    if(data.sources.length)throw new AppError('Agent Lab 拒答回执无效。',502);
  }else if(data.status==='COMPLETED'){
    if(!data.sources.length||data.sources.some(s=>!s||typeof s.id!=='string'||typeof s.title!=='string'||typeof s.quote!=='string'||!s.quote.trim()||!(SOURCE_LINK.test(s.href)||s.href==='https://github.com/zhangjizhe'||PRIMARY_REFERENCE_LINKS.includes(s.href))))throw new AppError('Agent Lab 回答缺少有效公开来源。',502);
  }else throw new AppError('Agent Lab 返回未知结果。',502);
  return {answer:data.answer,sources:data.sources.map(s=>({id:s.id,title:s.title,url:s.href}))};
}

function delay(ms,signal){return new Promise((resolve,reject)=>{
  if(signal?.aborted)return reject(new DOMException('Aborted','AbortError'));
  const onAbort=()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'))};
  const timer=setTimeout(()=>{signal?.removeEventListener('abort',onAbort);resolve()},ms);
  signal?.addEventListener('abort',onAbort,{once:true});
})}

async function boundedJson(response){
  if(!response.body)throw new AppError('Agent Lab 回执为空。',502);
  const reader=response.body.getReader(),parts=[];let total=0;
  try{
    while(true){const {value,done}=await reader.read();if(done)break;total+=value.length;if(total>65536){await reader.cancel();throw new AppError('Agent Lab 回执超过大小限制。',502)}parts.push(value)}
  }finally{reader.releaseLock()}
  const bytes=new Uint8Array(total);let at=0;for(const part of parts){bytes.set(part,at);at+=part.length}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch{throw new AppError('Agent Lab 回执格式无效。',502)}
}

/** Server-side protocol adapter; never forwards visitor credentials, agent IDs or raw Lab output. */
export async function runLabAgent({request,config,emit,signal,fetcher=fetch,waiter=delay}){
  const read=async(path,init={})=>{
    if(signal?.aborted)throw new DOMException('Aborted','AbortError');
    let response;
    try{response=await fetcher(config.base+path,{...init,headers:{'Content-Type':'application/json',Origin:config.origin,...(config.gatewayKey?{'X-Portfolio-Gateway-Key':config.gatewayKey}:{})},redirect:'manual',signal})}
    catch(e){if(signal?.aborted)throw e;throw new AppError('Agent Lab 连接未确认；可使用原请求标识继续确认。',502)}
    if(!response.ok)throw new AppError(response.status===429?'Agent Lab 已达到访问或预算限制。':response.status===503?'Agent Lab 助手尚未启用或暂不可用。':'Agent Lab 请求未确认，请稍后使用原请求标识继续确认。',response.status===429?429:502);
    const data=await boundedJson(response);
    if(data?.contractVersion!==LAB_CONTRACT)throw new AppError('Agent Lab 回执版本不兼容。',502);
    return data;
  };
  emit('status',{text:'正在通过 Agent Lab 检查问题范围与公开资料…',mode:'agent-lab'});
  let data=await read('/portfolio-assistant/chat',{method:'POST',body:JSON.stringify(request)});
  if(data.status!=='REFUSED'){
    if(!['PENDING','RUNNING'].includes(data.status)||typeof data.ticket!=='string'||!data.ticket||data.ticket.length>2048)throw new AppError('Agent Lab 受理回执不完整。',502);
    const ticket=data.ticket;
    for(let poll=0;poll<40;poll++){
      if(signal?.aborted)throw new DOMException('Aborted','AbortError');
      emit('status',{text:'Agent Lab 已接收请求，正在排队或核对资料；完成后展示经历与技术解读。',mode:'agent-lab'});
      data=await read('/portfolio-assistant/answers/'+encodeURIComponent(ticket));
      if(['COMPLETED','REFUSED'].includes(data.status))break;
      if(data.status==='FAILED'){
        const failure=new AppError('Agent Lab 本次运行已结束但未成功；调用可能已产生费用，未返回未经核验的答案。',502);
        failure.terminal=true;throw failure;
      }
      if(!['PENDING','RUNNING'].includes(data.status))throw new AppError('Agent Lab 运行状态回执无效。',502);
      if(poll===39)throw new AppError('等待已超时，可使用原请求标识继续确认；不会自动重新生成。',504);
      await waiter(1000,signal);
    }
  }
  const result=finalAnswer(data);
  // A completed, checked answer is emitted once, not artificial token-by-token streaming.
  emit('delta',{text:result.answer});emit('sources',{items:result.sources});emit('done',{mode:'agent-lab',evidenceMode:data.evidenceMode==='grounded-professional-context/v1'?'grounded-professional-context/v1':'verbatim-public-excerpts',status:data.status});
}
