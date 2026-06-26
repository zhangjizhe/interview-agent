import { ChatParams, ChatResponse, StreamChunk } from './types';

export abstract class BaseLLMProvider {
  abstract readonly name: string;
  abstract readonly defaultModel: string;

  abstract chat(params: ChatParams): Promise<ChatResponse>;
  abstract streamChat(params: ChatParams): AsyncGenerator<StreamChunk, void, void>;

  /**
   * 计算 token 数量（粗略估算）
   * 实际应该用对应模型的 tokenizer
   */
  countTokens(text: string): number {
    // 粗略估算：英文 1 token ≈ 4 字符，中文 1 token ≈ 1.5 字符
    const englishChars = (text.match(/[a-zA-Z\s]/g) || []).length;
    const otherChars = text.length - englishChars;
    return Math.ceil(englishChars / 4 + otherChars / 1.5);
  }
}
