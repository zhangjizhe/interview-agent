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
  async chat(@Body() body: unknown, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.assistant.submit(body, request.get('origin'), request.ip || request.socket.remoteAddress || 'unknown');
    response.setHeader('Cache-Control', 'no-store');
    if (result.status === 'REFUSED') response.status(200);
    return result;
  }
  @Get('answers/:ticket')
  async answer(@Param('ticket') ticket: string, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    return this.assistant.answer(ticket);
  }
}
