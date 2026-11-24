import type { StreamChunk, ChatResponse } from '../llm/providers/types';

/** Collect the actual provider stream while persisting bounded checkpoints.
 * Checkpoints are private runtime evidence, never a public answer projection.
 */
export async function collectConfiguredStream(chunks: AsyncIterable<StreamChunk>, identity: { provider: string; model: string },
  checkpoint: (content: string) => Promise<void>): Promise<ChatResponse> {
  let content = '', saved = 0, savedAt = Date.now();
  let usage = { promptTokens: 0, completionTokens: 0 }, finishReason = 'error';
  let provider = identity.provider, model = identity.model;
  try {
    for await (const chunk of chunks) {
      if (chunk.toolCall || chunk.isFallbackMarker) throw new Error('Configured text stream changed protocol');
      if (chunk.content) {
        content += chunk.content;
        if (content.length > 32768) throw new Error('Configured stream exceeds output bound');
        if (content.length - saved >= 256 || Date.now() - savedAt >= 250) {
          await checkpoint(content); saved = content.length; savedAt = Date.now();
        }
      }
      if (chunk.usage) usage = chunk.usage;
      if (chunk.finishReason) finishReason = chunk.finishReason;
      if (chunk.provider) provider = chunk.provider;
      if (chunk.model) model = chunk.model;
    }
  } catch {
    // Return received billing evidence before the caller marks the Run failed.
    finishReason = 'error';
  }
  if (content.length !== saved) {
    try { await checkpoint(content); } catch { finishReason = 'error'; }
  }
  if (finishReason !== 'stop' && finishReason !== 'length') finishReason = 'error';
  return { content, usage, finishReason, provider, model };
}
