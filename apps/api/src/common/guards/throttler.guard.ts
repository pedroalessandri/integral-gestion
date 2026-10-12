import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * ThrottlerGuard con tracker por usuario autenticado.
 *
 * Debe registrarse como APP_GUARD DESPUÉS de `AuthGuard` (los guards globales corren en orden de
 * registro): `AuthGuard` verifica el JWT y escribe `request.authContext`; acá solo se lee esa identidad ya
 * verificada, nunca se decodifica el token. En desarrollo, `DevAuthMiddleware` también escribe
 * `request.authContext`.
 *
 * Rutas públicas (el `AuthGuard` retorna antes de poblar `authContext`) y requests sin identidad caen a la IP.
 * Con `trust proxy` configurado en `main.ts`, `req.ip` es la del cliente detrás del proxy de Railway.
 */

/** Forma mínima del request de Express que necesita este guard. */
interface RequestWithAuthContext {
  authContext?: { userId?: string; auth0Sub?: string };
  ip?: string;
}

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: RequestWithAuthContext): Promise<string> {
    const identity = req.authContext?.userId ?? req.authContext?.auth0Sub;
    if (identity) return `user:${identity}`;
    return `ip:${req.ip ?? 'unknown'}`;
  }
}
