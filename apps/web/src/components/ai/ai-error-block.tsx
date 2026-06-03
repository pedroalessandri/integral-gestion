'use client';

import Link from 'next/link';
import { AlertTriangle, CreditCard, Settings } from 'lucide-react';

interface Props {
  code: string;
  message: string;
  orgId?: string;
}

export function AiErrorBlock({ code, message, orgId }: Props) {
  const isQuota = code === 'AI_QUOTA_EXCEEDED';
  const isNotConfigured = code === 'AI_NOT_CONFIGURED';
  const isRateLimit =
    code === 'ThrottlerException' ||
    code === 'TOO_MANY_REQUESTS' ||
    message.includes('Too Many');

  const Icon = isQuota ? CreditCard : isNotConfigured ? Settings : AlertTriangle;
  const bgColor = isQuota ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200';
  const textColor = isQuota ? 'text-amber-900' : 'text-red-900';
  const iconColor = isQuota ? 'text-amber-600' : 'text-red-600';

  return (
    <div className={`border rounded-md p-3 ${bgColor}`}>
      <div className="flex gap-2">
        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconColor}`} aria-hidden="true" />
        <div className="flex-1">
          <p className={`text-sm ${textColor}`}>
            {isRateLimit
              ? 'Hiciste muchas consultas al copilot. Esperá unos segundos y probá de nuevo.'
              : message}
          </p>
          {isQuota && orgId && (
            <Link
              href={`/orgs/${orgId}/settings`}
              className={`inline-block mt-1.5 text-xs font-medium underline ${textColor}`}
            >
              Ver uso en la configuración →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
