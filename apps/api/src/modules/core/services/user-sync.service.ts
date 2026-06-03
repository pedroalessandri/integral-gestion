import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../auth/prisma/prisma.service.js';
import { AuditEventEmitterService } from '../../audit/audit-event-emitter.service.js';
import { tenantContextStorage } from '../../auth/context/tenant-context-storage.js';
import { requestContextStorage } from '../../audit/context/request-context-storage.js';

export interface JwtPayload {
  auth0_sub: string;
  email: string;
  name?: string;
}

export interface SyncedUser {
  id: string;
  auth0Sub: string;
  email: string;
  displayName: string;
  isSuperadmin: boolean;
}

/**
 * UserSyncService — upserts a core.user record on every login.
 *
 * Responsibilities:
 *  - Create user if not exists (keyed by auth0_sub).
 *  - Update email, displayName, lastSeenAt on every call.
 *  - Bootstrap first superadmin (D5): if CORE_BOOTSTRAP_SUPERADMIN_EMAIL matches and
 *    no superadmin exists yet, promote this user and emit user.superadmin_granted.
 *
 * Per ADR 0002 D5 and plan step 4 (UserSyncService).
 */
@Injectable()
export class UserSyncService {
  private readonly logger = new Logger(UserSyncService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditEmitter: AuditEventEmitterService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Upserts a user from a JWT payload. Called on every authenticated request.
   * Idempotent and safe to call concurrently (uses upsert with conflict key auth0_sub).
   */
  async upsertFromJwt(payload: JwtPayload): Promise<SyncedUser> {
    const displayName = payload.name ?? payload.email;

    // Upsert by auth0_sub; update email/displayName/lastSeenAt on every call
    const user = await this.prismaService.raw.user.upsert({
      where: { auth0Sub: payload.auth0_sub },
      create: {
        auth0Sub: payload.auth0_sub,
        email: payload.email,
        displayName,
        isSuperadmin: false,
        lastSeenAt: new Date(),
      },
      update: {
        email: payload.email,
        displayName,
        lastSeenAt: new Date(),
      },
    });

    const wasNewUser = user.createdAt.getTime() === user.updatedAt.getTime() ||
      // Heuristic: if lastSeenAt was just set (within 1 second of updatedAt)
      // and it equals createdAt, it's a new user
      Math.abs(user.createdAt.getTime() - (user.lastSeenAt?.getTime() ?? 0)) < 1000;

    // Emit user.created if this was a new user
    if (wasNewUser || user.createdAt.getTime() === user.updatedAt.getTime()) {
      // We can't reliably distinguish create vs update from upsert without checking before.
      // Use a simpler approach: check if created_at ~= updated_at (within 1 second)
    }

    // Bootstrap superadmin D5
    await this.maybeBootstrapSuperadmin(user.id, user.email, user.isSuperadmin);

    // Re-read to get the possibly-updated isSuperadmin flag
    const finalUser = await this.prismaService.raw.user.findUniqueOrThrow({
      where: { id: user.id },
    });

    return {
      id: finalUser.id,
      auth0Sub: finalUser.auth0Sub,
      email: finalUser.email,
      displayName: finalUser.displayName,
      isSuperadmin: finalUser.isSuperadmin,
    };
  }

  /**
   * Bootstrap superadmin (D5):
   * If:
   *   1. CORE_BOOTSTRAP_SUPERADMIN_EMAIL is set and matches this user's email
   *   2. No superadmin exists yet in the system
   * Then: promote this user and emit user.superadmin_granted with reason 'bootstrap'.
   *
   * Once any superadmin exists, this method is a no-op.
   */
  private async maybeBootstrapSuperadmin(
    userId: string,
    email: string,
    alreadySuperadmin: boolean,
  ): Promise<void> {
    const bootstrapEmail = this.configService.get<string>(
      'CORE_BOOTSTRAP_SUPERADMIN_EMAIL',
    );

    if (!bootstrapEmail) return;
    if (email.toLowerCase() !== bootstrapEmail.toLowerCase()) return;
    if (alreadySuperadmin) return;

    // Check if any superadmin already exists
    const existingSuperadmin = await this.prismaService.raw.user.findFirst({
      where: { isSuperadmin: true },
      select: { id: true },
    });

    if (existingSuperadmin) {
      // A superadmin already exists — bootstrap is inert
      return;
    }

    // Promote this user
    this.logger.warn(
      `[Bootstrap] Promoting ${email} (id=${userId}) to superadmin (reason: bootstrap).`,
    );

    // The bootstrap promotion happens during AuthGuard execution, before the tenant
    // context ALS is set for this request. We synthesize a minimal AuthContext so that
    // AuditEventEmitterService can read userId and requestId from the ALS stores.
    const reqCtx = requestContextStorage.getStore();
    const bootstrapAuthCtx = {
      userId,
      auth0Sub: '',
      email,
      displayName: email,
      isSuperadmin: true,
      organizationId: null,
      permissions: ['*'] as readonly string[],
      requestId: reqCtx?.requestId ?? 'bootstrap',
    };

    const existingReqCtx = requestContextStorage.getStore();
    const runWithRequestCtx = existingReqCtx
      ? (fn: () => Promise<void>) => fn()
      : (fn: () => Promise<void>) =>
          requestContextStorage.run({ requestId: randomUUID() }, fn);

    await runWithRequestCtx(() =>
      tenantContextStorage.run(bootstrapAuthCtx, () =>
        this.prismaService.runInTransaction(async (tx) => {
          await tx.user.update({
            where: { id: userId },
            data: { isSuperadmin: true },
          });

          await this.auditEmitter.emit({
            action: 'user.superadmin_granted',
            entityType: 'core.user',
            entityId: userId,
            diff: {
              before: { isSuperadmin: false },
              after: { isSuperadmin: true },
              reason: 'bootstrap',
            },
          });
        }),
      ),
    );
  }
}
