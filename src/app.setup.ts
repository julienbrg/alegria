import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { SESSION_COOKIE } from './ent/session.service';
import { MCP_AUTH_ROUTER } from './mcp/mcp.module';
import { APP_VERSION } from './version';

/** Swagger UI on `/api`, the OpenAPI document on `/api-json`. */
function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Alegria')
    .setVersion(APP_VERSION)
    .addCookieAuth(SESSION_COOKIE, undefined, 'session')
    .addBearerAuth(undefined, 'mcp')
    .addSecurityRequirements('session')
    .build();
  SwaggerModule.setup('api', app, () =>
    SwaggerModule.createDocument(app, config),
  );
}

/** HTTP pipeline shared by `main.ts` and the e2e tests. */
export function configureApp(app: INestApplication): INestApplication {
  app.use(helmet());
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const config = app.get(ConfigService);
  // The SDK wants its OAuth router at the root, ahead of the Nest routes
  if (config.get<string>('MCP_ENABLED') === 'true') {
    app.use(app.get(MCP_AUTH_ROUTER, { strict: false }));
  }
  // Mounted outside the guard chain: the setting is the only protection
  if (config.get<string>('SWAGGER_ENABLED') === 'true') {
    setupSwagger(app);
  }
  return app;
}
