import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { tenantContextStorage } from '../context/tenant-context-storage.js';

@Injectable()
export class SuperadminOnlyGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    const authCtx = tenantContextStorage.getStore();
    if (!authCtx?.isSuperadmin) throw new ForbiddenException('SuperadminRequired');
    return true;
  }
}
