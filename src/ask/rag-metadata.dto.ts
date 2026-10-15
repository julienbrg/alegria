import { ApiProperty } from '@nestjs/swagger';
import type { StreamCost } from '../types/llm-stream';

export class RagMetadataDto {
  @ApiProperty({
    description: 'Files selected for this query',
    example: ['instruction-file.md', 'chapitre-1.md'],
  })
  selectedFiles: string[];

  @ApiProperty({
    description: 'Total files available in the context',
    example: 10,
  })
  totalFilesAvailable: number;

  @ApiProperty({
    description: 'Selection method used',
    example: 'rag-two-step',
  })
  selectionMethod: string;

  @ApiProperty({
    description: 'Cost of the file selection phase',
    required: false,
  })
  selectionCost?: StreamCost | null;
}
