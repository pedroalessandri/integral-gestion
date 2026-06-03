import { applyDecorators, UseGuards } from '@nestjs/common';
import { SuperadminOnlyGuard } from '../guards/superadmin-only.guard.js';

export const SuperadminOnly = () => applyDecorators(UseGuards(SuperadminOnlyGuard));
