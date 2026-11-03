import ARTICLES from './articles.json' with {type:'json'};
import {SITE_HTML} from './site-html.mjs';
import {AppError,modelConfig,validateMessages,runAgent,searchDocs} from './agent.mjs';
import {assistantMode,labConfig,validateLabRequest,runLabAgent} from './agent-lab.mjs';
const clients=new Map(),headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'};
const json=(data,status=200,more={})=>new Response(JSON.stringify(data),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8',...more}});
async function body(request){if(!request.headers.get('content-type')?.startsWith('application/json'))throw new AppError('请使用 JSON 请求。',415);if(!request.body||Number(request.headers.get('content-length')||0)>24000)throw new AppError('请求过大或为空。',413);const reader=request.body.getReader();let size=0,parts=[];try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>24000){await reader.cancel();throw new AppError('请求过大。',413)}parts.push(value)}}finally{reader.releaseLock()}const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length}try{return JSON.parse(new TextDecoder().decode(bytes))}catch{throw new AppError('JSON 格式不正确。')}}
function allow(id){const now=Date.now();if(clients.size>2000)for(const [k,v]of clients)if(v.reset<=now)clients.delete(k);if(clients.size>2000&&!clients.has(id))return false;let v=clients.get(id);if(!v||v.reset<=now){v={count:0,reset:now+600000};clients.set(id,v)}return ++v.count<=10}
export async function handleRequest(request,env={},options={}){try{
 const u=new URL(request.url);
 if(request.method==='GET'&&u.pathname==='/api/health'){let configured=false,mode='agent-lab';try{mode=assistantMode(env);configured=!!(mode==='agent-lab'?labConfig(env,u.origin):modelConfig(env))}catch{}return json({status:'ok',articles:ARTICLES.length,agentConfigured:configured,agentMode:mode,checkedAt:new Date().toISOString()})}
 if(request.method==='GET'&&u.pathname==='/api/search'){const q=u.searchParams.get('q')||'';return q.length>300?json({error:'检索词过长。'},400):json({items:searchDocs(q,ARTICLES)})}
 if(u.pathname==='/api/chat'){
  if(request.method!=='POST')return json({error:'仅支持 POST。'},405,{Allow:'POST'});
  const origin=request.headers.get('origin');if(origin&&origin!==u.origin)return json({error:'不允许跨站请求。'},403);
  const input=await body(request),messages=validateMessages(input),mode=assistantMode(env);
  const lab=mode==='agent-lab'?labConfig(env,u.origin):null;
  if(mode==='agent-lab'&&!lab)return json({error:'助手尚未连接 Agent Lab，可先浏览文章或通过邮件联系。'},503);
  if(mode==='direct'&&!modelConfig(env))return json({error:'助手尚未连接模型服务，可先浏览文章或通过邮件联系。'},503);
  const labRequest=mode==='agent-lab'?validateLabRequest(input):null;
  if(!allow(request.headers.get('oai-authenticated-user-id')||request.headers.get('cf-connecting-ip')||'local'))return json({error:'请求较频繁，请十分钟后重试。'},429,{'Retry-After':'600'});
  const aborter=new AbortController(),abort=()=>aborter.abort(request.signal.reason);if(request.signal.aborted)abort();else request.signal.addEventListener('abort',abort,{once:true});let closed=false;const encoder=new TextEncoder();
  const stream=new ReadableStream({async start(sink){const emit=(event,data)=>{if(!closed&&!aborter.signal.aborted)sink.enqueue(encoder.encode('event: '+event+'\ndata: '+JSON.stringify(data)+'\n\n'))};const timeout=setTimeout(()=>aborter.abort(new DOMException('Timeout','TimeoutError')),55000);const beat=setInterval(()=>{if(!closed&&!aborter.signal.aborted)sink.enqueue(encoder.encode(': ping\n\n'))},10000);try{await (mode==='agent-lab'?runLabAgent({request:labRequest,config:lab,signal:aborter.signal,emit,fetcher:options.fetcher||fetch,waiter:options.waiter}):runAgent({messages,articles:ARTICLES,env,signal:aborter.signal,emit,fetcher:options.fetcher||fetch}))}catch(e){if(!closed)try{const message=aborter.signal.aborted?(mode==='agent-lab'?(aborter.signal.reason?.name==='TimeoutError'?'等待超时；可用原请求继续确认，服务端运行可能仍在继续。':'已停止等待；不表示服务端调用已取消或退款。'):(aborter.signal.reason?.name==='TimeoutError'?'响应超时，请重试。':'已停止生成。')):e instanceof AppError?e.message:'模型连接失败，请稍后重试。';sink.enqueue(encoder.encode('event: error\ndata: '+JSON.stringify({message,...(mode==='agent-lab'&&e?.terminal===true?{terminal:true}:{})})+'\n\n'))}catch{}}finally{clearTimeout(timeout);clearInterval(beat);request.signal.removeEventListener('abort',abort);if(!closed){closed=true;try{sink.close()}catch{}}}},cancel(){closed=true;aborter.abort(new DOMException('Cancelled','AbortError'))}});
  return new Response(stream,{headers:{...headers,'Content-Type':'text/event-stream; charset=utf-8','X-Accel-Buffering':'no'}})
 }
 if(u.pathname.startsWith('/api/'))return json({error:'接口不存在。'},404);
 if(!['GET','HEAD'].includes(request.method))return json({error:'不支持的方法。'},405);
 if(!['/','/index.html'].includes(u.pathname))return new Response('Not found',{status:404});
 return new Response(request.method==='HEAD'?null:SITE_HTML,{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; object-src 'none'"}})
}catch(e){return json({error:e instanceof AppError?e.message:'服务暂不可用。'},e instanceof AppError?e.status:500)}}
export default {fetch:handleRequest};
