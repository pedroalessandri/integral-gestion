import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwksClient } from 'jwks-rsa';
import * as jwt from 'jsonwebtoken';

export interface VerifyTokenOptions {
  /** Audiencia (`aud`) que el token tiene que traer. Un token de otra audiencia se rechaza. */
  audience: string;
}

/**
 * Verificación de access tokens de Auth0 (RS256 contra el JWKS del issuer, `iss`, `aud`, `exp`).
 *
 * Extraída de `AuthGuard` sin cambio de comportamiento (ADR-0010 D1/D3) para que el conector MCP verifique
 * con la misma lógica pero con otra audiencia. El JWKS se cachea; la audiencia se pasa por llamada.
 *
 * Errores: siempre `UnauthorizedException` con el mismo código que usaba `AuthGuard`
 * (`JwtExpired`, `JwtSignatureInvalid`, `JwtMalformed`).
 */
@Injectable()
export class AccessTokenVerifier {
  private readonly jwksClient: JwksClient;
  private readonly issuer: string;

  constructor(config: ConfigService) {
    this.issuer = config.getOrThrow<string>('AUTH0_ISSUER_BASE_URL');
    this.jwksClient = new JwksClient({
      jwksUri: `${this.issuer.replace(/\/+$/, '')}/.well-known/jwks.json`,
      cache: true,
      cacheMaxAge: 10 * 60 * 1000,
      rateLimit: true,
    });
  }

  async verify(token: string, options: VerifyTokenOptions): Promise<jwt.JwtPayload> {
    try {
      return await this.verifyOrThrow(token, options.audience);
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedException('JwtExpired');
      }
      if (err instanceof jwt.JsonWebTokenError) {
        throw new UnauthorizedException('JwtSignatureInvalid');
      }
      throw new UnauthorizedException('JwtMalformed');
    }
  }

  private async verifyOrThrow(token: string, audience: string): Promise<jwt.JwtPayload> {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded === 'string') throw new jwt.JsonWebTokenError('invalid token');

    const key = await this.jwksClient.getSigningKey(decoded.header.kid);
    const publicKey = key.getPublicKey();

    return jwt.verify(token, publicKey, {
      issuer: `${this.issuer.replace(/\/+$/, '')}/`,
      audience,
      algorithms: ['RS256'],
    }) as jwt.JwtPayload;
  }
}
