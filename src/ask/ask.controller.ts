import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AssistantsService } from '../assistants/assistants.service';
import { allowedModels } from '../config/allowed-models';
import { ConversationService } from '../ent/conversation.service';
import { CurrentUser } from '../ent/current-user.decorator';
import type { EntUser } from '../ent/session.service';
import { AskDto } from './ask.dto';
import { AskRequest } from './ask-request';
import { AskResponseDto } from './ask-response.dto';
import { AskService } from './ask.service';
import { AskStreamService } from './ask-stream.service';

/**
 * How often to write a keep-alive comment on an open SSE stream.
 *
 * Well under nginx's 60s `proxy_read_timeout` default, so a long silent
 * reasoning phase never looks idle to whatever sits in front of this.
 */
const HEARTBEAT_INTERVAL_MS = 15000;

@ApiTags('ask')
@Controller('ask')
export class AskController {
  private readonly models: string[];

  constructor(
    private readonly assistants: AssistantsService,
    private readonly conversations: ConversationService,
    private readonly askService: AskService,
    private readonly askStreamService: AskStreamService,
    config: ConfigService,
  ) {
    this.models = allowedModels(config);
  }

  @Post()
  @ApiOperation({ summary: 'Ask an assistant visible to the caller' })
  @ApiResponse({ status: 201, type: AskResponseDto })
  @ApiResponse({ status: 400, description: 'Model no longer allowed' })
  @ApiResponse({ status: 404, description: 'Unknown or hidden assistant' })
  async ask(
    @CurrentUser() user: EntUser,
    @Body() askDto: AskDto,
    // passthrough keeps Nest's normal serialization for the JSON path; only
    // the streaming branch writes to the response itself
    @Res({ passthrough: true }) res: Response,
  ): Promise<AskResponseDto | void> {
    const assistant = this.assistants.get(user, askDto.context);
    if (!this.models.includes(assistant.model)) {
      throw new BadRequestException(
        `model ${assistant.model} is no longer allowed on this instance`,
      );
    }

    const request: AskRequest = {
      message: askDto.message,
      context: assistant.name,
      model: assistant.model,
      sessionId: this.conversations.sessionFor(user.userId, assistant.name),
    };

    if (!askDto.stream) {
      return this.askService.ask(request);
    }
    return this.streamAsk(request, res);
  }

  @Delete('conversation/:context')
  @HttpCode(204)
  @ApiOperation({ summary: 'Start a new conversation with an assistant' })
  @ApiResponse({ status: 204, description: 'The next ask starts afresh' })
  @ApiResponse({ status: 404, description: 'Unknown or hidden assistant' })
  resetConversation(
    @CurrentUser() user: EntUser,
    @Param('context') context: string,
  ): void {
    const assistant = this.assistants.get(user, context);
    this.conversations.reset(user.userId, assistant.name);
  }

  /**
   * Writes an `askStream` run out as server-sent events.
   *
   * `X-Accel-Buffering: no` matters behind nginx, which otherwise buffers the
   * whole response and defeats the point of streaming.
   *
   * Two things keep a long answer alive. The heartbeat writes an SSE comment
   * on a timer, because a model can reason for minutes before its first word
   * and a connection with no bytes on it is an idle connection to every proxy
   * in between - which cuts it. And the abort controller stops the upstream
   * request the moment the client goes away, rather than paying for an answer
   * to the end of a socket nobody is reading.
   */
  private async streamAsk(request: AskRequest, res: Response): Promise<void> {
    res.status(201);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let clientGone = false;
    const abort = new AbortController();

    // `res`, not `req`: a client that hangs up mid-answer closes the response,
    // and `writableFinished` is what separates that from our own normal end.
    res.on('close', () => {
      if (res.writableFinished) {
        return;
      }
      clientGone = true;
      abort.abort();
    });

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // A comment frame: EventSource ignores it, proxies see a live connection
    const heartbeat = setInterval(() => {
      if (!clientGone && !res.writableEnded) {
        res.write(': ping\n\n');
      }
    }, HEARTBEAT_INTERVAL_MS);
    heartbeat.unref?.();

    try {
      for await (const event of this.askStreamService.askStream(
        request,
        abort.signal,
      )) {
        if (clientGone) {
          break;
        }

        switch (event.type) {
          case 'chunk':
            send('chunk', { text: event.text });
            break;
          case 'thinking':
            send('thinking', { text: event.text });
            break;
          case 'reset':
            send('reset', {});
            break;
          case 'done':
            send('done', event.response);
            break;
          case 'error':
            send('error', { message: event.message });
            break;
        }
      }
    } catch (error) {
      // Headers are already sent, so the exception filter can't turn this
      // into a status code - report it in-band instead
      if (!clientGone) {
        send('error', {
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    } finally {
      clearInterval(heartbeat);
      res.end();
    }
  }
}
