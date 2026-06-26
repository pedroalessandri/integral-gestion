import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
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
   * Resolves the local user from a JWT payload. Called on every authenticated request.
   * Idempotent and safe to call concurrently (P2002 races fall back to a refresh).
   */
  async upsertFromJwt(payload: JwtPayload): Promise<SyncedUser> {
    const displayName = payload.name ?? payload.email;

    const user = await this.resolveOrProvisionUser(payload, displayName);

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
   * Resolves the local core.user for a JWT, provisioning or reconciling as needed:
   *  1. Match by auth0_sub → returning user; refresh email/displayName/lastSeenAt.
   *  2. Else match by email → a placeholder created by MemberService.inviteByEmail
   *     (auth0Sub = "pending:<email>"). Claim it by binding the real auth0_sub.
   *  3. Else → brand-new user; create.
   *
   * Step 2 is what bridges an admin-invited member to their first Auth0 login.
   * Without it, the create in step 3 collides with the placeholder's unique email
   * (P2002 → 409) on every request, breaking the user entirely.
   */
  private async resolveOrProvisionUser(
    payload: JwtPayload,
    displayName: string,
  ): Promise<{ id: string; email: string; isSuperadmin: boolean }> {
    const now = new Date();

    // 1. Returning user, keyed by the real Auth0 sub.
    const bySub = await this.prismaService.raw.user.findUnique({
      where: { auth0Sub: payload.auth0_sub },
    });
    if (bySub) {
      return this.prismaService.raw.user.update({
        where: { id: bySub.id },
        data: { email: payload.email, displayName, lastSeenAt: now },
      });
    }

    // 2. Invited-but-never-logged-in user: claim the placeholder by email,
    //    binding the real auth0_sub (the placeholder had "pending:<email>").
    const byEmail = await this.prismaService.raw.user.findUnique({
      where: { email: payload.email },
    });
    if (byEmail) {
      return this.prismaService.raw.user.update({
        where: { id: byEmail.id },
        data: { auth0Sub: payload.auth0_sub, displayName, lastSeenAt: now },
      });
    }

    // 3. Genuinely new user.
    try {
      return await this.prismaService.raw.user.create({
        data: {
          auth0Sub: payload.auth0_sub,
          email: payload.email,
          displayName,
          isSuperadmin: false,
          lastSeenAt: now,
        },
      });
    } catch (err) {
      // Race: a concurrent request provisioned this user between our reads and the
      // create. Re-resolve and refresh instead of surfacing the P2002 as a 409.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const existing = await this.prismaService.raw.user.findFirst({
          where: {
            OR: [{ auth0Sub: payload.auth0_sub }, { email: payload.email }],
          },
        });
        if (existing) {
          return this.prismaService.raw.user.update({
            where: { id: existing.id },
            data: { auth0Sub: payload.auth0_sub, email: payload.email, displayName, lastSeenAt: now },
          });
        }
      }
      throw err;
    }
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
