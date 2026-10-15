import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

/**
 * Upstream `model` and `sessionId` are gone: the model is the assistant's,
 * and the session belongs to the server. The global `ValidationPipe`
 * strips them if a client sends them anyway.
 */
export class AskDto {
  @ApiProperty({
    description: 'The message to send',
    example: 'Explique la photosynthèse en trois phrases.',
  })
  @IsString()
  @IsNotEmpty({ message: 'Message is required' })
  message: string;

  @ApiProperty({
    description: 'Name of an assistant visible to the caller',
    example: 'hdf-0000001a-svt-3e-x7k2p9',
  })
  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  context: string;

  @ApiProperty({
    description:
      'Stream the answer back as server-sent events instead of a single JSON body. The response is then `text/event-stream`: `chunk` events carrying incremental text, an optional `reset` event (Anthropic web search only) telling the client to discard what it has rendered so far, and a final `done` event with the same payload as the non-streaming response.',
    example: false,
    required: false,
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase() === 'true' : value,
  )
  @IsBoolean({ message: 'Stream must be a boolean' })
  stream?: boolean;
}
