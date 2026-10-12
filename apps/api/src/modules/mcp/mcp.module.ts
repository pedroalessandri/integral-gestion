import { Module } from '@nestjs/common';
import { CoreModule } from '../core/index.js';
import { OkrModule } from '../okr/index.js';
import { MetricsModule } from '../metrics/index.js';
import { PlanningModule } from '../planning/index.js';
import { McpConfig } from './config/mcp-config.service.js';
import { McpController } from './controllers/mcp.controller.js';
import { ProtectedResourceMetadataController } from './controllers/protected-resource-metadata.controller.js';
import { McpAuthGuard } from './guards/mcp-auth.guard.js';
import { McpEnabledGuard } from './guards/mcp-enabled.guard.js';
import { McpOriginGuard } from './guards/mcp-origin.guard.js';
import { McpRateLimiter } from './dispatch/mcp-rate-limiter.service.js';
import { ToolDispatcher } from './dispatch/tool-dispatcher.service.js';
import { ToolCallRepository } from './repositories/tool-call.repository.js';
import { McpHttpHandler } from './server/mcp-http-handler.service.js';
import { McpServerFactory } from './server/mcp-server.factory.js';
import { McpToolRegistry } from './tools/tool-registry.js';

/**
 * McpModule — conector MCP de solo lectura (ADR-0010). Es un borde, como un controller: consume otros módulos
 * solo por su superficie pública (`index.ts`) y nadie lo importa. La lógica de negocio queda en los services de
 * `okr`, `metrics`, `core` y `planning`; acá solo hay autenticación OAuth, resolución de la organización, permiso
 * por herramienta, límite por usuario, presentación para el modelo y el log operativo `mcp.tool_call`.
 * `AuthModule` es global (PrismaService, AccessTokenVerifier, TenantMembershipResolver).
 */
@Module({
  imports: [CoreModule, OkrModule, MetricsModule, PlanningModule],
  controllers: [McpController, ProtectedResourceMetadataController],
  providers: [
    McpConfig,
    McpToolRegistry,
    McpRateLimiter,
    ToolCallRepository,
    ToolDispatcher,
    McpServerFactory,
    McpHttpHandler,
    McpEnabledGuard,
    McpOriginGuard,
    McpAuthGuard,
  ],
})
export class McpModule {}
