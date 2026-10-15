import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = configureApp(await NestFactory.create(AppModule));

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT');
  await app.listen(port, '127.0.0.1');
  logger.log(`Alegria listening on 127.0.0.1:${port}`);
}
bootstrap().catch((error) => {
  new Logger('Bootstrap').error('Failed to start the application:', error);
  process.exit(1);
});
