import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import {
  getOAuthProtectedResourceMetadataUrl,
  mcpAuthRouter,
} from '@modelcontextprotocol/sdk/server/auth/router.js';
import { McpController } from './mcp.controller';
import { ClientsStore } from './oauth/clients.store';
import { ConsentController } from './oauth/consent.controller';
import { mcpResource, McpTokenService } from './oauth/mcp-token.service';
import { OAuthProvider } from './oauth/oauth.provider';

/**
 * The SDK OAuth router: discovery metadata, `/register`, `/authorize` and
 * `/token`. A string token, so `configureApp` can mount it without
 * importing this module.
 */
export const MCP_AUTH_ROUTER = 'MCP_AUTH_ROUTER';

/** `/mcp` and its OAuth authorization server. */
@Module({
  controllers: [McpController, ConsentController],
  providers: [
    ClientsStore,
    McpTokenService,
    OAuthProvider,
    {
      provide: MCP_AUTH_ROUTER,
      inject: [OAuthProvider, ConfigService],
      useFactory: (provider: OAuthProvider, config: ConfigService) => {
        const origin = config.get<string>('PUBLIC_ORIGIN');
        return mcpAuthRouter({
          provider,
          issuerUrl: new URL(new URL(origin).origin),
          resourceServerUrl: mcpResource(origin),
          resourceName: 'Alegria',
        });
      },
    },
  ],
})
export class McpModule implements NestModule {
  constructor(
    private readonly provider: OAuthProvider,
    private readonly tokens: McpTokenService,
  ) {}

  configure(consumer: MiddlewareConsumer) {
    const resource = new URL(this.tokens.resource);
    consumer
      .apply(
        requireBearerAuth({
          verifier: this.provider,
          expectedResource: resource,
          resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(resource),
        }),
      )
      .forRoutes('mcp');
  }
}
