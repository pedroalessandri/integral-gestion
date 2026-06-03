import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { VersioningType, Logger } from '@nestjs/common';
import { AppModule } from './app.module.js';

const AUTH0_PLACEHOLDER_ISSUER = 'https://placeholder.auth0.com';
const AUTH0_PLACEHOLDER_AUDIENCE = 'https://api.gestion-publica.placeholder';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  app.enableCors({
    origin: (origin, cb) => {
      const allowed = (process.env['CORS_ALLOWED_ORIGINS'] ?? 'http://localhost:3001')
        .split(',')
        .map((s) => s.trim());
      if (!origin || allowed.includes(origin)) return cb(null, true);
      return cb(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Organization-Id', 'X-Request-Id'],
  });

  // Global API prefix + URI versioning: /api/v1/...
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  const port = process.env['PORT'] ?? 3000;
  const nodeEnv = process.env['NODE_ENV'] ?? 'development';

  await app.listen(port);

  logger.log(`Application started on port ${port} [${nodeEnv}]`);
  logger.log(`Global prefix: /api  |  Versioning: URI (default v1)`);

  // Warn if dev auth stub is active (registered only in non-production)
  if (nodeEnv !== 'production') {
    logger.warn(
      '[DevAuth] Dev auth stub middleware is ACTIVE. ' +
        'Requests can authenticate via X-Dev-User-Id / X-Dev-Org-Id / X-Dev-Is-Superadmin headers. ' +
        'This is a SECURITY RISK — ensure NODE_ENV=production in all production deployments.',
    );
  }

  // Warn if Auth0 is still using placeholder values — auth guards will not work.
  if (process.env['AUTH0_ISSUER_BASE_URL'] === AUTH0_PLACEHOLDER_ISSUER) {
    logger.warn(
      'AUTH0_ISSUER_BASE_URL is still the placeholder. Auth guards will reject all requests. ' +
        'Set a real Auth0 tenant URL before enabling auth.',
    );
  }
  if (process.env['AUTH0_AUDIENCE'] === AUTH0_PLACEHOLDER_AUDIENCE) {
    logger.warn(
      'AUTH0_AUDIENCE is still the placeholder. Auth guards will reject all requests. ' +
        'Set a real audience value before enabling auth.',
    );
  }

  // Warn if bootstrap superadmin email is not set
  if (!process.env['CORE_BOOTSTRAP_SUPERADMIN_EMAIL']) {
    logger.warn(
      'CORE_BOOTSTRAP_SUPERADMIN_EMAIL is not set. ' +
        'The first superadmin bootstrap will not trigger on first login. ' +
        'Production deployments MUST set this.',
    );
  }
}

void bootstrap();
