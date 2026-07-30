/**
 * Page-local shared bits for the TRACKERS + GOVERNANCE pages
 * (Deadlines / Bonds / Contracts / Risks / Approvals / CRM / Audit).
 * Not part of the global shared kit — scoped to this worktree's pages.
 */
import type { ReactNode } from 'react';
import { useCallback, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, XCircle, Undo2 } from 'lucide-react';
import { getState } from '@/lib/store';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/* Buttons (design.md §4)                                              */
/* ------------------------------------------------------------------ */

export const BTN_PRIMARY =
  'inline-flex h-9 items-center gap-1.5 rounded-lg bg-action px-4 text-[13px] font-semibold text-white transition hover:-translate-y-px hover:bg-action-hover hover:brightness-105 active:scale-[.98] disabled:pointer-events-none disabled:opacity-50';
export const BTN_SECONDARY =
  'inline-flex h-9 items-center gap-1.5 rounded-lg border border-app-border bg-white px-4 text-[13px] font-semibold text-app-ink transition hover:-translate-y-px hover:brightness-105 active:scale-[.98] disabled:pointer-events-none disabled:opacity-50';
export const BTN_GREEN =
  'inline-flex h-9 items-center gap-1.5 rounded-lg bg-success px-4 text-[13px] font-semibold text-white transition hover:-translate-y-px hover:brightness-105 active:scale-[.98] disabled:pointer-events-none disabled:opacity-50';
export const BTN_DANGER_GHOST =
  'inline-flex h-9 items-center gap-1.5 rounded-lg border border-danger/40 bg-white px-4 text-[13px] font-semibold text-danger transition hover:-translate-y-px hover:bg-danger-soft active:scale-[.98] disabled:pointer-events-none disabled:opacity-50';
export const BTN_SM =
  'inline-flex h-8 items-center gap-1 rounded-lg border border-app-border bg-white px-3 text-xs font-semibold text-app-ink transition hover:brightness-105 active:scale-[.98] disabled:pointer-events-none disabled:opacity-50';

/* ------------------------------------------------------------------ */
/* Avatar — resolves a store user by name, falls back to initials      */
/* ------------------------------------------------------------------ */

const FALLBACK_COLORS = ['#2563EB', '#16A34A', '#7C3AED', '#D97706', '#0E7490', '#C9A227'];

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? parts[0]?.[1] ?? '')).toUpperCase();
}

export function Avatar({ name, size = 28, className }: { name: string; size?: number; className?: string }) {
  const user = getState().users.find((u) => u.name === name);
  const color =
    user?.avatarColor ?? FALLBACK_COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % FALLBACK_COLORS.length];
  return (
    <span
      title={name}
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white', className)}
      style={{ width: size, height: size, backgroundColor: color, fontSize: size * 0.38 }}
    >
      {user?.initials ?? initialsOf(name)}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* CSV export                                                          */
/* ------------------------------------------------------------------ */

export function downloadCSV(filename: string, headers: string[], rows: Array<Array<string | number>>): void {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers, ...rows].map((r) => r.map(esc).join(',')).join('\n');
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/* Page-local toast stack (top-right, 4s auto-dismiss, optional undo)  */
/* ------------------------------------------------------------------ */

export interface Toast {
  id: number;
  kind: 'success' | 'error';
  message: string;
  undo?: () => void;
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (message: string, opts: { kind?: 'success' | 'error'; undo?: () => void } = {}) => {
      const id = ++idRef.current;
      setToasts((ts) => [...ts.slice(-3), { id, kind: opts.kind ?? 'success', message, undo: opts.undo }]);
      window.setTimeout(() => dismiss(id), 4000);
    },
    [dismiss],
  );

  const node = (
    <div className="pointer-events-none fixed right-5 top-5 z-[70] flex w-[340px] flex-col gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="pointer-events-auto flex items-center gap-2.5 rounded-xl border border-app-border bg-white px-4 py-3 shadow-card-hover"
          >
            {t.kind === 'success' ? (
              <CheckCircle2 size={17} className="shrink-0 text-success" />
            ) : (
              <XCircle size={17} className="shrink-0 text-danger" />
            )}
            <span className="flex-1 text-[13px] font-medium text-app-ink">{t.message}</span>
            {t.undo && (
              <button
                onClick={() => {
                  t.undo?.();
                  dismiss(t.id);
                }}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-action hover:bg-info-soft"
              >
                <Undo2 size={12} /> Undo
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );

  return { push, node };
}

/* ------------------------------------------------------------------ */
/* Small presentational helpers                                        */
/* ------------------------------------------------------------------ */

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-app-border bg-app-card shadow-card', className)}>{children}</div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-app-border px-4 py-3">
      <h3 className="text-[15px] font-semibold text-app-ink">{children}</h3>
      {right}
    </div>
  );
}

/** Owner display names used across tracker pages (store users + officers). */
export function ownerOptions(): string[] {
  const s = getState();
  const names = new Set<string>(s.users.map((u) => u.name));
  s.employees.forEach((e) => names.add(e.name));
  return [...names];
}
