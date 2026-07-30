/**
 * Shared building blocks for the four master-data pages (Clients / Suppliers /
 * Products / Employees) — DataTable with sorting + pagination, row `…` menu,
 * header buttons (incl. the v2.0 gold "Upload Excel" bridge), toasts with Undo,
 * CSV export, count-up numbers and gold flash for freshly bulk-imported rows.
 */
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, animate, motion, useInView } from 'framer-motion';
import {
  ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Download, FileSpreadsheet,
  MoreHorizontal, Plus, Search, CheckCircle2, XCircle, Undo2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { EmptyState } from '@/components/shared';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

const BTN_BASE =
  'inline-flex h-9 items-center gap-2 rounded-lg px-4 text-[13px] font-semibold transition hover:-translate-y-px active:scale-[.98] disabled:opacity-50 disabled:hover:translate-y-0';

export function PrimaryButton({ icon: Icon = Plus, children, onClick, type, disabled, className }: {
  icon?: LucideIcon; children: ReactNode; onClick?: () => void; type?: 'button' | 'submit'; disabled?: boolean; className?: string;
}) {
  return (
    <button type={type ?? 'button'} onClick={onClick} disabled={disabled}
      className={cn(BTN_BASE, 'bg-action text-white hover:bg-action-hover hover:brightness-105', className)}>
      <Icon size={15} /> {children}
    </button>
  );
}

export function SecondaryButton({ icon: Icon, children, onClick, disabled, className, title }: {
  icon?: LucideIcon; children: ReactNode; onClick?: () => void; disabled?: boolean; className?: string; title?: string;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title}
      className={cn(BTN_BASE, 'border border-app-border bg-white text-app-ink hover:brightness-105', className)}>
      {Icon && <Icon size={15} className="text-app-slate" />} {children}
    </button>
  );
}

/** v2.0 bridge button — gold outline, deep-links to the Bulk Upload Centre. */
export function UploadExcelButton({ entity }: { entity: string }) {
  return (
    <Link
      to={`/bulk-upload?entity=${entity}`}
      className={cn(BTN_BASE, 'border border-gold bg-white text-navy-800 hover:bg-gold-soft')}
    >
      <FileSpreadsheet size={15} className="text-gold" /> Upload Excel
    </Link>
  );
}

export function ExportCsvButton({ onClick }: { onClick: () => void }) {
  return <SecondaryButton icon={Download} onClick={onClick}>Export CSV</SecondaryButton>;
}

/* ------------------------------------------------------------------ */
/* Search box                                                          */
/* ------------------------------------------------------------------ */

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative w-[260px]">
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-app-muted" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-lg border border-app-border bg-white pl-9 pr-3 text-sm text-app-ink outline-none transition placeholder:text-app-muted focus:border-action focus:ring-2 focus:ring-[rgba(37,99,235,.25)]"
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Count-up number (StatChip values)                                   */
/* ------------------------------------------------------------------ */

export function CountUp({ value, format = (n: number) => String(Math.round(n)) }: { value: number; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, value, { duration: 0.8, ease: 'easeOut', onUpdate: (v) => setDisplay(v) });
    return () => controls.stop();
  }, [inView, value]);
  return <span ref={ref}>{format(display)}</span>;
}

/* ------------------------------------------------------------------ */
/* Row `…` action menu                                                 */
/* ------------------------------------------------------------------ */

export interface MenuItem {
  label: string;
  icon?: LucideIcon;
  danger?: boolean;
  onClick: () => void;
}

