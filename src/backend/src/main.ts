import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { envValidationSchema } from './config/env.validation';

const logger = new Logger('Bootstrap');

interface ValidatedEnv {
  CORS_ALLOWED_ORIGINS: string;
}

const validation = envValidationSchema.validate(process.env, {
  allowUnknown: true,
  abortEarly: false,
}) as { error?: { details: { message: string }[] }; value: ValidatedEnv };

const { error: envError, value: envVars } = validation;

if (envError) {
  console.error(
    `\n[Bootstrap] Environment validation failed — fix your .env and restart.\n` +
      envError.details.map((d) => `  • ${d.message}`).join('\n') +
      '\n',
  );
  process.exit(1);
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Serve static assets from the public folder
  app.useStaticAssets(join(__dirname, '..', 'public'));

  const allowedOrigins = String(envVars.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin: string) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    credentials: false,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`Application is running on: http://localhost:${port}`);
}

bootstrap().catch((err: unknown) => {
  logger.error(
    `Fatal error during bootstrap:\n${err instanceof Error ? err.stack : String(err)}`,
  );
  process.exit(1);
});
