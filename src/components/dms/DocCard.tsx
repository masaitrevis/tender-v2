/** DMS grid card: status strip, type icon, thumbnail, dates, ExpiryBadge, hover actions. */
import { motion } from 'framer-motion';
import { Download, Eye, FileText, History, Trash2 } from 'lucide-react';
import { alertLevel, daysUntil } from '@/lib/store';
import type { AlertLevel, DmsDocument } from '@/lib/store';
import { ExpiryBadge } from '@/components/shared';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { dataUrlOf, downloadDoc, isImage, kindForDoc, kindMeta } from './dmsTypes';

const STRIP: Record<AlertLevel, string> = {
  OK: 'bg-success',
  WARNING: 'bg-warning',
  CRITICAL: 'bg-danger',
  EXPIRED: 'bg-grey',
};

export default function DocCard({
  doc,
  index,
  onView,
  onHistory,
  onDelete,
}: {
  doc: DmsDocument;
  index: number;
  onView: (doc: DmsDocument) => void;
  onHistory: (doc: DmsDocument) => void;
  onDelete: (doc: DmsDocument) => void;
}) {
  const level = alertLevel(doc.expiryDate);
  const kind = kindMeta(kindForDoc(doc));
  const thumb = dataUrlOf(doc);
  const showThumb = thumb && isImage(doc.fileName);
  const expired = level === 'EXPIRED';
  const days = doc.expiryDate ? daysUntil(doc.expiryDate) : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.05, 0.4), ease: 'easeOut' }}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border border-app-border bg-app-card shadow-card transition-shadow hover:shadow-card-hover',
        expired && 'opacity-75 saturate-[.6]',
      )}
    >
      {/* Status strip */}
      <div className={cn('h-1.5', STRIP[level])} />

      {/* Thumb */}
      <button onClick={() => onView(doc)} className="relative block h-32 w-full cursor-pointer bg-[#F8FAFC]">
        {showThumb ? (
          <img src={thumb} alt={doc.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <span
              className="flex h-12 w-12 items-center justify-center rounded-xl"
              style={{ backgroundColor: `${kind.color}16`, color: kind.color }}
            >
              {thumb ? <FileText size={24} /> : <kind.icon size={24} />}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-app-muted">
              {thumb ? 'PDF document' : kind.label}
            </span>
          </div>
        )}
        {/* Version chip */}
        <span className="absolute right-2 top-2 rounded-full bg-navy-950/70 px-2 py-0.5 font-mono text-[10px] font-semibold text-white">
          {doc.version}
        </span>
      </button>

      {/* Body */}
      <div className="flex flex-1 flex-col px-4 pb-4 pt-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: kind.color }}>
          {kind.label}
        </div>
        <button onClick={() => onView(doc)} className="mt-0.5 text-left text-[14px] font-semibold leading-5 text-app-ink hover:text-action">
          {doc.title}
        </button>
        <div className="mt-0.5 font-mono text-xs font-medium text-app-muted">{doc.refNo}</div>
        <div className="text-xs text-app-slate">{doc.issuer}</div>

        <div className="mt-2.5 flex items-center justify-between text-xs text-app-muted tnum">
          <span>{formatDate(doc.issueDate)}</span>
          <span aria-hidden>→</span>
          <span className={cn(days != null && days < 0 && 'font-semibold text-danger')}>
            {doc.expiryDate ? formatDate(doc.expiryDate) : 'No expiry'}
          </span>
        </div>

        <div className="mt-2.5">
          <ExpiryBadge date={doc.expiryDate} />
        </div>
      </div>

      {/* Hover action bar */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex translate-y-2 items-center justify-center gap-1 bg-gradient-to-t from-white via-white/95 to-transparent pb-2.5 pt-8 opacity-0 transition-all duration-150 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100">
        {[
          { icon: Eye, label: 'View', fn: () => onView(doc) },
          { icon: Download, label: 'Download', fn: () => doc.fileData && downloadDoc(doc) },
          { icon: History, label: 'History', fn: () => onHistory(doc) },
          { icon: Trash2, label: 'Delete', fn: () => onDelete(doc) },
        ].map((a) => (
          <button
            key={a.label}
            onClick={a.fn}
            title={a.label}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg border border-app-border bg-white text-app-slate shadow-card transition hover:-translate-y-0.5',
              a.label === 'Delete' ? 'hover:text-danger' : 'hover:text-action',
            )}
          >
            <a.icon size={14} />
          </button>
        ))}
      </div>
    </motion.div>
  );
}
