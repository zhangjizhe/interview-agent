/* Same-origin, read-only portfolio assistant. No credentials or model keys in the browser. */
(() => {
  if (document.getElementById('portfolio-assistant-toggle')) return;
  const endpoint = '/api/portfolio-assistant';
  const storageKey = 'portfolio-assistant-pending/v1';
  let pending = null;
  let busy = false;
  let waiting = false;
  let timer;
  const style = document.createElement('style');
  style.id = 'portfolio-assistant-style';
  style.textContent = `#portfolio-assistant-toggle{position:fixed;bottom:24px;right:24px;z-index:40;background:var(--accent,#7060df);color:white;border:0;border-radius:30px;padding:12px 20px;box-shadow:0 8px 28px #0002}#portfolio-assistant{position:fixed;right:24px;bottom:82px;width:min(390px,calc(100vw - 32px));max-height:calc(100dvh - 110px);overflow:auto;z-index:40;background:var(--paper,#fff);color:var(--ink,#232332);border:1px solid var(--line,#ddd);border-radius:16px;box-shadow:0 12px 50px #0002;padding:20px;box-sizing:border-box}#portfolio-assistant[hidden]{display:none}#portfolio-assistant h2{font-size:19px;margin:0 0 10px}#portfolio-assistant p,#portfolio-assistant label{font-size:12px;line-height:1.7}#portfolio-assistant textarea{width:100%;min-height:85px;box-sizing:border-box;background:var(--bg,#f7f8fc);color:inherit;border:1px solid var(--line,#ddd);border-radius:8px;padding:10px;font:inherit}#portfolio-assistant button{border:1px solid var(--line,#ddd);border-radius:8px;padding:7px 12px;margin:8px 6px 0 0;background:var(--soft,#efecfc);color:inherit}#portfolio-assistant button:disabled{opacity:.5;cursor:wait}#portfolio-assistant-answer{white-space:pre-wrap;font-size:13px;overflow-wrap:anywhere}#portfolio-assistant-sources{font-size:12px;padding-left:20px}#portfolio-assistant-sources a{color:var(--accent,#7060df);text-decoration:underline}`;
  document.head.append(style);
  const toggle = document.createElement('button');
  toggle.id = 'portfolio-assistant-toggle'; toggle.textContent = '问问简历助手';
  toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-controls', 'portfolio-assistant');
  const panel = document.createElement('section');
  panel.id = 'portfolio-assistant'; panel.hidden = true; panel.setAttribute('aria-label', '简历与项目助手');
  // All dynamic content below uses textContent, never HTML from the service or visitor.
  panel.innerHTML = '<h2>简历与项目助手</h2><p>仅回答张继哲公开简历、项目与工程手记。每次独立提问，回答为公开原文摘录，不代表独立核实。请勿输入个人隐私。</p><form><label for="portfolio-assistant-question">你的问题</label><textarea id="portfolio-assistant-question" maxlength="500" required placeholder="例如：介绍你的 CTI 项目"></textarea><button type="submit">发送问题</button><button type="button" data-action="resume" hidden>继续查看结果</button><button type="button" data-action="stop" hidden>停止等待</button></form><p role="status" aria-live="polite"></p><div id="portfolio-assistant-answer"></div><ul id="portfolio-assistant-sources"></ul>';
  document.body.append(toggle, panel);
  const form = panel.querySelector('form'), input = panel.querySelector('textarea'), submit = panel.querySelector('[type=submit]');
  const resume = panel.querySelector('[data-action=resume]'), stop = panel.querySelector('[data-action=stop]');
  const status = panel.querySelector('[role=status]'), answer = panel.querySelector('#portfolio-assistant-answer'), sources = panel.querySelector('ul');
  const message = text => { status.textContent = text; };
  function controls() {
    submit.disabled = busy || Boolean(pending?.ticket);
    input.disabled = busy || Boolean(pending?.ticket);
    resume.hidden = !pending?.ticket || waiting;
    stop.hidden = !waiting;
  }
  function persist() { sessionStorage.setItem(storageKey, JSON.stringify(pending)); }
  function finish() {
    pending = null; busy = false; waiting = false; clearTimeout(timer);
    try { sessionStorage.removeItem(storageKey); } catch { /* No more provider work is started automatically. */ }
    controls();
  }
  async function json(path, options) {
    const response = await fetch(`${endpoint}${path}`, { ...options, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', signal: AbortSignal.timeout(12000) });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(response.status === 503 ? '助手尚未启用或暂不可用。' : response.status === 429 ? '已达到访问或预算限制，请稍后再试。' : '请求未确认，请保留当前问题后重试确认。');
    if (data?.contractVersion !== 'portfolio-assistant/v1') throw new Error('服务回执不完整，请勿重复发起新请求。');
    return data;
  }
  function render(data) {
    if (data.status === 'REFUSED') {
      if (typeof data.answer !== 'string' || !Array.isArray(data.sources) || data.sources.length) throw new Error('拒答回执不完整。');
    } else if (data.status === 'COMPLETED') {
      if (typeof data.answer !== 'string' || !data.answer.trim() || data.answer.length > 12000 || !Array.isArray(data.sources) || !data.sources.length || data.sources.length > 3
        || data.sources.some(s => !s || typeof s.title !== 'string' || typeof s.quote !== 'string' || (!/^#(?:resume|projects|notes|article\/[0-9]+)$/.test(s.href) && s.href !== 'https://github.com/zhangjizhe'))) throw new Error('答案来源回执不完整。');
    } else throw new Error('未知答案状态。');
    answer.textContent = data.answer; sources.replaceChildren();
    for (const source of data.sources) {
      const li = document.createElement('li'), link = document.createElement('a');
      link.href = source.href; link.textContent = source.title; li.append(link); sources.append(li);
    }
    finish(); message(data.status === 'COMPLETED' ? `依据公开资料${data.sourceRevision ? ` · ${data.sourceRevision}` : ''}` : '未找到可展示的公开依据，未生成无来源答案；是否已产生调用以服务端记录为准。');
  }
  async function poll(deadline = Date.now() + 90000) {
    if (!pending?.ticket || !waiting) return;
    const ticket = pending.ticket;
    try {
      const data = await json(`/answers/${encodeURIComponent(ticket)}`);
      if (!waiting || pending?.ticket !== ticket) return;
      if (data.status === 'COMPLETED' || data.status === 'REFUSED') return render(data);
      if (data.status === 'FAILED') { finish(); message('本次运行未完成，未返回未经核验的答案；失败调用可能已产生费用。'); return; }
      if (!['PENDING', 'RUNNING'].includes(data.status)) throw new Error('运行状态回执不完整。');
      if (Date.now() > deadline) throw new Error('等待已超时，可继续查询原请求；不会自动重新生成。');
      message(data.status === 'PENDING' ? '请求已接收，正在排队…' : '正在核对公开资料…');
      timer = setTimeout(() => { void poll(deadline); }, 1500);
    } catch (error) { waiting = false; busy = false; message(error.message); controls(); }
  }
  toggle.onclick = () => { panel.hidden = !panel.hidden; toggle.setAttribute('aria-expanded', String(!panel.hidden)); if (!panel.hidden && !input.disabled) input.focus(); };
  stop.onclick = () => { waiting = false; clearTimeout(timer); message('已停止等待；服务端请求可能仍在运行，这不表示已取消或退款。'); controls(); };
  resume.onclick = () => { waiting = true; controls(); void poll(); };
  form.onsubmit = async event => {
    event.preventDefault();
    const question = input.value.trim();
    if (busy || pending?.ticket || !question) return;
    if (question.length > 500) { message('问题不能超过500字符。'); return; }
    try {
      pending ||= { requestKey: crypto.randomUUID() };
      persist(); // Fail closed before POST if durable same-tab admission storage is unavailable.
    } catch { message('无法保存请求标识，本次未发送。请允许会话存储后重试。'); return; }
    busy = true; controls(); message('正在检查问题范围…');
    try {
      const data = await json('/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: question, requestKey: pending.requestKey }) });
      if (data.status === 'REFUSED') return render(data);
      if (!['PENDING', 'RUNNING'].includes(data.status) || typeof data.ticket !== 'string' || data.ticket.length > 2048 || !data.ticket) throw new Error('受理回执不完整。');
      pending.ticket = data.ticket;
      try { persist(); } catch { message('请求已接收，但无法保存查询票据；请勿关闭此页面。'); }
      waiting = true; busy = false; controls(); void poll();
    } catch (error) { busy = false; message(`${error.message} 再次发送会复用原请求标识，请保持问题不变。`); controls(); }
  };
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
    if (saved && typeof saved.requestKey === 'string' && /^[0-9a-f-]{36}$/i.test(saved.requestKey) && (!saved.ticket || (typeof saved.ticket === 'string' && saved.ticket.length <= 2048))) pending = saved;
    else if (saved) throw new Error('invalid storage');
    if (pending) message(pending.ticket ? '有一个未确认的请求，可继续查看原结果。' : '上次受理结果未知，请输入原问题重试确认；请求标识将复用。');
  } catch { busy = true; message('请求状态存储异常，已暂停提交；请检查浏览器会话存储。'); }
  controls();
})();
