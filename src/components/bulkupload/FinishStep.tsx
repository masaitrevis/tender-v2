/**
 * Step 4 — Import progress + summary: progress ring with row counter, success
 * check draw-in with a subtle gold ring pulse, 4 result tiles, action buttons.
 */
import { motion } from 'framer-motion';
import { Download, PlusCircle, RefreshCw, RotateCcw, SkipForward, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { EntityDef } from './entities';
import { PrimaryButton, SecondaryButton } from '@/components/masterdata/shared';

export interface ImportSummary {
  added: number;
  updated: number;
  skipped: number;
  failed: number;
  total: number;
}

export function ImportProgress({ current, total }: { current: number; total: number }) {
  const pct = total ? Math.round((current / total) * 100) : 0;
  const R = 52;
  const C = 2 * Math.PI * R;
  return (
    <div className="flex flex-col items-center py-14">
      <div className="relative h-36 w-36">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          <circle cx="60" cy="60" r={R} fill="none" stroke="#EEF1F5" strokeWidth="10" />
          <circle
            cx="60" cy="60" r={R} fill="none" stroke="#2563EB" strokeWidth="10"
            strokeLinecap="round" strokeDasharray={C}
            strokeDashoffset={C - (C * pct) / 100}
            style={{ transition: 'stroke-dashoffset 120ms linear' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[26px] font-bold text-app-ink tnum">{pct}%</span>
        </div>
      </div>
      <p className="mt-4 text-sm text-app-slate tnum">
        Importing {Math.min(current, total)} of {total}…
      </p>
    </div>
  );
}

export function ImportDone({
  def,
  summary,
  onDownloadReport,
  onReset,
}: {
  def: EntityDef;
  summary: ImportSummary;
  onDownloadReport: () => void;
  onReset: () => void;
}) {
  const tiles = [
    { label: 'Added', value: summary.added, icon: PlusCircle, cls: 'bg-success-soft text-success' },
    { label: 'Updated', value: summary.updated, icon: RefreshCw, cls: 'bg-info-soft text-info' },
    { label: 'Skipped', value: summary.skipped, icon: SkipForward, cls: 'bg-warning-soft text-warning' },
    { label: 'Failed', value: summary.failed, icon: XCircle, cls: 'bg-danger-soft text-danger' },
  ];
  const entityRoute = `/${def.key}`;

  return (
    <div className="py-6">
      <div className="flex flex-col items-center">
        {/* success check with gold ring pulse */}
        <div className="relative">
          <motion.span
            className="absolute inset-0 rounded-full ring-2 ring-gold"
            animate={{ opacity: [1, 0.35, 1], scale: [1, 1.06, 1] }}
            transition={{ duration: 1.6, repeat: 2 }}
          />
          <svg viewBox="0 0 64 64" className="h-16 w-16">
            <circle cx="32" cy="32" r="30" fill="#E7F6EE" />
            <motion.path
              d="M20 33 L28.5 41.5 L44 24"
              fill="none" stroke="#16A34A" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </svg>
        </div>
        <h3 className="mt-4 text-xl font-bold text-success">Import complete</h3>
        <p className="mt-1 text-sm text-app-slate">
          {summary.total} rows processed from your {def.label.toLowerCase()} file.
        </p>
      </div>

      {/* result tiles */}
      <div className="mx-auto mt-6 grid max-w-2xl grid-cols-2 gap-4 sm:grid-cols-4">
        {tiles.map((t, i) => (
          <motion.div
            key={t.label}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25, delay: 0.15 + i * 0.08 }}
            className="rounded-xl border border-app-border bg-white p-4 text-center shadow-card"
          >
            <span className={`mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-lg ${t.cls}`}>
              <t.icon size={17} />
            </span>
            <div className="text-[26px] font-bold text-app-ink tnum">{t.value}</div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-app-slate">{t.label}</div>
          </motion.div>
        ))}
      </div>

      <p className="mt-4 text-center text-sm text-app-slate">
        {summary.skipped > 0 && `${summary.skipped} rows had problems or duplicates and were skipped. `}
        {summary.updated > 0 && `${summary.updated} existing records were updated from the Excel data.`}
      </p>

      {summary.failed > 0 && (
        <div className="mx-auto mt-4 max-w-2xl rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
          Download the error report, fix the rows, and re-upload — already-imported rows won't duplicate.
        </div>
      )}

      <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
        <Link to={entityRoute}>
          <PrimaryButton icon={PlusCircle}>View imported records</PrimaryButton>
        </Link>
        <SecondaryButton icon={Download} onClick={onDownloadReport}>Download report (.xlsx)</SecondaryButton>
        <SecondaryButton icon={RotateCcw} onClick={onReset}>Import another file</SecondaryButton>
      </div>
    </div>
  );
}
