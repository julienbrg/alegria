import { Module } from '@nestjs/common';
import { RagService } from './rag.service';
import { MistralModule } from '../mistral/mistral.module';

@Module({
  imports: [MistralModule],
  providers: [RagService],
  exports: [RagService],
})
export class RagModule {}
