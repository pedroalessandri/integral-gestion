import {
  Controller,
  Get,
  Injectable,
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CustomThrottlerGuard } from './throttler.guard';

/** Simula al AuthGuard: escribe request.authContext a partir de un header de prueba. */
@Injectable()
class FakeAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Record<string, unknown> & { headers: Record<string, string> }>();
    const user = req.headers['x-test-user'];
    if (user) req['authContext'] = { userId: user, auth0Sub: `auth0|${user}` };
    return true;
  }
}

@Controller()
class ProbeController {
  @Get('probe')
  probe() {
    return 'ok';
  }
}

describe('CustomThrottlerGuard (tracker por usuario)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 3 }])],
      controllers: [ProbeController],
      providers: [
        { provide: APP_GUARD, useClass: FakeAuthGuard },
        { provide: APP_GUARD, useClass: CustomThrottlerGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const hit = (user?: string) => {
    const r = request(app.getHttpServer()).get('/probe');
    return user ? r.set('x-test-user', user) : r;
  };

  it('dos usuarios distintos desde la misma IP no comparten cuota', async () => {
    for (let i = 0; i < 3; i++) await hit('alice').expect(200);
    expect((await hit('alice')).status).toBe(429);
    // bob llega desde la misma IP (loopback) y conserva su cuota completa
    for (let i = 0; i < 3; i++) await hit('bob').expect(200);
    expect((await hit('bob')).status).toBe(429);
  });

  it('el mismo usuario comparte cuota entre requests', async () => {
    for (let i = 0; i < 3; i++) await hit('carol').expect(200);
    expect((await hit('carol')).status).toBe(429);
  });

  it('sin identidad (ruta pública) cae a la IP', async () => {
    for (let i = 0; i < 3; i++) await hit().expect(200);
    expect((await hit()).status).toBe(429);
  });
});
