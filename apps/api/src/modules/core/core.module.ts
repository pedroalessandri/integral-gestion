import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuditModule } from '../audit/index.js';
import { OrganizationService } from './services/organization.service.js';
import { PeriodService } from './services/period.service.js';
import { PeriodAutoCloseCron } from './services/period-auto-close.cron.js';
import { ModuleEnablementService } from './services/module-enablement.service.js';
import { MeService } from './services/me.service.js';
import { UserSyncService } from './services/user-sync.service.js';
import { MemberService } from './services/member.service.js';
import { OrganizationContextService } from './services/organization-context.service.js';
import { OrganizationController } from './controllers/organization.controller.js';
import { PeriodController } from './controllers/period.controller.js';
import { MemberController } from './controllers/member.controller.js';
import { OrganizationModuleController } from './controllers/organization-module.controller.js';
import { MeController } from './controllers/me.controller.js';
import { ModuleController } from './controllers/module.controller.js';

/**
 * CoreModule — the foundational module of gestion-publica.
 *
 * Provides:
 *  - OrganizationService (D8-c atomic create)
 *  - PeriodService (D3-A partial unique, lifecycle transitions; non-editable after creation)
 *  - PeriodAutoCloseCron (hourly auto-close of expired open periods)
 *  - ModuleEnablementService (opt-in module enablement)
 *  - MeService (cross-org user profile)
 *  - UserSyncService (JWT upsert + D5 bootstrap superadmin)
 *  - MemberService (UserOrganizationRole CRUD)
 *  - OrganizationContextService (ALS-based tenant context reader)
 *
 * Exports the services consumed by other modules (e.g., OKR via PeriodService).
 *
 * Per ADR 0002.
 */
@Module({
  imports: [AuditModule, ScheduleModule.forRoot()],
  providers: [
    OrganizationService,
    PeriodService,
    PeriodAutoCloseCron,
    ModuleEnablementService,
    MeService,
    UserSyncService,
    MemberService,
    OrganizationContextService,
  ],
  controllers: [
    OrganizationController,
    PeriodController,
    MemberController,
    OrganizationModuleController,
    MeController,
    ModuleController,
  ],
  exports: [
    OrganizationContextService,
    PeriodService,
    MemberService,
    ModuleEnablementService,
    UserSyncService,
  ],
})
export class CoreModule {}
