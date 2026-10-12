import { Injectable } from '@nestjs/common';
import { McpConfig } from '../config/mcp-config.service.js';

export type RateKind = 'read' | 'write';

export type RateDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

interface Window {
  /** Duración de la ventana en ms. */
  ms: number;
  /** Cupo de la ventana. */
  limit: number;
  /** Sufijo de la clave: separa los contadores de la misma persona. */
  name: string;
}

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/**
 * Límite de uso por persona del conector (ADR-0010 D8). El throttler global limita por request HTTP y no
 * distingue lecturas de escrituras; acá se cuenta por llamada a herramienta, con la clave `mcp:<userId>:<kind>`.
 *
 * Ventana deslizante en memoria (una sola réplica; con más réplicas hace falta un store compartido). Un usuario
 * nunca consume el cupo de otro, aunque compartan IP: la clave es el id del usuario.
 */
@Injectable()
export class McpRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly config: McpConfig) {}

  /** Verifica y, si pasa, registra la llamada. Si no pasa, no consume cupo. */
  check(userId: string, kind: RateKind, nowMs: number = Date.now()): RateDecision {
    const windows: Window[] =
      kind === 'read'
        ? [{ name: 'min', ms: MINUTE_MS, limit: this.config.rateReadPerMin }]
        : [
            { name: 'min', ms: MINUTE_MS, limit: this.config.rateWritePerMin },
            { name: 'day', ms: DAY_MS, limit: this.config.rateWritePerDay },
          ];

    let retryAfterMs = 0;
    for (const w of windows) {
      const key = `mcp:${userId}:${kind}:${w.name}`;
      const recent = this.prune(key, nowMs - w.ms);
      if (recent.length >= w.limit) {
        const oldest = recent[0] ?? nowMs;
        retryAfterMs = Math.max(retryAfterMs, oldest + w.ms - nowMs);
      }
    }
    if (retryAfterMs > 0) return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };

    for (const w of windows) {
      this.hits.get(`mcp:${userId}:${kind}:${w.name}`)?.push(nowMs);
    }
    this.sweepIfLarge(nowMs);
    return { allowed: true };
  }

  /** Devuelve las marcas vigentes de la clave (creándola si no existe), descartando las vencidas. */
  private prune(key: string, since: number): number[] {
    const current = this.hits.get(key) ?? [];
    const kept = current.filter((t) => t > since);
    this.hits.set(key, kept);
    return kept;
  }

  /** Evita que el mapa crezca sin límite con usuarios que no vuelven. */
  private sweepIfLarge(nowMs: number): void {
    if (this.hits.size < 5_000) return;
    for (const [key, stamps] of this.hits) {
      const last = stamps[stamps.length - 1];
      if (last === undefined || last < nowMs - DAY_MS) this.hits.delete(key);
    }
  }
}
