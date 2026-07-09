import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, ConflictException } from '@nestjs/common';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { ModuleEnablementService } from './module-enablement.service.js';

const mockPrismaRaw = {
  module: { findUnique: vi.fn() },
  organizationModule: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
  },
};

const mockTx = {
  organizationModule: {
    upsert: vi.fn(),
    update: vi.fn(),
  },
};

const mockPrismaService = {
  raw: mockPrismaRaw,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runInTransaction: vi.fn().mockImplementation((fn: (tx: any) => Promise<any>) => fn(mockTx)),
};
const mockAuditEmitter = { emit: vi.fn().mockResolvedValue(undefined) };

const enabledRow = {
  organizationId: 'org-1',
  moduleKey: 'okr',
  enabledAt: new Date('2026-04-01T00:00:00Z'),
  enabledByUserId: 'user-1',
  disabledAt: null,
  disabledByUserId: null,
};

const mockAuthContext: AuthContext = {
  userId: 'user-1',
  auth0Sub: 'auth0|test',
  email: 'test@example.com',
  displayName: 'Test User',
  isSuperadmin: false,
  organizationId: null,
  permissions: [],
  requestId: 'req-test',
};

describe('ModuleEnablementService', () => {
  let service: ModuleEnablementService;

  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockPrismaService.runInTransaction.mockImplementation((fn: (tx: any) => Promise<any>) => fn(mockTx));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new ModuleEnablementService(mockPrismaService as any, mockAuditEmitter as any);
  });

  describe('isEnabled', () => {
    it('returns true when module is enabled (disabledAt IS NULL)', async () => {
      mockPrismaRaw.organizationModule.findFirst.mockResolvedValue(enabledRow);
      expect(await service.isEnabled('org-1', 'okr')).toBe(true);
    });

    it('returns false when no active row exists', async () => {
      mockPrismaRaw.organizationModule.findFirst.mockResolvedValue(null);
      expect(await service.isEnabled('org-1', 'okr')).toBe(false);
    });
  });

  describe('enableModule', () => {
    it('throws NotFoundException if module key not in registry', async () => {
      mockPrismaRaw.module.findUnique.mockResolvedValue(null);
      await expect(service.enableModule('org-1', 'unknown-module', mockAuthContext)).rejects.toThrow(NotFoundException);
    });

    it('upserts and emits audit event on enable', async () => {
      mockPrismaRaw.module.findUnique.mockResolvedValue({ key: 'okr', name: 'OKR' });
      mockTx.organizationModule.upsert.mockResolvedValue(enabledRow);

      const result = await service.enableModule('org-1', 'okr', mockAuthContext);
      expect(result.disabledAt).toBeNull();
      expect(mockAuditEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'organization_module.enabled' }),
      );
    });

    it('throws ConflictException when enabling indicadores-okr without indicadores-gestion', async () => {
      mockPrismaRaw.module.findUnique.mockResolvedValue({ key: 'indicadores-okr', name: 'Indicadores en OKRs' });
      // isEnabled('org-1', 'indicadores-gestion') → no active row
      mockPrismaRaw.organizationModule.findFirst.mockResolvedValue(null);

      await expect(
        service.enableModule('org-1', 'indicadores-okr', mockAuthContext),
      ).rejects.toThrow(ConflictException);
      expect(mockTx.organizationModule.upsert).not.toHaveBeenCalled();
    });

    it('enables indicadores-okr when indicadores-gestion is enabled', async () => {
      mockPrismaRaw.module.findUnique.mockResolvedValue({ key: 'indicadores-okr', name: 'Indicadores en OKRs' });
      mockPrismaRaw.organizationModule.findFirst.mockResolvedValue({
        ...enabledRow,
        moduleKey: 'indicadores-gestion',
      });
      const okrRow = { ...enabledRow, moduleKey: 'indicadores-okr' };
      mockTx.organizationModule.upsert.mockResolvedValue(okrRow);

      const result = await service.enableModule('org-1', 'indicadores-okr', mockAuthContext);
      expect(result.moduleKey).toBe('indicadores-okr');
    });
  });

  describe('disableModule', () => {
    it('throws ConflictException if module is not enabled', async () => {
      mockPrismaRaw.module.findUnique.mockResolvedValue({ key: 'okr', name: 'OKR' });
      mockPrismaRaw.organizationModule.findUnique.mockResolvedValue(null);
      await expect(service.disableModule('org-1', 'okr', mockAuthContext)).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when disabling indicadores-gestion while indicadores-okr is enabled', async () => {
      mockPrismaRaw.module.findUnique.mockResolvedValue({ key: 'indicadores-gestion', name: 'Indicadores de gestión' });
      mockPrismaRaw.organizationModule.findUnique.mockResolvedValue({
        ...enabledRow,
        moduleKey: 'indicadores-gestion',
      });
      // isEnabled('org-1', 'indicadores-okr') → active row exists
      mockPrismaRaw.organizationModule.findFirst.mockResolvedValue({
        ...enabledRow,
        moduleKey: 'indicadores-okr',
      });

      await expect(
        service.disableModule('org-1', 'indicadores-gestion', mockAuthContext),
      ).rejects.toThrow(ConflictException);
      expect(mockTx.organizationModule.update).not.toHaveBeenCalled();
    });

    it('disables indicadores-gestion when indicadores-okr is not enabled', async () => {
      mockPrismaRaw.module.findUnique.mockResolvedValue({ key: 'indicadores-gestion', name: 'Indicadores de gestión' });
      const gestionRow = { ...enabledRow, moduleKey: 'indicadores-gestion' };
      mockPrismaRaw.organizationModule.findUnique.mockResolvedValue(gestionRow);
      mockPrismaRaw.organizationModule.findFirst.mockResolvedValue(null);
      mockTx.organizationModule.update.mockResolvedValue({
        ...gestionRow,
        disabledAt: new Date('2026-07-09T00:00:00Z'),
        disabledByUserId: 'user-1',
      });

      const result = await service.disableModule('org-1', 'indicadores-gestion', mockAuthContext);
      expect(result.disabledAt).not.toBeNull();
      expect(mockAuditEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'organization_module.disabled' }),
      );
    });
  });
});
