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
  });

  describe('disableModule', () => {
    it('throws ConflictException if module is not enabled', async () => {
      mockPrismaRaw.module.findUnique.mockResolvedValue({ key: 'okr', name: 'OKR' });
      mockPrismaRaw.organizationModule.findUnique.mockResolvedValue(null);
      await expect(service.disableModule('org-1', 'okr', mockAuthContext)).rejects.toThrow(ConflictException);
    });
  });
});
