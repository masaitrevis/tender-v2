import { daysUntil } from '@/lib/store';
import { countdownText } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Countdown chip: `31d overdue` (red, bold) / `1d left` (amber) / `11d left` (slate). */
export function CountdownChip({ date, pulse, className }: { date: string; pulse?: boolean; className?: string }) {
  const days = daysUntil(date);
  const overdue = days < 0;
  const soon = days >= 0 && days <= 7;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold tnum',
        overdue && 'bg-danger-soft text-danger font-bold',
        soon && !overdue && 'bg-warning-soft text-warning',
        !soon && !overdue && 'bg-grey-soft text-grey',
        pulse && overdue && 'animate-pulse-soft',
        className,
      )}
    >
      {countdownText(days)}
    </span>
  );
}
