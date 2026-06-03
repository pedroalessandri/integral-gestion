import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwksClient } from 'jwks-rsa';
import * as jwt from 'jsonwebtoken';
import { UserSyncService } from '../../core/services/user-sync.service.js';
import { tenantContextStorage } from '../context/tenant-context-storage.js';
import { requestContextStorage } from '../../audit/context/request-context-storage.js';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly jwksClient: JwksClient;
  private readonly issuer: string;
  private readonly audience: string;

  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
    private readonly userSyncService: UserSyncService,
  ) {
    this.issuer = this.config.getOrThrow<string>('AUTH0_ISSUER_BASE_URL');
    this.audience = this.config.getOrThrow<string>('AUTH0_AUDIENCE');
    this.jwksClient = new JwksClient({
      jwksUri: `${this.issuer.replace(/\/+$/, '')}/.well-known/jwks.json`,
      cache: true,
      cacheMaxAge: 10 * 60 * 1000,
      rateLimit: true,
    });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string>;
    } & Record<string, unknown>>();

    const token = this.extractToken(request);
    const existingCtx = tenantContextStorage.getStore();

    // No Bearer, but dev stub context exists → trust the dev stub.
    if (!token && existingCtx?.userId) {
      return true;
    }

    // No Bearer and no context → unauthenticated.
    if (!token) throw new UnauthorizedException('JwtMissing');

    // Bearer present → always run full JWT validation (even if dev stub context exists).
    // The real Auth0 flow takes precedence.

    let payload: jwt.JwtPayload;
    try {
      payload = await this.verifyToken(token);
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedException('JwtExpired');
      }
      if (err instanceof jwt.JsonWebTokenError) {
        throw new UnauthorizedException('JwtSignatureInvalid');
      }
      throw new UnauthorizedException('JwtMalformed');
    }

    const sub = payload['sub'] as string;
    const email = payload['email'] as string;
    const name = (payload['name'] as string | undefined) ?? email;

    const coreUser = await this.userSyncService.upsertFromJwt({
      auth0_sub: sub,
      email,
      name,
    });

    const reqCtx = requestContextStorage.getStore();

    const authContext: AuthContext = {
      userId: coreUser.id,
      auth0Sub: sub,
      email: coreUser.email,
      displayName: coreUser.displayName,
      isSuperadmin: coreUser.isSuperadmin,
      organizationId: null,
      permissions: coreUser.isSuperadmin ? ['*'] : [],
      requestId: reqCtx?.requestId ?? 'unknown',
    };

    // Use enterWith so downstream handlers run in this ALS context
    tenantContextStorage.enterWith(authContext);
    (request as Record<string, unknown>)['authContext'] = authContext;
    return true;
  }

  private extractToken(request: {
    headers: Record<string, string>;
  }): string | null {
    const auth = request.headers['authorization'];
    if (!auth?.startsWith('Bearer ')) return null;
    return auth.slice(7);
  }

  private async verifyToken(token: string): Promise<jwt.JwtPayload> {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded === 'string')
      throw new jwt.JsonWebTokenError('invalid token');

    const kid = decoded.header.kid;
    const key = await this.jwksClient.getSigningKey(kid);
    const publicKey = key.getPublicKey();

    return jwt.verify(token, publicKey, {
      issuer: `${this.issuer.replace(/\/+$/, '')}/`,
      audience: this.audience,
      algorithms: ['RS256'],
    }) as jwt.JwtPayload;
  }
}
