/** Shared building blocks for the Company Profile tabs. */
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Section card with a plain-language intro (profile.md: "no jargon, big clear fields"). */
export function SectionCard({
  title,
  intro,
  children,
  className,
}: {
  title: string;
  intro?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={cn('rounded-xl border border-app-border bg-app-card p-5 shadow-card', className)}
    >
      <h3 className="text-[15px] font-semibold text-app-ink">{title}</h3>
      {intro && <p className="mb-4 mt-0.5 text-[13px] text-app-slate">{intro}</p>}
      {!intro && <div className="mb-4" />}
      {children}
    </motion.section>
  );
}

/**
 * Profile field: label + generous input + helper caption.
 * Dirty (unsaved) fields get a gold left edge until the autosave lands.
 */
export function PF({
  label,
  hint,
  error,
  dirty,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  dirty?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-app-ink">
        {label}
        {dirty && <span className="h-1.5 w-1.5 rounded-full bg-gold" title="Unsaved change" />}
      </span>
      <div className="relative">
        {dirty && (
          <motion.span
            layoutId={undefined}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            className="absolute left-0 top-1/2 z-10 h-[72%] w-[3px] origin-top -translate-y-1/2 rounded-full bg-gold"
          />
        )}
        {children}
      </div>
      {error ? (
        <span className="mt-1 block text-xs text-danger">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-app-muted">{hint}</span>
      ) : null}
    </label>
  );
}

/** Generous (44px) input style per profile.md. */
export const BIG_INPUT =
  'h-11 w-full rounded-lg border border-app-border bg-white px-3.5 text-[15px] text-app-ink outline-none transition placeholder:text-app-muted focus:border-action focus:ring-2 focus:ring-[rgba(37,99,235,.25)]';

/** Live green check drawn with a pathLength animation (valid KRA PIN etc.). */
export function ValidCheck({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className="pointer-events-none absolute right-3 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-success-soft text-success"
    >
      <motion.svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
      >
        <motion.path
          d="M2 6.5 L5 9.5 L10 2.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.4 }}
        />
      </motion.svg>
      <Check className="hidden" size={10} />
    </motion.span>
  );
}
