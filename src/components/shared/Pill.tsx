import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/* Status color law (design.md section 2):
   Won/Paid/Active/Eligible = green · Open/Pending/Warning = amber ·
   Under Evaluation/Updated = blue · Submitted = purple ·
   Lost/Overdue/Error/Expired = red · Cancelled/Inactive = grey · Accent/NEW = gold */
export type Tone = 'green' | 'amber' | 'blue' | 'purple' | 'red' | 'grey' | 'gold' | 'navy';

const TONE_CLASSES: Record<Tone, string> = {
  green: 'bg-success-soft text-success',
  amber: 'bg-warning-soft text-warning',
  blue: 'bg-info-soft text-info',
  purple: 'bg-purple-soft text-purple',
  red: 'bg-danger-soft text-danger',
  grey: 'bg-grey-soft text-grey',
  gold: 'bg-gold-soft text-gold',
  navy: 'bg-[#E4EBF4] text-navy-800',
};

export const DOT_CLASSES: Record<Tone, string> = {
  green: 'bg-success',
  amber: 'bg-warning',
  blue: 'bg-info',
  purple: 'bg-purple',
  red: 'bg-danger',
  grey: 'bg-grey',
  gold: 'bg-gold',
  navy: 'bg-navy-800',
};

/** Map an arbitrary status string to its tone per the status color law. */
export function statusTone(status: string): Tone {
  const s = status.toLowerCase();
  if (/(won|paid|active|valid|eligible|complete|approved|released|ok|in progress)/.test(s)) return 'green';
  if (/(open|pending|partly|warning|draft|sent|issued|mitigating)/.test(s)) return 'amber';
  if (/(under evaluation|updated|submitted)/.test(s)) return s.includes('submitted') ? 'purple' : 'blue';
  if (/(lost|overdue|fail|error|expired|rejected|critical)/.test(s)) return 'red';
  if (/(cancel|inactive|closed)/.test(s)) return 'grey';
  return 'grey';
}

export function Pill({ status, tone, className, children, pulse }: {
  status?: string;
  tone?: Tone;
  className?: string;
  children?: ReactNode;
  pulse?: boolean;
}) {
  const t = tone ?? (status ? statusTone(status) : 'grey');
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.04em]',
        TONE_CLASSES[t],
        pulse && 'animate-pulse-soft',
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', DOT_CLASSES[t])} />
      {children ?? status}
    </span>
  );
}

/** Gold "NEW" pill used on v2.0 features (pulses, max 3 on screen). */
export function NewPill({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full bg-gold px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-navy-950 animate-pulse-soft',
        className,
      )}
    >
      New
    </span>
  );
}
