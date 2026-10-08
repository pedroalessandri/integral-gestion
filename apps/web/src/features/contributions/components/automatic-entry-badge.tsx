import { Bot } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { AUTOMATIC_ENTRY_LABELS } from '@/lib/labels';
import type { AutomaticEntryInfo } from '../contributions';

/** Distingue una carga automática de aporte de proyecto: ícono + texto (no depende del color) y proyecto de origen. */
export function AutomaticEntryBadge({ info }: { info: AutomaticEntryInfo }) {
  const origin = info.projectTitle
    ? AUTOMATIC_ENTRY_LABELS.from(info.projectTitle)
    : AUTOMATIC_ENTRY_LABELS.fromUnknown;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5" data-testid="automatic-entry">
      <Badge
        variant="outline"
        className="gap-1 border-sky-300 bg-sky-50 text-xs text-sky-900"
        title={AUTOMATIC_ENTRY_LABELS.readOnly}
      >
        <Bot className="h-3 w-3" aria-hidden />
        {AUTOMATIC_ENTRY_LABELS.badge}
      </Badge>
      {info.isCompensation && (
        <Badge variant="outline" className="text-xs" title={AUTOMATIC_ENTRY_LABELS.compensationHint}>
          {AUTOMATIC_ENTRY_LABELS.compensation}
        </Badge>
      )}
      <span className="text-xs text-neutral-600">{origin}</span>
    </span>
  );
}
