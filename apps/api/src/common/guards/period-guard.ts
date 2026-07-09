import { ForbiddenException } from '@nestjs/common';

type MinimalPeriod = { id: string; status: 'open' | 'closed' | 'future'; code: string };

/**
 * Read-only enforcement for closed/future periods (RN-C9). Cross-cutting:
 * used by the okr and metrics modules on every mutation of period-bound
 * entities. Promoted from okr/services per docs/features D-A6.
 */
export function assertPeriodOpen(period: MinimalPeriod | null | undefined): asserts period is MinimalPeriod {
  if (!period) {
    throw new ForbiddenException('El período del objetivo no existe o fue eliminado.');
  }
  if (period.status !== 'open') {
    throw new ForbiddenException(
      `El período ${period.code} está ${period.status === 'closed' ? 'cerrado' : 'aún no abierto'} y no admite modificaciones.`,
    );
  }
}
