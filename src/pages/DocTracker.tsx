/**
 * Document Tracker — /doc-tracker.
 * Follows every issued transactional document (QUO/PRO/INV/RCT/PO/CON) from
 * draft to payment: chain breadcrumb, current stage pill, last event, age,
 * and a drawer with an animated stage timeline + full event log.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Banknote, ChevronRight, FileCheck2, FileEdit, FileText, FileSignature,
  FileSpreadsheet, Receipt, ScrollText, Search, Send, ShoppingCart, ThumbsUp,
  MoreHorizontal, Printer, ExternalLink, ListFilter,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { daysUntil, useStore } from '@/lib/store';
import type { ActivityEntry, AppState, DocType, FbvDocument } from '@/lib/store';
import { Drawer, PageHeader, Pill, StatChip, TimelineItem, EmptyState } from '@/components/shared';
import type { Tone } from '@/components/shared';
import { formatDate, formatDateTime, formatKES } from '@/lib/format';
import { cn } from '@/lib/utils';

/* ------------------------------- stages ------------------------------- */

type Stage = 'Draft' | 'With Approver' | 'Sent' | 'Accepted' | 'Paid' | 'Overdue' | 'Cancelled';

const STAGE_FLOW: Stage[] = ['Draft', 'With Approver', 'Sent', 'Accepted', 'Paid'];

const STAGE_TONE: Record<Stage, Tone> = {
  Draft: 'grey',
  'With Approver': 'amber',
  Sent: 'blue',
  Accepted: 'purple',
  Paid: 'green',
  Overdue: 'red',
  Cancelled: 'red',
};

const STAGE_ICON: Record<Stage, LucideIcon> = {
  Draft: FileEdit,
  'With Approver': FileCheck2,
  Sent: Send,
  Accepted: ThumbsUp,
  Paid: Banknote,
  Overdue: FileCheck2,
  Cancelled: FileCheck2,
};

function stageOf(doc: FbvDocument): Stage {
  switch (doc.status) {
    case 'Draft': return 'Draft';
    case 'Issued': return 'With Approver';
    case 'Sent': return 'Sent';
    case 'Partly Paid': return 'Accepted';
    case 'Paid': return 'Paid';
    case 'Overdue': return 'Overdue';
    case 'Cancelled': return 'Cancelled';
  }
}

const TYPE_META: Record<DocType, { label: string; icon: LucideIcon; color: string }> = {
  quotation: { label: 'Quotation', icon: FileText, color: '#2563EB' },
  proforma: { label: 'Proforma', icon: FileSpreadsheet, color: '#7C3AED' },
  invoice: { label: 'Invoice', icon: Receipt, color: '#16A34A' },
  receipt: { label: 'Receipt', icon: ScrollText, color: '#C9A227' },
  'purchase-order': { label: 'Purchase Order', icon: ShoppingCart, color: '#D97706' },
  contract: { label: 'Contract', icon: FileSignature, color: '#1F3B57' },
};

const TYPE_ORDER: Record<DocType, number> = {
  quotation: 0, proforma: 1, contract: 2, invoice: 3, receipt: 4, 'purchase-order': 5,
};

/* ------------------------------ chain logic ------------------------------ */

/** Short breadcrumb label: `FBV-QUO-2026-003` → `QUO-003`. */
function shortNo(docNo: string): string {
  const parts = docNo.split('-');
  return parts.length >= 4 ? `${parts[1]}-${parts[3]}` : docNo;
}

/** Conversion chain for a document (convertedFromId links, tender-group fallback). */
function chainFor(doc: FbvDocument, all: FbvDocument[]): FbvDocument[] {
  const byTypeThenDate = (a: FbvDocument, b: FbvDocument) =>
    TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.issueDate.localeCompare(b.issueDate);

  let root = doc;
  const seen = new Set([doc.id]);
  while (root.convertedFromId) {
    const prev = all.find((d) => d.id === root.convertedFromId);
    if (!prev || seen.has(prev.id)) break;
    root = prev;
    seen.add(prev.id);
  }
  const chain = [root];
  let cur = root;
  for (;;) {
    const next = all.find((d) => d.convertedFromId === cur.id);
    if (!next || chain.includes(next)) break;
    chain.push(next);
    cur = next;
  }
  if (chain.length === 1 && doc.tenderId) {
    const group = all.filter((d) => d.tenderId === doc.tenderId);
    if (group.length > 1) return group.sort(byTypeThenDate);
  }
  return chain.sort(byTypeThenDate);
}

