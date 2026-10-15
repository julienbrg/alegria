import { Module } from '@nestjs/common';
import { AssistantsModule } from '../assistants/assistants.module';
import { EntModule } from '../ent/ent.module';
import { CostTracker } from '../memory/cost-tracking.service';
import { ProvidersModule } from '../providers/providers.module';
import { RagModule } from '../rag/rag.module';
import { AskController } from './ask.controller';
import { AskPreparationService } from './ask-preparation.service';
import { AskResultService } from './ask-result.service';
import { AskService } from './ask.service';
import { AskStreamService } from './ask-stream.service';
import { ContextLoaderService } from './context-loader.service';

@Module({
  imports: [AssistantsModule, EntModule, ProvidersModule, RagModule],
  controllers: [AskController],
  providers: [
    AskService,
    AskStreamService,
    AskPreparationService,
    AskResultService,
    ContextLoaderService,
    CostTracker,
  ],
})
export class AskModule {}
