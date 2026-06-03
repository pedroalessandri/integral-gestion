import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserSyncService } from './user-sync.service.js';

const mockUserUpsert = vi.fn();
const mockUserFindFirst = vi.fn();
const mockUserFindUniqueOrThrow = vi.fn();
const mockUserUpdate = vi.fn();

const mockPrismaRaw = {
  user: {
    upsert: mockUserUpsert,
    findFirst: mockUserFindFirst,
    findUniqueOrThrow: mockUserFindUniqueOrThrow,
    update: mockUserUpdate,
  },
};

const mockTx = { user: { update: mockUserUpdate } };

const mockPrismaService = {
  raw: mockPrismaRaw,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runInTransaction: vi.fn().mockImplementation((fn: (tx: any) => Promise<any>) => fn(mockTx)),
};
const mockAuditEmitter = { emit: vi.fn().mockResolvedValue(undefined) };
const mockConfigService = { get: vi.fn() };

const baseUser = {
  id: 'user-1',
  auth0Sub: 'auth0|test',
  email: 'test@example.com',
  displayName: 'Test User',
  isSuperadmin: false,
  lastSeenAt: new Date(),
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

describe('UserSyncService', () => {
  let service: UserSyncService;

  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockPrismaService.runInTransaction.mockImplementation((fn: (tx: any) => Promise<any>) => fn(mockTx));
    service = new UserSyncService(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockPrismaService as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockAuditEmitter as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockConfigService as any,
    );
  });

  describe('upsertFromJwt', () => {
    it('upserts user on every call', async () => {
      mockUserUpsert.mockResolvedValue(baseUser);
      mockUserFindFirst.mockResolvedValue({ id: 'other-superadmin' }); // superadmin exists
      mockUserFindUniqueOrThrow.mockResolvedValue(baseUser);
      mockConfigService.get.mockReturnValue(undefined); // no bootstrap email

      const result = await service.upsertFromJwt({
        auth0_sub: 'auth0|test',
        email: 'test@example.com',
        name: 'Test User',
      });

      expect(mockUserUpsert).toHaveBeenCalledOnce();
      expect(result.email).toBe('test@example.com');
    });

    it('does NOT bootstrap if no CORE_BOOTSTRAP_SUPERADMIN_EMAIL set', async () => {
      mockUserUpsert.mockResolvedValue(baseUser);
      mockUserFindUniqueOrThrow.mockResolvedValue(baseUser);
      mockConfigService.get.mockReturnValue(undefined);

      await service.upsertFromJwt({
        auth0_sub: 'auth0|test',
        email: 'test@example.com',
      });

      expect(mockUserUpdate).not.toHaveBeenCalled();
      expect(mockAuditEmitter.emit).not.toHaveBeenCalled();
    });

    it('does NOT bootstrap if email does not match bootstrap email', async () => {
      mockUserUpsert.mockResolvedValue(baseUser);
      mockUserFindUniqueOrThrow.mockResolvedValue(baseUser);
      mockConfigService.get.mockReturnValue('admin@example.com');

      await service.upsertFromJwt({
        auth0_sub: 'auth0|test',
        email: 'other@example.com',
      });

      expect(mockUserUpdate).not.toHaveBeenCalled();
    });

    it('bootstraps superadmin when email matches and no superadmin exists', async () => {
      mockUserUpsert.mockResolvedValue(baseUser);
      mockUserFindFirst.mockResolvedValue(null); // NO existing superadmin
      mockUserUpdate.mockResolvedValue({ ...baseUser, isSuperadmin: true });
      mockUserFindUniqueOrThrow.mockResolvedValue({ ...baseUser, isSuperadmin: true });
      mockConfigService.get.mockReturnValue('test@example.com');

      const result = await service.upsertFromJwt({
        auth0_sub: 'auth0|test',
        email: 'test@example.com',
      });

      expect(mockUserUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isSuperadmin: true } }),
      );
      expect(mockAuditEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'user.superadmin_granted' }),
      );
      expect(result.isSuperadmin).toBe(true);
    });

    it('does NOT re-bootstrap if a superadmin already exists', async () => {
      mockUserUpsert.mockResolvedValue(baseUser);
      mockUserFindFirst.mockResolvedValue({ id: 'existing-superadmin' }); // superadmin exists
      mockUserFindUniqueOrThrow.mockResolvedValue(baseUser);
      mockConfigService.get.mockReturnValue('test@example.com');

      await service.upsertFromJwt({
        auth0_sub: 'auth0|test',
        email: 'test@example.com',
      });

      expect(mockUserUpdate).not.toHaveBeenCalled();
      expect(mockAuditEmitter.emit).not.toHaveBeenCalled();
    });
  });
});
