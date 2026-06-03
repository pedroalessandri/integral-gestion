import { listPeriodsAction, type PeriodItem } from '@/components/objectives/actions';
import { NewPeriodForm } from '@/components/periods/new-period-form';

interface NewPeriodPageProps {
  params: Promise<{ id: string }>;
}

export default async function NewPeriodPage({ params }: NewPeriodPageProps) {
  const { id: orgId } = await params;

  const periodsResult = await listPeriodsAction({ orgId });
  const periods: PeriodItem[] = periodsResult.periods ?? [];
  const openPeriod: PeriodItem | null = periods.find((p) => p.status === 'open') ?? null;

  return <NewPeriodForm orgId={orgId} openPeriod={openPeriod} />;
}