/** Latest audit line for a doc → "Sent 21 Jul 2026 · by Daniel Mutiso". */
function lastEvent(doc: FbvDocument, audit: AppState['audit']): { text: string; user: string; timestamp: string } {
  const entries = audit
    .filter((a) => a.entityRef === doc.docNo)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  if (entries.length > 0) {
    const e = entries[0];
    return { text: e.action, user: e.user, timestamp: e.timestamp };
  }
  return { text: 'Created', user: 'Admin User', timestamp: doc.createdAt };
}

/** Synthesized event feed for the drawer (audit entries + creation). */
function eventFeed(doc: FbvDocument, audit: AppState['audit']): ActivityEntry[] {
  const entries: ActivityEntry[] = audit
    .filter((a) => a.entityRef === doc.docNo)
    .map((a) => ({
      id: a.id,
      timestamp: a.timestamp,
      verb: a.action,
      verbColor: a.action === 'Deleted' ? 'red' : a.action === 'Updated' ? 'blue' : 'grey',
      ref: doc.docNo,
      text: a.details,
      user: a.user,
    }));
  entries.push({
    id: `created-${doc.id}`,
    timestamp: doc.createdAt,
    verb: 'Created',
    verbColor: 'navy',
    ref: doc.docNo,
    text: `${TYPE_META[doc.type].label} created — ${formatKES(doc.total)}`,
    user: 'Admin User',
  });
  if (doc.status === 'Paid') {
    entries.push({
      id: `paid-${doc.id}`,
      timestamp: `${doc.issueDate}T23:59:00`,
      verb: 'Paid',
      verbColor: 'green',
      ref: doc.docNo,
      text: `Settled in full — ${formatKES(doc.total)}`,
      user: 'Daniel Mutiso',
    });
  }
  return entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/* -------------------------------- page -------------------------------- */

export default function DocTracker() {
  const state = useStore();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<'all' | Stage>('all');
  const [selected, setSelected] = useState<FbvDocument | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const docs = state.documents;
  const clientOf = (id: string) =>
    state.clients.find((c) => c.id === id)?.name ??
    state.suppliers.find((s) => s.id === id)?.name ??
    '—';

  const stats = useMemo(
    () => ({
      draft: docs.filter((d) => stageOf(d) === 'Draft').length,
      approver: docs.filter((d) => stageOf(d) === 'With Approver').length,
      sent: docs.filter((d) => stageOf(d) === 'Sent').length,
      paid: docs.filter((d) => stageOf(d) === 'Paid').length,
    }),
    [docs],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docs
      .filter((d) => {
        if (stageFilter !== 'all' && stageOf(d) !== stageFilter) return false;
        if (q && !`${d.docNo} ${clientOf(d.clientId)} ${TYPE_META[d.type].label}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => b.issueDate.localeCompare(a.issueDate));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs, search, stageFilter, state.clients, state.suppliers]);

  const selectedStage = selected ? stageOf(selected) : null;
  const selectedFlowIdx = selectedStage
    ? selectedStage === 'Overdue'
      ? STAGE_FLOW.indexOf('Sent')
      : STAGE_FLOW.indexOf(selectedStage as (typeof STAGE_FLOW)[number])
    : -1;

  return (
    <div className="px-7 pb-8 pt-6">
      <PageHeader
        title="Document Tracker"
        subtitle="Follow every document from draft to payment."
        actions={
          <>
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-app-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search doc no or client…"
                className="h-9 w-56 rounded-lg border border-app-border bg-white pl-9 pr-3 text-[13px] text-app-ink outline-none transition placeholder:text-app-muted focus:border-action focus:ring-2 focus:ring-[rgba(37,99,235,.25)]"
              />
            </div>
            <div className="relative">
              <ListFilter size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-app-muted" />
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value as 'all' | Stage)}
                className="h-9 appearance-none rounded-lg border border-app-border bg-white pl-8 pr-3 text-[13px] font-medium text-app-ink outline-none focus:border-action"
              >
                <option value="all">All stages</option>
                {[...STAGE_FLOW, 'Overdue', 'Cancelled'].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </>
        }
      />

      {/* Stat chips */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(
          [
            { label: 'In Draft', value: stats.draft, icon: FileEdit, variant: 'navy' as const, stage: 'Draft' as Stage },
            { label: 'Awaiting Approval', value: stats.approver, icon: FileCheck2, variant: 'amber' as const, stage: 'With Approver' as Stage },
            { label: 'Sent to Client', value: stats.sent, icon: Send, variant: 'blue' as const, stage: 'Sent' as Stage },
            { label: 'Paid / Closed', value: stats.paid, icon: Banknote, variant: 'green' as const, stage: 'Paid' as Stage },
          ]
        ).map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.05 }}
          >
            <StatChip
              icon={<s.icon size={18} />}
              value={s.value}
              label={s.label}
              variant={s.variant}
              onClick={() => setStageFilter((f) => (f === s.stage ? 'all' : s.stage))}
            />
          </motion.div>
        ))}
      </div>

      {/* Register table */}
      {rows.length === 0 ? (
        <div className="rounded-xl border border-app-border bg-app-card shadow-card">
          <EmptyState
            title="No documents found"
            hint="Generated quotations, invoices and contracts appear here with their live status."
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-app-border bg-app-card shadow-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#F8FAFC] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-app-muted">
                <th className="px-4 py-3">Doc No</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Chain</th>
                <th className="px-4 py-3">Current Stage</th>
                <th className="px-4 py-3">Last Event</th>
                <th className="px-4 py-3 text-right">Age</th>
                <th className="px-4 py-3 text-right">·</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d, i) => {
                const meta = TYPE_META[d.type];
                const stage = stageOf(d);
                const chain = chainFor(d, docs);
                const last = lastEvent(d, state.audit);
                const age = Math.abs(Math.min(0, daysUntil(d.issueDate)));
                return (
                  <motion.tr
                    key={d.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, delay: Math.min(i * 0.02, 0.3) }}
                    onClick={() => setSelected(d)}
                    className="group cursor-pointer border-t border-[#EEF1F5] transition-colors hover:bg-[#F8FAFC]"
                  >
                    <td className="px-4 py-3.5">
                      <span className="font-mono text-[13px] font-medium text-navy-800">{d.docNo}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-lg"
                        style={{ backgroundColor: `${meta.color}16`, color: meta.color }}
                        title={meta.label}
                      >
                        <meta.icon size={15} />
                      </span>
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-3.5 font-medium text-app-ink">{clientOf(d.clientId)}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap items-center gap-1 font-mono text-xs">
                        {chain.map((c, ci) => (
                          <span key={c.id} className="flex items-center gap-1">
                            {ci > 0 && (
                              <ChevronRight
                                size={12}
                                className="text-app-muted transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-gold"
                              />
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelected(c);
                              }}
                              className={cn(
                                'rounded px-1.5 py-0.5 transition',
                                c.id === d.id ? 'bg-[#E4EBF4] font-semibold text-navy-800' : 'text-app-slate hover:bg-app-bg hover:text-navy-800',
                              )}
                            >
                              {shortNo(c.docNo)}
                            </button>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <Pill tone={STAGE_TONE[stage]}>{stage}</Pill>
                    </td>
                    <td className="max-w-[220px] truncate px-4 py-3.5 text-xs text-app-muted">
                      {last.text} {formatDate(last.timestamp)} · by {last.user}
                    </td>
                    <td className="px-4 py-3.5 text-right text-[13px] text-app-slate tnum">{age}d</td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setMenuFor((m) => (m === d.id ? null : d.id))}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-app-muted hover:bg-app-bg hover:text-app-ink"
                          aria-label="Row actions"
                        >
                          <MoreHorizontal size={16} />
                        </button>
                        {menuFor === d.id && (
                          <div
                            className="absolute right-0 top-9 z-20 w-44 rounded-xl border border-app-border bg-white p-1 text-left shadow-card-hover"
                            onMouseLeave={() => setMenuFor(null)}
                          >
                            <button
                              onClick={() => navigate('/documents')}
                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-app-ink hover:bg-app-bg"
                            >
                              <ExternalLink size={14} /> Open document
                            </button>
                            <button
                              onClick={() => {
                                setSelected(d);
                                setMenuFor(null);
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-app-ink hover:bg-app-bg"
                            >
                              <ListFilter size={14} /> View timeline
                            </button>
                            <button
                              onClick={() => window.print()}
                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-app-ink hover:bg-app-bg"
                            >
                              <Printer size={14} /> Print
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
          <div className="border-t border-app-border px-4 py-3 text-xs text-app-muted">
            {rows.length} document{rows.length === 1 ? '' : 's'} tracked
          </div>
        </div>
      )}

      {/* Detail drawer */}
      <Drawer
        open={selected != null}
        onClose={() => setSelected(null)}
        width="w-[600px]"
        title={
          selected ? (
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-mono">{selected.docNo}</span>
              {selectedStage && <Pill tone={STAGE_TONE[selectedStage]}>{selectedStage}</Pill>}
            </span>
          ) : (
            ''
          )
        }
      >
        {selected && (
          <div>
            {/* Stage timeline */}
            <div className="rounded-xl border border-app-border bg-[#F8FAFC] p-5">
              <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-app-slate">
                Progress — {TYPE_META[selected.type].label}
              </div>
              {selectedStage === 'Cancelled' ? (
                <Pill tone="red">Cancelled — this document left the workflow</Pill>
              ) : (
                <div className="flex items-center">
                  {STAGE_FLOW.map((s, i) => {
                    const done = i < selectedFlowIdx || selectedStage === 'Paid';
                    const current = i === selectedFlowIdx && selectedStage !== 'Paid';
                    const Icon = STAGE_ICON[s];
                    return (
                      <div key={s} className={cn('flex items-center', i > 0 && 'flex-1')}>
                        {i > 0 && (
                          <div className="relative mx-1 h-0.5 flex-1 overflow-hidden rounded bg-app-border">
                            <motion.div
                              className={cn('absolute inset-y-0 left-0 rounded', done || current ? 'bg-success' : 'bg-app-border')}
                              initial={{ width: 0 }}
                              animate={{ width: done || current ? '100%' : '0%' }}
                              transition={{ duration: 0.6, delay: 0.15 + i * 0.12, ease: 'easeOut' }}
                            />
                          </div>
                        )}
                        <motion.div
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.1, duration: 0.25 }}
                          className="flex flex-col items-center gap-1.5"
                        >
                          <span
                            className={cn(
                              'flex h-9 w-9 items-center justify-center rounded-full border-2',
                              done
                                ? 'border-success bg-success text-white'
                                : current
                                  ? selectedStage === 'Overdue'
                                    ? 'border-danger bg-danger-soft text-danger'
                                    : 'border-action bg-info-soft text-action'
                                  : 'border-app-border bg-white text-app-muted',
                            )}
                          >
                            <Icon size={15} />
                          </span>
                          <span
                            className={cn(
                              'whitespace-nowrap text-[10px] font-semibold',
                              done ? 'text-success' : current ? 'text-app-ink' : 'text-app-muted',
                            )}
                          >
                            {current && selectedStage === 'Overdue' ? 'Overdue' : s}
                          </span>
                        </motion.div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Facts */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[
                { label: 'Client', value: clientOf(selected.clientId) },
                { label: 'Amount', value: formatKES(selected.total) },
                { label: 'Issued', value: formatDate(selected.issueDate) },
                { label: 'Due', value: selected.dueDate ? formatDate(selected.dueDate) : '—' },
                { label: 'Amount paid', value: formatKES(selected.amountPaid) },
                { label: 'Status', value: selected.status },
              ].map((f) => (
                <div key={f.label} className="rounded-xl border border-app-border bg-white px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-app-slate">{f.label}</div>
                  <div className="mt-1 text-[14px] font-semibold text-app-ink tnum">{f.value}</div>
                </div>
              ))}
            </div>

            {/* Event log */}
            <div className="mt-5 rounded-xl border border-app-border bg-white p-4">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-app-slate">
                Event log
              </div>
              <AnimatePresence initial={false}>
                {eventFeed(selected, state.audit).map((e, i) => (
                  <TimelineItem key={e.id} entry={e} index={i} />
                ))}
              </AnimatePresence>
              <p className="mt-2 border-t border-app-border pt-3 text-xs text-app-muted">
                Full history lives in the Audit Trail — every status change is recorded with user and time (
                {formatDateTime(selected.createdAt)} created).
              </p>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
