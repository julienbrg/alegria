import { Module } from '@nestjs/common';
import { ConditionalModule, ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AskModule } from './ask/ask.module';
import { AssistantsModule } from './assistants/assistants.module';
import { validate } from './config/env.validation';
import { DbModule } from './db/db.module';
import { EntModule } from './ent/ent.module';
import { McpModule } from './mcp/mcp.module';
import { MockEntModule } from './mock-ent/mock-ent.module';

const API_ROUTES = [
  '/.well-known',
  '/api',
  '/api-json',
  '/ask',
  '/auth',
  '/authorize',
  '/context',
  '/me',
  '/mcp',
  '/mock-ent',
  '/oauth',
  '/register',
  '/token',
].map((path) => `${path}{/*path}`);

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate }),
    // In development Vite serves the SPA and proxies the API instead
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'web', 'dist'),
      exclude: API_ROUTES,
    }),
    DbModule,
    EntModule,
    AssistantsModule,
    AskModule,
    ConditionalModule.registerWhen(
      McpModule,
      (env) => env.MCP_ENABLED === 'true',
    ),
    ConditionalModule.registerWhen(
      MockEntModule,
      (env) => env.ENT_MOCK === 'true',
    ),
  ],
})
export class AppModule {}
