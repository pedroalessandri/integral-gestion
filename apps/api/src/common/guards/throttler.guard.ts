import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Custom ThrottlerGuard that uses auth0Sub as the rate-limit key when the user
 * is authenticated, falling back to IP address for unauthenticated requests.
 *
 * This prevents a single malicious IP from exhausting the quota of an authenticated user,
 * and avoids throttling all users behind a shared NAT/proxy together.
 */

/** Minimal typed shape for the Express request as seen by this guard. */
interface RequestWithUser {
  user?: { auth0Sub?: string };
  ip?: string;
}

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: RequestWithUser): Promise<string> {
    // req.user is populated by AuthGuard before throttle evaluation.
    return req.user?.auth0Sub ?? req.ip ?? 'unknown';
  }
}
