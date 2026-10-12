import { describe, it, expect } from 'vitest';
import { ForbiddenException, NotFoundException, UnprocessableEntityException, BadRequestException } from '@nestjs/common';
import { McpToolError, toToolError } from './mcp-tool-error.js';

describe('toToolError', () => {
  it('conserva el código tipado de la excepción y lo traduce a español', () => {
    const e = toToolError(new ForbiddenException('TenantMembershipDenied'));
    expect(e).toMatchObject({ code: 'TenantMembershipDenied', outcome: 'denied' });
    expect(e?.message).toContain('miembro');
  });

  it('extrae el código de mensajes "Código: detalle"', () => {
    const e = toToolError(new ForbiddenException('OrgUnitScopeForbidden: la unidad no es de tu alcance.'));
    expect(e?.code).toBe('OrgUnitScopeForbidden');
    expect(e?.outcome).toBe('denied');
    const open = toToolError(new NotFoundException('OpenPeriodNotFound: la organización no tiene un período abierto'));
    expect(open?.code).toBe('OpenPeriodNotFound');
    expect(open?.outcome).toBe('error');
    const unprocessable = toToolError(new UnprocessableEntityException('MixedWeightGroup: el grupo mezcla pesos'));
    expect(unprocessable).toMatchObject({ code: 'MixedWeightGroup', message: 'Los datos no cumplen las reglas del dominio.' });
  });

  it('texto libre de un service fuera de la lista blanca no llega al modelo', () => {
    const e = toToolError(new NotFoundException('Objective 3f2a-secret-id not found in schema okr'));
    expect(e?.message).toBe('No se encontró el recurso pedido.');
    expect(e?.message).not.toContain('secret');
  });

  it('usa el código por estado cuando el mensaje es libre', () => {
    expect(toToolError(new NotFoundException('Objective abc not found'))?.code).toBe('NotFound');
    expect(toToolError(new BadRequestException('algo salió mal'))?.code).toBe('BadRequest');
  });

  it('no traduce errores que no son HttpException (se tratan como internos) y deja pasar los propios', () => {
    expect(toToolError(new Error('boom'))).toBeNull();
    const own = new McpToolError('X', 'y');
    expect(toToolError(own)).toBe(own);
  });

  it('acota el largo del mensaje', () => {
    expect(toToolError(new NotFoundException('x'.repeat(2000)))?.message.length).toBeLessThanOrEqual(500);
  });
});
