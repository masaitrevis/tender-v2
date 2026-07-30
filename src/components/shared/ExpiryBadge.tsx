import { alertLevel, daysUntil, useStore } from '@/lib/store';
import type { AlertLevel } from '@/lib/store';
import { Pill, type Tone } from './Pill';

const TONE: Record<AlertLevel, Tone> = { OK: 'green', WARNING: 'amber', CRITICAL: 'red', EXPIRED: 'grey' };

/**
 * Derived expiry badge — green OK · amber ≤30d · red ≤7d · grey EXPIRED.
 * Reused in DMS, Deadlines, Bonds and the dashboard.
 */
export function ExpiryBadge({ date, showDays = true }: { date?: string | null; showDays?: boolean }) {
  const settings = useStore().settings;
  if (!date) return <Pill tone="green">No Expiry</Pill>;
  const level = alertLevel(date, settings);
  const days = daysUntil(date);
  const label =
    level === 'EXPIRED'
      ? 'Expired'
      : showDays
        ? `${level === 'CRITICAL' ? 'Critical' : level === 'WARNING' ? 'Warning' : 'Valid'} · ${days}d`
        : level === 'CRITICAL'
          ? 'Critical'
          : level === 'WARNING'
            ? 'Warning'
            : 'Valid';
  return <Pill tone={TONE[level]} pulse={level === 'CRITICAL'}>{label}</Pill>;
}
