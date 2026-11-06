/** Public primary references, read 2026-11-05. Summaries are general context, not career evidence.
 * URtc is historical documentation; this registry makes no current compatibility guarantee.
 * Fixed local registry: no visitor-supplied URLs, live browsing, tools or private retrieval.
 */
export const technicalReferences = [
  { id: 'tech-urtc', title: 'URtc Web SDK 官方参考（历史文档）', href: 'https://ucloud.github.io/urtc-sdk-web/',
    quote: 'createClient', text: 'URtc Web SDK 参考列出客户端、流、加入房间以及流与连接状态事件。接入可围绕客户端初始化、加入与离开房间、媒体流生命周期和事件处理组织。文档列出的能力不证明个人实现了整个 SDK；该文档描述音视频 SDK，不说明 IM 聊天 SDK 的底层协议，不能推断聊天依赖 WebRTC。', documentIds: ['rtc'] },
  { id: 'tech-websocket', title: 'MDN：WebSocket 客户端', href: 'https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_client_applications',
    quote: 'Once the connection is established, the open event is fired', text: 'WebSocket 建立连接后通过 open 事件确认可发送；客户端还需处理 message、error 与 close 生命周期。一般工程分析可区分连接是否可用与业务状态是否一致，避免把网络连接成功直接等同于通话成功。', documentIds: ['cti'] },
  { id: 'tech-webrtc', title: 'MDN：WebRTC 信令与视频通话', href: 'https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Signaling_and_video_calling',
    quote: "WebRTC doesn't specify a transport mechanism for the signaling information.", text: 'WebRTC 信令负责协调连接信息，媒体传输与信令并非同一职责。应用可通过独立渠道交换 SDP 和 ICE 信息，并注意异步处理顺序。SDK 接入、业务信令、媒体底层是不同层次，不能由接入经历推断底层研发归属。', documentIds: ['rtc', 'cti'] },
  { id: 'tech-sse', title: 'MDN：Server-sent events', href: 'https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events',
    quote: "This is a one-way connection, so you can't send events from a client to a server.", text: 'SSE 是服务器向客户端的单向事件传输，可分事件类型处理数据与错误并关闭连接。流传输结束与业务处理完成是不同层次，界面需要分别表达连接、内容和业务结果状态。', documentIds: ['interview-agent', 'ai-skills'] },
  { id: 'tech-promise', title: 'MDN：Promise', href: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise',
    quote: 'The Promise object represents the eventual completion (or failure) of an asynchronous operation and its resulting value.', text: 'Promise 表示异步操作最终完成或失败及其结果，具有等待、兑现、拒绝状态，并通过处理函数衔接后续操作。历史手写笔记可用于讨论异步控制思路，不代表现行标准的完整实现。', documentIds: ['article-6-1', 'article-6-2', 'article-6-3', 'article-6-4', 'article-6-5'] },
] as const;
type DocumentId = { id?: string };
const applicable = (document: DocumentId) => technicalReferences.filter(reference => (reference.documentIds as readonly string[]).includes(document.id));
const publicReference = ({ id, title, href, quote, text }: typeof technicalReferences[number]) => ({ id, title, href, quote, text });
export function technicalReferencesFor(documents: DocumentId[]) {
  const ranked = documents.map(applicable), selected: typeof technicalReferences[number][] = [];
  const add = (reference: typeof technicalReferences[number] | undefined) => {
    if (reference && selected.length < 2 && !selected.some(item => item.id === reference.id)) selected.push(reference);
  };
  // Cover the highest-ranked evidence first, then diversify before adding secondary references.
  ranked.forEach(references => add(references[0]));
  ranked.forEach(references => references.forEach(add));
  return selected.map(publicReference);
}
export function validateTechnicalReferenceSnapshot(value: unknown, documents: DocumentId[]) {
  const current = technicalReferencesFor(documents);
  // Retained paid Runs used this earlier deterministic policy. Validate their exact
  // original snapshot rather than replacing it with newly selected context.
  const legacy = technicalReferences.filter(reference => documents.some(document => (reference.documentIds as readonly string[]).includes(document.id)))
    .slice(0, 2).map(publicReference);
  const serialized = JSON.stringify(value);
  if (serialized === JSON.stringify(current)) return current;
  if (serialized === JSON.stringify(legacy)) return legacy;
  throw new Error('Technical context mismatch');
}
