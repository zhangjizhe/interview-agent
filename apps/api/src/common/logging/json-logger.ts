import type { LoggerService } from '@nestjs/common';
import { redactTelemetry } from '../../infra/langfuse/redact';

function sanitize(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'string') return redactTelemetry(value)
    .replace(/(password|secret|token|api[_-]?key)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[REDACTED]@').slice(0, 8192);
  if (value instanceof Error) return { name: value.name, message: sanitize(value.message), stack: sanitize(value.stack) };
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);
  const result = Array.isArray(value) ? value.slice(0, 100).map(v => sanitize(v, seen)) : Object.fromEntries(Object.entries(value).slice(0, 100).map(([key, item]) => [key,
    /api[_-]?key|email|phone|password|secret|token|authorization|cookie|prompt|content|message|response|resume|rawtext|input|output/i.test(key) && !/^(event|inputTokens|outputTokens|promptTokens|completionTokens|cachedTokens)$/.test(key)
      ? '[REDACTED]' : sanitize(item, seen)]));
  seen.delete(value);
  return result;
}

/** Nest Logger 原有调用形状保持不变，最终统一写 JSON；stdout 不经 console，防止递归。 */
export class JsonLogger implements LoggerService {
  constructor(private write: (line: string) => void = line => { process.stdout.write(line + '\n'); }) {}
  private emit(level: string, message: unknown, args: unknown[]) {
    const context = typeof args.at(-1) === 'string' ? args.at(-1) : undefined;
    this.write(JSON.stringify({ timestamp: new Date().toISOString(), level, context: sanitize(context), message: sanitize(message), details: sanitize(args.slice(0, context ? -1 : undefined)) }));
  }
  log(message: unknown, ...args: unknown[]) { this.emit('info', message, args); }
  error(message: unknown, ...args: unknown[]) { this.emit('error', message, args); }
  warn(message: unknown, ...args: unknown[]) { this.emit('warn', message, args); }
  debug(message: unknown, ...args: unknown[]) { this.emit('debug', message, args); }
  verbose(message: unknown, ...args: unknown[]) { this.emit('trace', message, args); }
  fatal(message: unknown, ...args: unknown[]) { this.emit('fatal', message, args); }
  captureConsole() {
    console.log = (...args) => this.log(args, 'Console');
    console.info = (...args) => this.log(args, 'Console');
    console.warn = (...args) => this.warn(args, 'Console');
    console.error = (...args) => this.error(args, 'Console');
    console.debug = (...args) => this.debug(args, 'Console');
  }
}
