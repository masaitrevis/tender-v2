import { format, parseISO } from 'date-fns';

/** Format an amount as `KES 1,234,560.00`. */
export function formatKES(amount: number, opts: { decimals?: number } = {}): string {
  const decimals = opts.decimals ?? 2;
  return `KES ${amount.toLocaleString('en-KE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/** Compact KPI format, e.g. `KES 39.0M`, `KES 1.7M`, `KES 850K`. */
export function formatKESCompact(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return `KES ${(amount / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `KES ${(amount / 1_000).toFixed(0)}K`;
  return `KES ${amount.toFixed(0)}`;
}

/** Plain grouped number `1,234,560.00`. */
export function formatNumber(n: number, decimals = 2): string {
  return n.toLocaleString('en-KE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** `27 Jul 2026` */
export function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso.slice(0, 10)), 'd MMM yyyy');
  } catch {
    return iso;
  }
}

/** `27 Jul 2026 20:04` */
export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'd MMM yyyy HH:mm');
  } catch {
    return iso;
  }
}

/** VAT helpers (VAT 16% by default). */
export function vatAmount(net: number, rate = 16): number {
  return Math.round(net * (rate / 100) * 100) / 100;
}
export function grossFromNet(net: number, rate = 16): number {
  return Math.round((net + vatAmount(net, rate)) * 100) / 100;
}

/** Compact countdown text for chips: `31d overdue` / `4d left` / `Today` / `Due`. */
export function countdownText(days: number): string {
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Due today';
  return `${days}d left`;
}
