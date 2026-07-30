/** Small shared building blocks for the tender pages (register, detail, tools). */
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { animate, motion, useInView } from 'framer-motion';
import type { TenderStatus } from '@/lib/store';
import type { Tone } from '@/components/shared';
import { cn } from '@/lib/utils';

/* ---------------- status maps (status color law) ---------------- */

export const STATUS_TONE: Record<TenderStatus, Tone> = {
  Won: 'green',
  Open: 'amber',
  'Under Evaluation': 'blue',
  Submitted: 'purple',
  Lost: 'red',
  Cancelled: 'grey',
};

export const STATUS_DOT: Record<TenderStatus, string> = {
  Won: 'bg-success',
  Open: 'bg-warning',
  'Under Evaluation': 'bg-info',
  Submitted: 'bg-purple',
  Lost: 'bg-danger',
  Cancelled: 'bg-grey',
};

export const STATUS_HEX: Record<TenderStatus, string> = {
  Won: '#16A34A',
  Open: '#D97706',
  'Under Evaluation': '#2563EB',
  Submitted: '#7C3AED',
  Lost: '#DC2626',
  Cancelled: '#64748B',
};

export const STATUS_TAB_BG: Record<TenderStatus, string> = {
  Won: 'bg-success-soft text-success',
  Open: 'bg-warning-soft text-warning',
  'Under Evaluation': 'bg-info-soft text-info',
  Submitted: 'bg-purple-soft text-purple',
  Lost: 'bg-danger-soft text-danger',
  Cancelled: 'bg-grey-soft text-grey',
};

/** Map a free-text tender category to Supplies / Works / Services chip class. */
export function categoryClass(category: string): 'Supplies' | 'Works' | 'Services' {
  const c = category.toLowerCase();
  if (/(work|construction|installation|maintenance|building|civil)/.test(c)) return 'Works';
  if (/(service|catering|hospitality|consult|support|energy)/.test(c)) return 'Services';
  return 'Supplies';
}

export const CATEGORY_CHIP: Record<'Supplies' | 'Works' | 'Services', string> = {
  Supplies: 'bg-info-soft text-info',
  Works: 'bg-gold-soft text-gold',
  Services: 'bg-purple-soft text-purple',
};

/* ---------------- count-up ---------------- */

export function CountUp({
  value,
  format,
  duration = 0.8,
  className,
}: {
  value: number;
  format: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, value, {
      duration,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
  }, [inView, value, duration]);
  return (
    <span ref={ref} className={className}>
      {format(display)}
    </span>
  );
}

/** Tweens a number on every change (summary cascades, gauge scores). */
export function TweenNumber({
  value,
  format,
  duration = 0.3,
  className,
}: {
  value: number;
  format: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (from === value) {
      setDisplay(value);
      return;
    }
    const controls = animate(from, value, {
      duration,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
  }, [value, duration]);
  return <span className={className}>{format(display)}</span>;
}

/* ---------------- buttons ---------------- */

type BtnVariant = 'primary' | 'secondary' | 'gold' | 'danger-ghost' | 'danger';

const BTN: Record<BtnVariant, string> = {
  primary: 'bg-action text-white hover:bg-action-hover',
  secondary: 'border border-app-border bg-white text-app-ink hover:brightness-105',
  gold: 'bg-gold text-navy-950 hover:brightness-105',
  danger: 'bg-danger text-white hover:brightness-105',
  'danger-ghost': 'border border-app-border bg-white text-danger hover:bg-danger-soft',
};

export function Btn({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' }) {
  return (
    <button
      {...rest}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition',
        'hover:-translate-y-px active:scale-[.98] disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-9 px-4 text-[13px]',
        BTN[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ---------------- avatar ---------------- */

const AVATAR_COLORS = ['#C9A227', '#2563EB', '#16A34A', '#7C3AED', '#1F3B57', '#D97706'];

export function Avatar({
  name,
  color,
  size = 28,
  className,
}: {
  name: string;
  color?: string;
  size?: number;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const bg = color ?? AVATAR_COLORS[hash % AVATAR_COLORS.length];
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white', className)}
      style={{ width: size, height: size, backgroundColor: bg, fontSize: Math.max(9, size * 0.36) }}
    >
      {initials}
    </span>
  );
}

/* ---------------- card & section title ---------------- */

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('rounded-xl border border-app-border bg-app-card shadow-card', className)}>{children}</div>
  );
}

export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h3 className={cn('text-[11px] font-semibold uppercase tracking-[0.06em] text-app-slate', className)}>
      {children}
    </h3>
  );
}

/* ---------------- page enter wrapper ---------------- */

export function PageEnter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={cn('px-7 pb-8 pt-6', className)}
    >
      {children}
    </motion.div>
  );
}
