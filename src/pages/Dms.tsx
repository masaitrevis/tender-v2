/**
 * Business Documents vault — /dms ⭐ v2.0 flagship.
 * Attach-everything home for licences & certificates: upload (base64, 2 MB
 * cap), metadata, expiry countdowns (auto-wired to Deadline Tracker, the
 * dashboard Needs Attention list and the topbar bell via the store's
 * getNeedsAttention derivation), grid/list views, preview/download/replace/delete.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlarmClock, CheckCircle2, CloudUpload, Eye, Download, HardDrive, History,
  LayoutGrid, List, Plus, Search, ShieldCheck, Trash2, XCircle, ArrowRight,
} from 'lucide-react';
import { alertLevel, daysUntil, removeItem, storageUsage, useStore } from '@/lib/store';
import type { AlertLevel, DmsDocument } from '@/lib/store';
import {
  ConfirmDialog, EmptyState, ExpiryBadge, NewPill, PageHeader, Pill, StatChip,
} from '@/components/shared';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { KINDS, downloadDoc, fileSizeText, kindForDoc, type DmsKind } from '@/components/dms/dmsTypes';
import DocCard from '@/components/dms/DocCard';
import UploadModal from '@/components/dms/UploadModal';
import PreviewModal from '@/components/dms/PreviewModal';

type SortKey = 'expiring' | 'newest' | 'name';
type StatusFilter = 'all' | 'expiring' | 'expired';

const LEVEL_RANK: Record<AlertLevel, number> = { EXPIRED: 0, CRITICAL: 1, WARNING: 2, OK: 3 };

export default function Dms() {
  const state = useStore();
  const [params, setParams] = useSearchParams();

  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | DmsKind>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortKey>('expiring');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadKind, setUploadKind] = useState<DmsKind | undefined>(undefined);
  const [previewDoc, setPreviewDoc] = useState<DmsDocument | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<DmsDocument | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const showToast = (msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4000);
  };
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  /* Deep link: /dms?type=tax-compliance opens the upload modal pre-typed. */
  useEffect(() => {
    const t = params.get('type') as DmsKind | null;
    if (t && KINDS.some((k) => k.kind === t)) {
      setUploadKind(t);
      setUploadOpen(true);
      params.delete('type');
      setParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- derived data ---------------- */
  const docs = state.dms;

  const stats = useMemo(() => {
    let valid = 0;
    let expiring = 0;
    let expired = 0;
    docs.forEach((d) => {
      const lvl = alertLevel(d.expiryDate, state.settings);
      if (lvl === 'EXPIRED') expired += 1;
      else if (lvl === 'WARNING' || lvl === 'CRITICAL') expiring += 1;
      else valid += 1;
    });
    return { total: docs.length, valid, expiring, expired };
  }, [docs, state.settings]);

  const storage = storageUsage();

  /** Worst expiry level per kind (tints the shelf count pills). */
  const worstByKind = useMemo(() => {
    const map = new Map<DmsKind, AlertLevel>();
    docs.forEach((d) => {
      const k = kindForDoc(d);
      const lvl = alertLevel(d.expiryDate, state.settings);
      const prev = map.get(k);
      if (!prev || LEVEL_RANK[lvl] < LEVEL_RANK[prev]) map.set(k, lvl);
    });
    return map;
  }, [docs, state.settings]);

  const countByKind = useMemo(() => {
    const map = new Map<DmsKind, number>();
    docs.forEach((d) => map.set(kindForDoc(d), (map.get(kindForDoc(d)) ?? 0) + 1));
    return map;
  }, [docs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = docs.filter((d) => {
      if (kindFilter !== 'all' && kindForDoc(d) !== kindFilter) return false;
      if (statusFilter === 'expiring') {
        const lvl = alertLevel(d.expiryDate, state.settings);
        if (lvl !== 'WARNING' && lvl !== 'CRITICAL') return false;
      }
      if (statusFilter === 'expired' && alertLevel(d.expiryDate, state.settings) !== 'EXPIRED') return false;
      if (q && !`${d.title} ${d.refNo} ${d.issuer}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const byDays = (d: DmsDocument) => (d.expiryDate ? daysUntil(d.expiryDate) : Number.MAX_SAFE_INTEGER);
    list = [...list].sort((a, b) => {
      if (sort === 'expiring') return byDays(a) - byDays(b);
      if (sort === 'newest') return b.createdAt.localeCompare(a.createdAt);
      return a.title.localeCompare(b.title);
    });
    return list;
  }, [docs, search, kindFilter, statusFilter, sort, state.settings]);

  const urgentCount = stats.expiring + stats.expired;

  const openUpload = (kind?: DmsKind) => {
    setUploadKind(kind);
    setUploadOpen(true);
  };

  const countTone = (kind: DmsKind): string => {
    const worst = worstByKind.get(kind);
    if (worst === 'EXPIRED' || worst === 'CRITICAL') return 'bg-danger-soft text-danger';
    if (worst === 'WARNING') return 'bg-warning-soft text-warning';
    return 'bg-grey-soft text-grey';
  };

  return (
    <div className="px-7 pb-8 pt-6">
      <PageHeader
        title="Business Documents"
        subtitle="Your company's licences and certificates — safe, searchable, and expiry-tracked."
        actions={
          <>
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-app-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search documents…"
                className="h-9 w-52 rounded-lg border border-app-border bg-white pl-9 pr-3 text-[13px] text-app-ink outline-none transition placeholder:text-app-muted focus:border-action focus:ring-2 focus:ring-[rgba(37,99,235,.25)]"
              />
            </div>
            <div className="flex overflow-hidden rounded-lg border border-app-border bg-white">
              {(['grid', 'list'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  title={v === 'grid' ? 'Grid view' : 'List view'}
                  className={cn(
                    'flex h-9 w-9 items-center justify-center transition',
                    view === v ? 'bg-[#E4EBF4] text-navy-800' : 'text-app-muted hover:text-app-ink',
                  )}
                >
                  {v === 'grid' ? <LayoutGrid size={15} /> : <List size={15} />}
                </button>
              ))}
            </div>
            <button
              onClick={() => openUpload(undefined)}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-gold px-4 text-[13px] font-semibold text-navy-950 transition hover:-translate-y-px hover:brightness-105 active:scale-[.98]"
            >
              <Plus size={15} />
              Upload Document
            </button>
          </>
        }
      />

      {/* Gold NEW pill row */}
      <div className="-mt-4 mb-5 flex items-center gap-2">
        <NewPill />
        <span className="text-xs text-app-muted">v2.0 — expiry alerts feed your Deadline Tracker and dashboard automatically.</span>
      </div>

      {/* Stat chips */}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <StatChip icon={<ShieldCheck size={18} />} value={stats.total} label="Total Documents" variant="navy" onClick={() => { setStatusFilter('all'); setKindFilter('all'); }} />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.05 }}>
          <StatChip icon={<CheckCircle2 size={18} />} value={stats.valid} label="Valid" variant="green" onClick={() => setStatusFilter('all')} />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.1 }} className={cn(stats.expiring > 0 && 'animate-pulse-soft rounded-xl')}>
          <StatChip icon={<AlarmClock size={18} />} value={stats.expiring} label="Expiring ≤30d" caption="On your Deadline Tracker" variant="amber" onClick={() => setStatusFilter('expiring')} />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.15 }}>
          <StatChip icon={<XCircle size={18} />} value={stats.expired} label="Expired" variant="red" onClick={() => setStatusFilter('expired')} />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.2 }}>
          <div className="rounded-xl border border-app-border bg-app-card p-4 shadow-card">
            <div className="absolute right-4 top-4" />
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-app-slate">Storage Used</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-info-soft text-info">
                <HardDrive size={18} />
              </span>
            </div>
            <div className="mt-1 text-[26px] font-bold leading-8 text-app-ink tnum">{Math.round(storage.ratio * 100)}%</div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-app-border">
              <motion.div
                className={cn('h-full rounded-full', storage.ratio > 0.8 ? 'bg-danger' : 'bg-info')}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, Math.round(storage.ratio * 100))}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>
            <div className="mt-1.5 text-xs text-app-muted">2 MB max per file</div>
          </div>
        </motion.div>
      </div>

      {/* Urgent banner */}
      <AnimatePresence>
        {urgentCount > 0 && statusFilter === 'all' && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={cn(
              'mb-5 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3',
              stats.expired > 0 ? 'border-danger/30 bg-danger-soft' : 'border-warning/30 bg-warning-soft',
            )}
          >
            <AlarmClock size={17} className={stats.expired > 0 ? 'text-danger' : 'text-warning'} />
            <span className={cn('text-[13px] font-semibold', stats.expired > 0 ? 'text-danger' : 'text-warning')}>
              {stats.expiring > 0 && `${stats.expiring} document${stats.expiring === 1 ? '' : 's'} expire within 30 days`}
              {stats.expiring > 0 && stats.expired > 0 && ' · '}
              {stats.expired > 0 && `${stats.expired} expired`}
            </span>
            <span className="text-[13px] text-app-slate">They're on your Deadline Tracker and dashboard.</span>
            <button
              onClick={() => setStatusFilter(stats.expiring > 0 ? 'expiring' : 'expired')}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-white/80 px-3 py-1.5 text-[13px] font-semibold text-app-ink transition hover:bg-white"
            >
              Review <ArrowRight size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Type shelf */}
      <div className="mb-5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          onClick={() => setKindFilter('all')}
          className={cn(
            'flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-[13px] font-semibold transition',
            kindFilter === 'all' ? 'border-navy-800 bg-navy-800 text-white' : 'border-app-border bg-white text-app-slate hover:border-navy-800/40',
          )}
        >
          All
          <span className={cn('rounded-full px-1.5 py-0.5 text-[11px] font-bold', kindFilter === 'all' ? 'bg-white/20 text-white' : 'bg-grey-soft text-grey')}>
            {docs.length}
          </span>
        </button>
        {KINDS.filter((k) => k.kind !== 'other').map((k) => {
          const count = countByKind.get(k.kind) ?? 0;
          const active = kindFilter === k.kind;
          return (
            <button
              key={k.kind}
              onClick={() => setKindFilter(active ? 'all' : k.kind)}
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-[13px] font-semibold transition',
                active ? 'border-navy-800 bg-navy-800 text-white' : 'border-app-border bg-white text-app-slate hover:border-navy-800/40',
              )}
            >
              <k.icon size={14} style={{ color: active ? '#fff' : k.color }} />
              {k.label}
              {count > 0 && (
                <span className={cn('rounded-full px-1.5 py-0.5 text-[11px] font-bold', active ? 'bg-white/20 text-white' : countTone(k.kind))}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Sort + status filter row */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-[13px] text-app-muted">
          {filtered.length} document{filtered.length === 1 ? '' : 's'}
          {statusFilter !== 'all' && (
            <>
              {' '}· {statusFilter === 'expiring' ? 'expiring ≤30d' : 'expired'}{' '}
              <button onClick={() => setStatusFilter('all')} className="font-semibold text-action hover:underline">
                clear
              </button>
            </>
          )}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <label htmlFor="dms-sort" className="text-xs text-app-muted">Sort</label>
          <select
            id="dms-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-8 appearance-none rounded-lg border border-app-border bg-white px-2.5 text-[13px] font-medium text-app-ink outline-none focus:border-action"
          >
            <option value="expiring">Expiring soon</option>
            <option value="newest">Newest</option>
            <option value="name">Name</option>
          </select>
        </div>
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-app-border bg-app-card shadow-card">
          <EmptyState
            image="/empty-docs.svg"
            title={docs.length === 0 ? 'Your vault is empty' : 'No documents match'}
            hint={
              docs.length === 0
                ? 'Attach your KRA PIN, Tax Compliance Certificate, AGPO, permits and insurance — we\'ll track every expiry for you.'
                : 'Try a different search, type or status filter.'
            }
            action={
              docs.length === 0 ? (
                <button
                  onClick={() => openUpload(undefined)}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-gold px-4 text-[13px] font-semibold text-navy-950 transition hover:brightness-105"
                >
                  <CloudUpload size={15} />
                  Upload your first document
                </button>
              ) : undefined
            }
          />
        </div>
      ) : view === 'grid' ? (
        <motion.div layout className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {filtered.map((d, i) => (
              <DocCard
                key={d.id}
                doc={d}
                index={i}
                onView={setPreviewDoc}
                onHistory={setPreviewDoc}
                onDelete={setDeleteDoc}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-app-border bg-app-card shadow-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#F8FAFC] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-app-muted">
                <th className="px-4 py-3">Document</th>
                <th className="px-4 py-3">Issuer</th>
                <th className="px-4 py-3">Issue</th>
                <th className="px-4 py-3">Expiry</th>
                <th className="px-4 py-3">Version</th>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {filtered.map((d, i) => {
                  const kind = kindForDoc(d);
                  const meta = KINDS.find((k) => k.kind === kind)!;
                  const lvl = alertLevel(d.expiryDate, state.settings);
                  return (
                    <motion.tr
                      key={d.id}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2, delay: Math.min(i * 0.02, 0.3) }}
                      onClick={() => setPreviewDoc(d)}
                      className={cn('cursor-pointer border-t border-[#EEF1F5] transition-colors hover:bg-[#F8FAFC]', lvl === 'EXPIRED' && 'opacity-75 saturate-[.6]')}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${meta.color}16`, color: meta.color }}>
                            <meta.icon size={16} />
                          </span>
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-app-ink">{d.title}</div>
                            <div className="font-mono text-xs text-app-muted">{d.refNo}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-app-slate">{d.issuer}</td>
                      <td className="px-4 py-3 text-app-slate tnum">{formatDate(d.issueDate)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-app-slate tnum">{d.expiryDate ? formatDate(d.expiryDate) : '—'}</span>
                          <ExpiryBadge date={d.expiryDate} />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Pill tone="grey">{d.version}</Pill>
                      </td>
                      <td className="px-4 py-3 text-app-muted tnum">{fileSizeText(d.fileData)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => setPreviewDoc(d)} title="View" className="flex h-8 w-8 items-center justify-center rounded-lg text-app-muted hover:bg-app-bg hover:text-action">
                            <Eye size={14} />
                          </button>
                          <button onClick={() => d.fileData && downloadDoc(d)} title="Download" className="flex h-8 w-8 items-center justify-center rounded-lg text-app-muted hover:bg-app-bg hover:text-action">
                            <Download size={14} />
                          </button>
                          <button onClick={() => setPreviewDoc(d)} title="History" className="flex h-8 w-8 items-center justify-center rounded-lg text-app-muted hover:bg-app-bg hover:text-action">
                            <History size={14} />
                          </button>
                          <button onClick={() => setDeleteDoc(d)} title="Delete" className="flex h-8 w-8 items-center justify-center rounded-lg text-app-muted hover:bg-danger-soft hover:text-danger">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSaved={(title) => showToast(`${title} saved — expiry tracked`)}
        initialKind={uploadKind}
      />
      <PreviewModal
        doc={previewDoc}
        onClose={() => setPreviewDoc(null)}
        onDeleted={(title) => showToast(`${title} deleted from the vault`)}
        onReplaced={(d) => {
          setPreviewDoc(d);
          showToast(`${d.title} updated — now ${d.version}`);
        }}
      />
      <ConfirmDialog
        open={deleteDoc != null}
        onClose={() => setDeleteDoc(null)}
        onConfirm={() => {
          if (deleteDoc) {
            removeItem('dms', deleteDoc.id, {
              details: `Deleted ${deleteDoc.title} from the vault`,
              text: `${deleteDoc.title} removed from Business Documents`,
            });
            showToast(`${deleteDoc.title} deleted from the vault`);
          }
        }}
        title="Delete permanently?"
        message={deleteDoc ? `"${deleteDoc.title}" will be removed from the vault. This won't affect tracker history or past audit entries.` : ''}
        confirmLabel="Delete"
        destructive
      />

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="fixed right-6 top-6 z-[60] flex items-center gap-2.5 rounded-xl border border-success/30 bg-white px-4 py-3 shadow-card-hover"
          >
            <CheckCircle2 size={17} className="text-success" />
            <span className="text-[13px] font-semibold text-app-ink">{toast}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
