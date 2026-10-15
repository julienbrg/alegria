import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConversationService } from './conversation.service';
import { EntAuthGuard } from './ent-auth.guard';
import { EntOAuthService } from './ent-oauth.service';
import { EntController } from './ent.controller';
import { OriginMiddleware } from './origin.middleware';
import { SessionService } from './session.service';

@Module({
  controllers: [EntController],
  providers: [
    ConversationService,
    EntOAuthService,
    SessionService,
    { provide: APP_GUARD, useClass: EntAuthGuard },
  ],
  exports: [ConversationService, SessionService],
})
export class EntModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(OriginMiddleware)
      .exclude('mcp', 'mock-ent/*path')
      .forRoutes('*path');
  }
}
