import { describe, it, expect, vi } from 'vitest';
import type { PrismaService } from '../../auth/index.js';
import { TOOL_CALL_RETENTION_DAYS, ToolCallRepository, type ToolCallRecord } from './tool-call.repository.js';

const record: ToolCallRecord = {
  organizationId: null,
  userId: 'u1',
  clientId: 'c'.repeat(300),
  toolName: 'listar_organizaciones',
  kind: 'read',
  outcome: 'ok',
  errorCode: null,
  latencyMs: 12.7,
  responseChars: 100,
  requestId: '11111111-1111-4111-8111-111111111111',
};

describe('ToolCallRepository', () => {
  it('registra la llamada recortando campos a su ancho de columna, sin argumentos ni respuesta', async () => {
    const create = vi.fn(async () => ({}));
    const repo = new ToolCallRepository({ raw: { mcpToolCall: { create } } } as unknown as PrismaService);
    await repo.record(record);
    const data = (create.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    expect((data['clientId'] as string).length).toBe(128);
    expect(data['latencyMs']).toBe(13);
    expect(Object.keys(data).sort()).toEqual(
      [
        'organizationId',
        'userId',
        'clientId',
        'toolName',
        'kind',
        'outcome',
        'errorCode',
        'latencyMs',
        'responseChars',
        'requestId',
      ].sort(),
    );
  });

  it('un fallo del log no rompe la herramienta', async () => {
    const create = vi.fn(async () => Promise.reject(new Error('db caída')));
    const repo = new ToolCallRepository({ raw: { mcpToolCall: { create } } } as unknown as PrismaService);
    await expect(repo.record(record)).resolves.toBeUndefined();
  });

  it('la purga borra lo anterior a la retención de 180 días', async () => {
    const deleteMany = vi.fn(async () => ({ count: 3 }));
    const repo = new ToolCallRepository({ raw: { mcpToolCall: { deleteMany } } } as unknown as PrismaService);
    const now = new Date('2026-10-12T04:00:00.000Z');
    expect(await repo.purgeExpired(now)).toBe(3);
    const arg = (deleteMany.mock.calls[0] as unknown as [{ where: { createdAt: { lt: Date } } }])[0];
    expect(arg.where.createdAt.lt.getTime()).toBe(now.getTime() - TOOL_CALL_RETENTION_DAYS * 86_400_000);
  });
});
