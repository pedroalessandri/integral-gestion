import { Controller, Get, type INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Throttle, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { THROTTLERS } from './throttler.config';

@Controller()
class ProbeController {
  @Get('plain')
  plain() {
    return 'ok';
  }

  @Get('ai-like')
  @Throttle({ ai: { limit: 10, ttl: 60_000 } })
  aiLike() {
    return 'ok';
  }
}

describe('THROTTLERS', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot(THROTTLERS)],
      controllers: [ProbeController],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('el throttler `ai` no limita las rutas comunes a 10 req/min', async () => {
    for (let i = 0; i < 15; i++) {
      await request(app.getHttpServer()).get('/plain').expect(200);
    }
  });

  it('las rutas con @Throttle({ ai }) siguen limitadas a 10 req/min', async () => {
    for (let i = 0; i < 10; i++) {
      await request(app.getHttpServer()).get('/ai-like').expect(200);
    }
    const res = await request(app.getHttpServer()).get('/ai-like');
    expect(res.status).toBe(429);
  });
});
