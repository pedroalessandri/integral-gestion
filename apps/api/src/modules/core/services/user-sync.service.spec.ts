import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserSyncService } from './user-sync.service.js';

const mockUserFindUnique = vi.fn();
const mockUserFindFirst = vi.fn();
const mockUserCreate = vi.fn();
const mockUserUpdate = vi.fn();
const mockUserFindUniqueOrThrow = vi.fn();

const mockPrismaRaw = {
  user: {
    findUnique: mockUserFindUnique,
    findFirst: mockUserFindFirst,
    create: mockUserCreate,
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

/**
 * Configures findUnique to resolve by-sub / by-email lookups independently.
 * Pass the row each key should return (or null for a miss).
 */
function stubFindUnique(opts: { bySub?: unknown; byEmail?: unknown } = {}) {
  mockUserFindUnique.mockImplementation(({ where }: { where: Record<string, unknown> }) => {
    if (where.auth0Sub !== undefined) return Promise.resolve(opts.bySub ?? null);
    if (where.email !== undefined) return Promise.resolve(opts.byEmail ?? null);
    return Promise.resolve(null);
  });
}

describe('UserSyncService', () => {
  let service: UserSyncService;

  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockPrismaService.runInTransaction.mockImplementation((fn: (tx: any) => Promise<any>) => fn(mockTx));
    mockConfigService.get.mockReturnValue(undefined); // no bootstrap email by default
    service = new UserSyncService(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockPrismaService as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockAuditEmitter as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockConfigService as any,
    );
  });

  describe('upsertFromJwt — provisioning', () => {
    it('refreshes a returning user matched by auth0_sub', async () => {
      stubFindUnique({ bySub: baseUser });
      mockUserUpdate.mockResolvedValue(baseUser);
      mockUserFindUniqueOrThrow.mockResolvedValue(baseUser);

      const result = await service.upsertFromJwt({
        auth0_sub: 'auth0|test',
        email: 'test@example.com',
        name: 'Test User',
      });

      expect(mockUserUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({ email: 'test@example.com', displayName: 'Test User' }),
        }),
      );
      expect(mockUserCreate).not.toHaveBeenCalled();
      expect(result.email).toBe('test@example.com');
    });

    it('claims a pending placeholder by email on first Auth0 login', async () => {
      // Regression: invited user has auth0Sub = "pending:<email>"; the real sub
      // does not match, but the email row exists. Must bind the real sub, NOT create
      // a duplicate (which would collide on the unique email → P2002 → 409).
      const placeholder = { ...baseUser, auth0Sub: 'pending:test@example.com' };
      const claimed = { ...baseUser, auth0Sub: 'auth0|real-sub' };
      stubFindUnique({ bySub: null, byEmail: placeholder });
      mockUserUpdate.mockResolvedValue(claimed);
      mockUserFindUniqueOrThrow.mockResolvedValue(claimed);

      const result = await service.upsertFromJwt({
        auth0_sub: 'auth0|real-sub',
        email: 'test@example.com',
        name: 'Test User',
      });

      expect(mockUserUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({ auth0Sub: 'auth0|real-sub' }),
        }),
      );
      expect(mockUserCreate).not.toHaveBeenCalled();
      expect(result.auth0Sub).toBe('auth0|real-sub');
    });

    it('creates a brand-new user when neither sub nor email match', async () => {
      stubFindUnique({ bySub: null, byEmail: null });
      mockUserCreate.mockResolvedValue(baseUser);
      mockUserFindUniqueOrThrow.mockResolvedValue(baseUser);

      const result = await service.upsertFromJwt({
        auth0_sub: 'auth0|test',
        email: 'test@example.com',
        name: 'Test User',
      });

      expect(mockUserCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ auth0Sub: 'auth0|test', email: 'test@example.com' }),
        }),
      );
      expect(result.email).toBe('test@example.com');
    });
  });

  describe('upsertFromJwt — bootstrap superadmin', () => {
    it('does NOT bootstrap if no CORE_BOOTSTRAP_SUPERADMIN_EMAIL set', async () => {
      stubFindUnique({ bySub: baseUser });
      mockUserUpdate.mockResolvedValue(baseUser);
      mockUserFindUniqueOrThrow.mockResolvedValue(baseUser);
      mockConfigService.get.mockReturnValue(undefined);

      await service.upsertFromJwt({ auth0_sub: 'auth0|test', email: 'test@example.com' });

      expect(mockAuditEmitter.emit).not.toHaveBeenCalled();
    });

    it('does NOT bootstrap if email does not match bootstrap email', async () => {
      stubFindUnique({ bySub: baseUser });
      mockUserUpdate.mockResolvedValue(baseUser);
      mockUserFindUniqueOrThrow.mockResolvedValue(baseUser);
      mockConfigService.get.mockReturnValue('admin@example.com');

      await service.upsertFromJwt({ auth0_sub: 'auth0|test', email: 'other@example.com' });

      expect(mockAuditEmitter.emit).not.toHaveBeenCalled();
    });

    it('bootstraps superadmin when email matches and no superadmin exists', async () => {
      stubFindUnique({ bySub: baseUser });
      // Refresh update returns isSuperadmin:false; only the bootstrap update flips it.
      mockUserUpdate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(data.isSuperadmin ? { ...baseUser, isSuperadmin: true } : baseUser),
      );
      mockUserFindFirst.mockResolvedValue(null); // NO existing superadmin
      mockUserFindUniqueOrThrow.mockResolvedValue({ ...baseUser, isSuperadmin: true });
      mockConfigService.get.mockReturnValue('test@example.com');

      const result = await service.upsertFromJwt({ auth0_sub: 'auth0|test', email: 'test@example.com' });

      expect(mockUserUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isSuperadmin: true } }),
      );
      expect(mockAuditEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'user.superadmin_granted' }),
      );
      expect(result.isSuperadmin).toBe(true);
    });

    it('does NOT re-bootstrap if a superadmin already exists', async () => {
      stubFindUnique({ bySub: baseUser });
      mockUserUpdate.mockResolvedValue(baseUser);
      mockUserFindFirst.mockResolvedValue({ id: 'existing-superadmin' }); // superadmin exists
      mockUserFindUniqueOrThrow.mockResolvedValue(baseUser);
      mockConfigService.get.mockReturnValue('test@example.com');

      await service.upsertFromJwt({ auth0_sub: 'auth0|test', email: 'test@example.com' });

      expect(mockAuditEmitter.emit).not.toHaveBeenCalled();
    });
  });
});
