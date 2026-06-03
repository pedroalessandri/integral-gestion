import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { OrganizationContextService, MissingTenantContextError } from './organization-context.service.js';
import { tenantContextStorage } from '../../auth/context/tenant-context-storage.js';

// Mock PrismaService
const mockPrismaRaw = {
  organization: {
    findUnique: vi.fn(),
  },
};

const mockPrismaService = {
  raw: mockPrismaRaw,
};

describe('OrganizationContextService', () => {
  let service: OrganizationContextService;

  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new OrganizationContextService(mockPrismaService as any);
  });

  describe('getCurrent', () => {
    it('throws MissingTenantContextError when no org in ALS', async () => {
      // Run outside any ALS context
      await expect(service.getCurrent()).rejects.toThrow(MissingTenantContextError);
    });

    it('returns OrganizationDetailDto when org exists in DB', async () => {
      const mockOrg = {
        id: 'org-1',
        slug: 'test-org',
        name: 'Test Org',
        status: 'active',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        deactivatedAt: null,
        deactivatedByUserId: null,
      };
      mockPrismaRaw.organization.findUnique.mockResolvedValue(mockOrg);

      // Run within ALS context with an org
      const result = await tenantContextStorage.run(
        {
          userId: 'user-1',
          auth0Sub: 'auth0|1',
          email: 'test@example.com',
          displayName: 'Test',
          isSuperadmin: false,
          organizationId: 'org-1',
          permissions: [],
          requestId: 'req-1',
        },
        () => service.getCurrent(),
      );

      expect(result.id).toBe('org-1');
      expect(result.status).toBe('active');
    });

    it('throws NotFoundException when org is in context but not in DB', async () => {
      mockPrismaRaw.organization.findUnique.mockResolvedValue(null);

      await expect(
        tenantContextStorage.run(
          {
            userId: 'user-1',
            auth0Sub: 'auth0|1',
            email: 'test@example.com',
            displayName: 'Test',
            isSuperadmin: false,
            organizationId: 'org-missing',
            permissions: [],
            requestId: 'req-1',
          },
          () => service.getCurrent(),
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
