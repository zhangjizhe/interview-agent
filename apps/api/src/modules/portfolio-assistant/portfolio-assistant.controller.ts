import { Body, Controller, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../auth/public.decorator';
import { PortfolioAssistantService } from './portfolio-assistant.service';

@Public()
@Controller('portfolio-assistant')
export class PortfolioAssistantController {
  constructor(private readonly assistant: PortfolioAssistantService) {}
  @Post('chat')
  @HttpCode(202)
  async chat(@Body() body: unknown, @Req() request: Request, @Res() response: Response) {
    const result = await this.assistant.submit(body, request.get('origin'), request.ip || request.socket.remoteAddress || 'unknown');
    response.setHeader('Cache-Control', 'no-store');
    if (result.status === 'REFUSED' || !request.accepts('text/event-stream') || !request.get('accept')?.includes('text/event-stream')) {
      return response.status(result.status === 'REFUSED' ? 200 : 202).json(result);
    }
    response.status(200).set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' });
    response.flushHeaders();
    let disconnected = false, sent = '';
    const close = () => { disconnected = true; };
    response.once('close', close);
    const emit = async (event: string, data: unknown) => {
      if (disconnected) return;
      if (!response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)) {
        await new Promise<void>(resolve => {
          const finish = () => { response.off('drain', finish); response.off('close', finish); resolve(); };
          response.once('drain', finish); response.once('close', finish);
        });
      }
    };
    const append = async (value: { answer: string; sources: Array<{ title: string; href: string }> }) => {
      if (!value.answer.startsWith(sent)) throw new Error('Public stream projection changed');
      await emit('sources', { items: value.sources.map(s => ({ title: s.title, url: s.href })) });
      if (value.answer.length > sent.length) await emit('delta', { text: value.answer.slice(sent.length) });
      sent = value.answer;
    };
    try {
      await emit('meta', { contractVersion: 'portfolio-assistant/stream-v1' });
      const ticket = 'ticket' in result ? result.ticket : undefined;
      if (!ticket) throw new Error('Missing public ticket');
      const deadline = Date.now() + 45000;
      while (!disconnected && Date.now() < deadline) {
        const state = await this.assistant.answer(ticket);
        if (state.status === 'COMPLETED') {
          if (typeof state.answer !== 'string' || !Array.isArray(state.sources)) throw new Error('Missing completed answer');
          await append({ answer: state.answer, sources: state.sources });
          await emit('done', { status: 'COMPLETED' });
          return;
        }
        if (state.status === 'FAILED' || state.status === 'REFUSED') {
          await emit('error', { terminal: true }); return;
        }
        const partial = await this.assistant.streamSnapshot(ticket);
        if (partial) await append(partial);
        await emit('status', { status: state.status });
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      if (!disconnected) await emit('error', { terminal: false });
    } catch {
      await emit('error', { terminal: true });
    } finally {
      response.off('close', close);
      response.end();
    }
  }
  @Get('answers/:ticket')
  async answer(@Param('ticket') ticket: string, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    return this.assistant.answer(ticket);
  }
}
