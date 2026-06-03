import { cn } from '@/lib/utils';

const PALETTE = [
  'bg-indigo-500',
  'bg-violet-500',
  'bg-sky-500',
  'bg-teal-500',
  'bg-rose-500',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-pink-500',
] as const;

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 0) return '?';
  const first = words[0] ?? '';
  const last = words.length > 1 ? (words[words.length - 1] ?? '') : '';
  const a = first[0] ?? '';
  const b = last[0] ?? '';
  return (a + b).toUpperCase() || '?';
}

function getColorIndex(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash + (name.codePointAt(i) ?? 0)) | 0;
  }
  return Math.abs(hash) % PALETTE.length;
}

interface AvatarFromNameProps {
  name: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function AvatarFromName({ name, size = 'md', className }: AvatarFromNameProps) {
  const initials = getInitials(name);
  const colorClass = PALETTE[getColorIndex(name)] ?? 'bg-indigo-500';

  return (
    <span
      aria-label={name}
      className={cn(
        'inline-flex items-center justify-center rounded-full font-semibold text-white select-none shrink-0',
        colorClass,
        size === 'sm' ? 'h-6 w-6 text-xs' : 'h-8 w-8 text-sm',
        className,
      )}
    >
      {initials}
    </span>
  );
}