export function RowMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [open]);
  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-app-muted transition hover:bg-app-bg hover:text-app-ink"
        aria-label="Row actions"
      >
        <MoreHorizontal size={16} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-9 z-20 w-44 origin-top rounded-xl border border-app-border bg-white p-1 shadow-card-hover"
          >
            {items.map((item) => (
              <button
                key={item.label}
                onClick={() => { setOpen(false); item.onClick(); }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition hover:bg-app-bg',
                  item.danger ? 'text-danger' : 'text-app-ink',
                )}
              >
                {item.icon && <item.icon size={14} className={item.danger ? 'text-danger' : 'text-app-slate'} />}
                {item.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* DataTable — sortable, paginated, mono first column, flash rows      */
/* ------------------------------------------------------------------ */

export interface Col<T> {
  id: string;
  header: ReactNode;
  align?: 'left' | 'right' | 'center';
  sortKey?: (row: T) => string | number;
  cell: (row: T) => ReactNode;
}

const PAGE_SIZE = 10;

export function DataTable<T>({ columns, rows, rowId, onRowClick, menu, empty, flashIds, rowClass }: {
  columns: Col<T>[];
  rows: T[];
  rowId: (row: T) => string;
  onRowClick?: (row: T) => void;
  menu?: (row: T) => MenuItem[];
  empty?: { title: string; hint?: string; action?: ReactNode };
  flashIds?: Set<string>;
  rowClass?: (row: T) => string | undefined;
}) {
  const [sort, setSort] = useState<{ id: string; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.id === sort.id);
    if (!col?.sortKey) return rows;
    return [...rows].sort((a, b) => {
      const va = col.sortKey!(a);
      const vb = col.sortKey!(b);
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return cmp * sort.dir;
    });
  }, [rows, sort, columns]);

  useEffect(() => setPage(0), [rows.length]);

  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const cur = Math.min(page, pages - 1);
  const pageRows = sorted.slice(cur * PAGE_SIZE, cur * PAGE_SIZE + PAGE_SIZE);

  const toggleSort = (id: string) => {
    setSort((s) => (s?.id === id ? (s.dir === 1 ? { id, dir: -1 } : null) : { id, dir: 1 }));
  };

  if (rows.length === 0 && empty) {
    return (
      <div className="rounded-xl border border-app-border bg-app-card shadow-card">
        <EmptyState title={empty.title} hint={empty.hint} action={empty.action} />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-app-border bg-app-card shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#F8FAFC]">
              {columns.map((c) => (
                <th
                  key={c.id}
                  className={cn(
                    'whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-app-muted',
                    c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left',
                  )}
                >
                  {c.sortKey ? (
                    <button onClick={() => toggleSort(c.id)} className="inline-flex items-center gap-1 uppercase tracking-[0.06em] hover:text-app-ink">
                      {c.header}
                      {sort?.id === c.id ? (
                        sort.dir === 1 ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                      ) : (
                        <ChevronDown size={12} className="opacity-30" />
                      )}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
              {menu && <th className="w-12 px-2" />}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => {
              const id = rowId(row);
              const flash = flashIds?.has(id) ?? false;
              return (
                <motion.tr
                  key={id}
                  initial={{ opacity: 0, x: -6, backgroundColor: flash ? '#F7F0DA' : 'rgba(247,240,218,0)' }}
                  animate={{ opacity: 1, x: 0, backgroundColor: 'rgba(247,240,218,0)' }}
                  transition={{
                    duration: 0.2,
                    delay: Math.min(i * 0.02, 0.4),
                    backgroundColor: { duration: 1.2, ease: 'easeOut' },
                  }}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    'h-14 border-t border-[#EEF1F5] transition-colors hover:bg-[#F8FAFC]',
                    onRowClick && 'cursor-pointer',
                    rowClass?.(row),
                  )}
                >
                  {columns.map((c) => (
                    <td
                      key={c.id}
                      className={cn(
                        'px-4 py-2 align-middle text-app-ink',
                        c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left',
                      )}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                  {menu && (
                    <td className="px-2 align-middle">
                      <RowMenu items={menu(row)} />
                    </td>
                  )}
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* pagination footer */}
      <div className="flex items-center justify-between border-t border-app-border px-4 py-3">
        <span className="text-xs text-app-muted tnum">{sorted.length} results</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={cur === 0}
            className="flex h-8 items-center gap-1 rounded-lg border border-app-border bg-white px-3 text-xs font-semibold text-app-ink transition hover:brightness-105 disabled:opacity-50"
          >
            <ChevronLeft size={13} /> Prev
          </button>
          <span className="text-xs text-app-slate tnum">Page {cur + 1} of {pages}</span>
          <button
            onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
            disabled={cur >= pages - 1}
            className="flex h-8 items-center gap-1 rounded-lg border border-app-border bg-white px-3 text-xs font-semibold text-app-ink transition hover:brightness-105 disabled:opacity-50"
          >
            Next <ChevronRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Toasts (top-right, undo support)                                    */
/* ------------------------------------------------------------------ */

export interface ToastMsg {
  id: number;
  kind: 'success' | 'error';
  text: string;
  undo?: () => void;
}

export function useToasts() {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const idRef = useRef(0);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback((kind: 'success' | 'error', text: string, undo?: () => void) => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, kind, text, undo }]);
    window.setTimeout(() => dismiss(id), undo ? 5000 : 4000);
  }, [dismiss]);
  return { toasts, push, dismiss };
}

export function ToastStack({ toasts, dismiss }: { toasts: ToastMsg[]; dismiss: (id: number) => void }) {
  return (
    <div className="pointer-events-none fixed right-5 top-5 z-[70] flex w-[340px] flex-col gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout="position"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="pointer-events-auto flex items-center gap-2.5 rounded-xl border border-app-border bg-white px-4 py-3 shadow-card-hover"
          >
            {t.kind === 'success' ? (
              <CheckCircle2 size={17} className="shrink-0 text-success" />
            ) : (
              <XCircle size={17} className="shrink-0 text-danger" />
            )}
            <span className="flex-1 text-[13px] font-medium text-app-ink">{t.text}</span>
            {t.undo && (
              <button
                onClick={() => { t.undo!(); dismiss(t.id); }}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-action hover:bg-info-soft"
              >
                <Undo2 size={13} /> Undo
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* CSV export + code helpers + row flash                               */
/* ------------------------------------------------------------------ */

export function downloadCSV(filename: string, headers: string[], rows: (string | number)[][]) {
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

/** Next sequential code like FBV-CLI-010 for a prefix. */
export function nextCode(prefix: string, existing: { code: string }[]): string {
  let max = 0;
  const head = `${prefix}-`;
  existing.forEach((e) => {
    if (e.code.startsWith(head)) {
      const n = parseInt(e.code.slice(head.length), 10);
      if (!Number.isNaN(n) && n > max) max = n;
    }
  });
  return `${head}${String(max + 1).padStart(3, '0')}`;
}

const FLASH_KEY = (entity: string) => `fbv-flash:${entity}`;

/** Called by the Bulk Upload Centre right after a successful import. */
export function markImportedRows(entity: string, ids: string[]) {
  try {
    sessionStorage.setItem(FLASH_KEY(entity), JSON.stringify(ids));
  } catch { /* ignore */ }
}

/** Master-data pages: ids that should flash gold once, then cleared. */
export function useFlashIds(entity: string): Set<string> {
  const [ids] = useState<Set<string>>(() => {
    try {
      const raw = sessionStorage.getItem(FLASH_KEY(entity));
      sessionStorage.removeItem(FLASH_KEY(entity));
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  });
  return ids;
}

/* ------------------------------------------------------------------ */
/* Drawer form helpers                                                 */
/* ------------------------------------------------------------------ */

export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-app-slate">{title}</h3>
      <div className="grid grid-cols-2 gap-4">{children}</div>
    </div>
  );
}

export function KV({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-app-muted">{label}</div>
      <div className="mt-1 text-sm text-app-ink">{children}</div>
    </div>
  );
}

/** Tab strip with sliding layoutId indicator (drawer detail tabs, filter tabs). */
export function TabStrip({ tabs, active, onChange, id }: {
  tabs: { id: string; label: ReactNode }[];
  active: string;
  onChange: (id: string) => void;
  id?: string;
}) {
  const lid = id ?? 'tabstrip-indicator';
  return (
    <div className="flex gap-1 border-b border-app-border">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            'relative px-3 pb-2.5 pt-1 text-[13px] font-semibold transition-colors',
            active === t.id ? 'text-action' : 'text-app-slate hover:text-app-ink',
          )}
        >
          {t.label}
          {active === t.id && (
            <motion.span
              layoutId={lid}
              transition={{ type: 'spring', duration: 0.22 }}
              className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-action"
            />
          )}
        </button>
      ))}
    </div>
  );
}

/* Kenyan counties (47) for the Client county dropdown. */
export const KENYA_COUNTIES = [
  'Baringo', 'Bomet', 'Bungoma', 'Busia', 'Elgeyo-Marakwet', 'Embu', 'Garissa',
  'Homa Bay', 'Isiolo', 'Kajiado', 'Kakamega', 'Kericho', 'Kiambu', 'Kilifi',
  'Kirinyaga', 'Kisii', 'Kisumu', 'Kitui', 'Kwale', 'Laikipia', 'Lamu', 'Machakos',
  'Makueni', 'Mandera', 'Marsabit', 'Meru', 'Migori', 'Mombasa', "Murang'a",
  'Nairobi', 'Nakuru', 'Nandi', 'Narok', 'Nyamira', 'Nyandarua', 'Nyeri',
  'Samburu', 'Siaya', 'Taita-Taveta', 'Tana River', 'Tharaka-Nithi',
  'Trans Nzoia', 'Turkana', 'Uasin Gishu', 'Vihiga', 'Wajir', 'West Pokot',
];
