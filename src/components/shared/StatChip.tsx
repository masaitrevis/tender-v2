import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const TILE: Record<string, string> = {
  blue: 'bg-info-soft text-info',
  green: 'bg-success-soft text-success',
  amber: 'bg-warning-soft text-warning',
  red: 'bg-danger-soft text-danger',
  gold: 'bg-gold-soft text-gold',
  purple: 'bg-purple-soft text-purple',
  navy: 'bg-[#E4EBF4] text-navy-800',
};

/** Small white stat card: rounded tinted icon tile + bold value + uppercase label. */
export function StatChip({
  icon,
  value,
  label,
  caption,
  variant = 'blue',
  onClick,
  className,
}: {
  icon: ReactNode;
  value: ReactNode;
  label: string;
  caption?: string;
  variant?: keyof typeof TILE;
  onClick?: () => void;
  className?: string;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={cn(
        'group relative w-full rounded-xl border border-app-border bg-app-card p-4 text-left shadow-card transition-all duration-150',
        onClick && 'cursor-pointer hover:-translate-y-0.5 hover:shadow-card-hover',
        className,
      )}
    >
      <div className={cn('absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-lg', TILE[variant])}>
        {icon}
      </div>
      <div className="pr-12">
        <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-app-slate">{label}</div>
        <div className="mt-1 text-[26px] font-bold leading-8 text-app-ink tnum">{value}</div>
        {caption && <div className="mt-1 text-xs text-app-muted">{caption}</div>}
      </div>
    </Tag>
  );
}
