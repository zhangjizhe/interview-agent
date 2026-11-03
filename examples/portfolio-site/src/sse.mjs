export async function* readSSE(body){
 if(!body)throw Error('Missing stream');const reader=body.getReader(),decoder=new TextDecoder();let line='',data=[],event='message',cr=false;
 const consume=s=>{if(s===''){const v=data.length?{event,data:data.join('\n')}:null;data=[];event='message';return v}if(s[0]===':')return;let k=s.indexOf(':'),field=k<0?s:s.slice(0,k),v=k<0?'':s.slice(k+1);if(v[0]===' ')v=v.slice(1);if(field==='data')data.push(v);if(field==='event')event=v};
 try{while(true){const {value,done}=await reader.read();for(const c of decoder.decode(value,{stream:!done})){if(c==='\n'&&cr){cr=false;continue}if(c==='\n'||c==='\r'){const e=consume(line);line='';cr=c==='\r';if(e)yield e}else{cr=false;line+=c}if(line.length>262144)throw Error('SSE frame too large')}if(done)break}if(line)consume(line);const e=consume('');if(e)yield e}finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
}
