import json,html,re,sys
from html.parser import HTMLParser
from pathlib import Path
class N:
 def __init__(self,t='',a=()):self.t=t;self.a=dict(a);self.c=[]
class P(HTMLParser):
 def __init__(self):super().__init__();self.root=N();self.s=[self.root]
 def handle_starttag(self,t,a):
  n=N(t,a);self.s[-1].c.append(n)
  if t not in {'br','img','hr','meta','link','input','source','wbr','area','base','col','embed','param','track'}:self.s.append(n)
 def handle_endtag(self,t):
  for i in range(len(self.s)-1,0,-1):
   if self.s[i].t==t:self.s=self.s[:i];break
 def handle_data(self,d):self.s[-1].c.append(d)
def find(n,f):
 if isinstance(n,str):return None
 if f(n):return n
 return next((r for c in n.c if (r:=find(c,f))),None)
def text(n):
 if isinstance(n,str):return n
 if n.t=='br':return '\n'
 return ''.join(map(text,n.c))+('\n' if n.t in ['p','pre','li','h1','h2','h3'] else '')
allowed=set('p h1 h2 h3 h4 h5 h6 ul ol li strong em b i blockquote pre code br hr table thead tbody tr th td a del'.split())
def render(n):
 if isinstance(n,str):return html.escape(n)
 if n.t in ['script','style','iframe','object','embed','form','input','button','svg']:return ''
 if n.t=='figure' and 'highlight' in n.a.get('class',''):
  code=find(n,lambda x:x.t=='td' and x.a.get('class')=='code')
  if code:return '<pre><code>'+html.escape(text(code).strip('\n'))+'</code></pre>'
 if n.t=='img':return '<p>原文图片：'+html.escape(n.a.get('alt') or '未随旧博客导出')+'</p>'
 inner=''.join(map(render,n.c))
 if n.t not in allowed:return inner
 attrs=''
 if n.t=='a' and n.a.get('href','').startswith(('https://','http://')):attrs=' href="'+html.escape(n.a['href'],quote=True)+'" target="_blank" rel="noopener noreferrer"'
 return '<'+n.t+attrs+'>'+inner+('' if n.t in ['br','hr'] else '</'+n.t+'>')
categories={'前端':'JavaScript','webpack':'工程化','算法':'数据结构与算法','leetcode':'算法题解','笔记':'部署与运维'}
out=[]
for i,a in enumerate(json.load(open(sys.argv[1]))):
 p=P();p.feed(a['html']);body=find(p.root,lambda n:'article-entry' in n.a.get('class','').split());assert body,a['title']
 content=render(body);clean=P();clean.feed(content);plain=text(clean.root).strip();prose=' '.join(text(n).strip() for n in body.c if isinstance(n,N) and n.t=='p').strip();summary=re.sub(r'\s+',' ',prose)[:100] if prose else '代码实践笔记，保留原始实现与注释，可进入全文查看。';cat=next(iter(a.get('categories',[])),{}).get('name','笔记')
 out.append(dict(id=str(i+1),title=a['title'],date=a['date'][:10],category=categories.get(cat,cat),html=content,text=plain,excerpt=summary+('…' if len(summary)>=100 else ''),minutes=max(1,round(len(plain)/500)),sourcePath=a['path']+'index.html'))
Path('src/articles.json').write_text(json.dumps(out,ensure_ascii=False,indent=2));print('Imported',len(out),'articles')
