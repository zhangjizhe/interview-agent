import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
test('repeated source frames replace the citation set instead of growing duplicate cards',()=>{
 const client=readFileSync(new URL('../src/client.mjs',import.meta.url),'utf8');
 const implementation=client.match(/function showSources\(node,items\)\{[^\n]+/)[0];
 class Element{
  constructor(){this.childNodes=[];this.parent=null}
  append(child){child.parent=this;this.childNodes.push(child)}
  remove(){this.parent.childNodes=this.parent.childNodes.filter(n=>n!==this)}
  querySelectorAll(){return this.childNodes.filter(n=>n.className==='sources')}
 }
 const show=runInNewContext(implementation+';showSources',{document:{createElement:()=>new Element()},safeChatSources:items=>items,innerWidth:1000});
 const message=new Element(),project={title:'项目',url:'#projects'},resume={title:'简历',url:'#resume'};
 for(let i=0;i<20;i++)show(message,[project]);
 show(message,[project,resume]);
 assert.equal(message.childNodes.length,1);assert.equal(message.childNodes[0].childNodes.length,2);
 show(message,[]);assert.equal(message.childNodes.length,0);
});
