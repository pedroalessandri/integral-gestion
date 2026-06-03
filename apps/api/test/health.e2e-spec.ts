import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

/**
 * Health endpoint e2e tests.
 *
 * Requires DATABASE_URL to be set and reachable.
 * The readiness probe test is wrapped in describe.skipIf so the suite can
 * run in CI without a DB (liveness still passes).
 */

let app: INestApplication;
let httpServer: ReturnType<INestApplication['getHttpServer']>;

beforeAll(async () => {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  await app.init();
  httpServer = app.getHttpServer();
});

afterAll(async () => {
  await app?.close();
});

describe('GET /api/v1/health', () => {
  it('returns 200 with correct body shape', async () => {
    const res = await request(httpServer).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ok',
    });
    expect(typeof res.body.timestamp).toBe('string');
    // Should also echo back request id header
    expect(res.headers).toHaveProperty('x-request-id');
  });
});

describe.skipIf(!process.env['DATABASE_URL'])(
  'GET /api/v1/health/ready',
  () => {
    it('returns 200 with db connected when DB is reachable', async () => {
      const res = await request(httpServer).get('/api/v1/health/ready');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        status: 'ok',
        db: 'connected',
      });
      expect(typeof res.body.timestamp).toBe('string');
    });
  },
);

describe('Unknown route', () => {
  it('returns 404 for an unknown path', async () => {
    const res = await request(httpServer).get('/api/v1/nonexistent-route-xyz');
    expect(res.status).toBe(404);
  });
});

describe('ErrorResponseDto shape', () => {
  it('error response for unknown route has ErrorResponseDto shape', async () => {
    const res = await request(httpServer).get('/api/v1/nonexistent-route-xyz');

    // NestJS default 404 for unknown routes comes through the global exception filter
    expect(res.body).toHaveProperty('statusCode');
    expect(res.body).toHaveProperty('message');
    expect(res.body).toHaveProperty('error');
    expect(typeof res.body.statusCode).toBe('number');
    expect(typeof res.body.message).toBe('string');
    expect(typeof res.body.error).toBe('string');
  });
});
