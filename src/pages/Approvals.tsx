/**
 * Approval Workflow — /approvals
 * Queue: Draft → Submitted → Reviewed → Approved / Rejected / Returned.
 * Approve / reject / return actions with comments; bulk approve for same-type items.
 */
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Hourglass, CheckCircle2, XCircle, Undo2, Download, Check, FileText, Scale, GitPullRequest,
  ShoppingCart, Receipt, Percent, Eraser, FileDiff, Stamp,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  useStore, updateItem, mutateStore, daysUntil, nowISO, TODAY,
  type Approval,
} from '@/lib/store';
import { formatKES, formatDateTime } from '@/lib/format';
import {
  PageHeader, StatChip, Pill, Drawer, EmptyState, Field, TextareaInput,
} from '@/components/shared';
import { Avatar, BTN_DANGER_GHOST, BTN_GREEN, BTN_PRIMARY, BTN_SECONDARY, Card, downloadCSV, useToasts } from '@/components/trackers/ui';
import { cn } from '@/lib/utils';

/* 'Returned' is carried in localStorage but missing from the base Approval status union. */
type ApprovalStatus = 'Pending' | 'Approved' | 'Rejected' | 'Returned';
type ApprovalX = Omit<Approval, 'status'> & { status: ApprovalStatus };

const TYPE_META: Record<string, { icon: LucideIcon; tile: string }> = {
  Quotation: { icon: FileText, tile: 'bg-info-soft text-info' },
  'Bid Decision': { icon: Scale, tile: 'bg-gold-soft text-gold' },
  'Change Request': { icon: GitPullRequest, tile: 'bg-purple-soft text-purple' },
  'Purchase Order': { icon: ShoppingCart, tile: 'bg-[#E4EBF4] text-navy-800' },
  'Credit Note': { icon: Receipt, tile: 'bg-warning-soft text-warning' },
  Discount: { icon: Percent, tile: 'bg-gold-soft text-gold' },
  'Write-off': { icon: Eraser, tile: 'bg-danger-soft text-danger' },
};
const metaOf = (type: string) => TYPE_META[type] ?? { icon: FileDiff, tile: 'bg-grey-soft text-grey' };

const STAGES = ['Draft', 'Submitted', 'Reviewed', 'Approved'] as const;

function stageIndex(a: ApprovalX): number {
  if (a.status === 'Approved') return 3;
  if (a.status === 'Rejected' || a.status === 'Returned') return 2;
  return 1; // Pending = Submitted, awaiting review
}

const TABS: { value: ApprovalStatus | 'All'; label: string }[] = [
  { value: 'Pending', label: 'Pending' },
  { value: 'Approved', label: 'Approved' },
  { value: 'Rejected', label: 'Rejected' },
  { value: 'Returned', label: 'Returned' },
  { value: 'All', label: 'All' },
];

export default function Approvals() {
  const s = useStore();
  const toasts = useToasts();
  const [tab, setTab] = useState<ApprovalStatus | 'All'>('Pending');
  const [reviewFor, setReviewFor] = useState<ApprovalX | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const approvals = useMemo(() => s.approvals as ApprovalX[], [s.approvals]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { Pending: 0, Approved: 0, Rejected: 0, Returned: 0 };
    approvals.forEach((a) => {
      c[a.status] = (c[a.status] ?? 0) + 1;
    });
    return c;
  }, [approvals]);

  const stats = useMemo(() => ({
    pending: counts.Pending ?? 0,
    approvedToday: approvals.filter((a) => a.status === 'Approved' && a.decidedAt?.startsWith(TODAY)).length,
    rejected: counts.Rejected ?? 0,
    returned: counts.Returned ?? 0,
  }), [approvals, counts]);

  const rows = useMemo(
    () => approvals.filter((a) => tab === 'All' || a.status === tab),
    [approvals, tab],
  );

  const decide = (a: ApprovalX, status: 'Approved' | 'Rejected' | 'Returned', comment: string) => {
    // Flip a referenced document from Draft to Issued when approving (workflow wiring)
    const flipDoc = status === 'Approved' ? s.documents.find((d) => a.title.includes(d.docNo) && d.status === 'Draft') : undefined;
    if (flipDoc) {
      mutateStore((d) => {
        const ap = d.approvals.find((x) => x.id === a.id);
        if (ap) Object.assign(ap, { status, decidedBy: 'Admin User', decidedAt: nowISO(), notes: comment || ap.notes });
        const doc = d.documents.find((x) => x.id === flipDoc.id);
        if (doc) doc.status = 'Issued';
      }, {
        action: 'Approved', entity: 'Approval', entityRef: a.refNo,
        details: `${a.refNo} approved — ${a.title}; ${flipDoc.docNo} now Issued`,
        verb: 'Approved', verbColor: 'green',
      });
      toasts.push(`${a.refNo} approved — ${flipDoc.docNo} now Issued`);
    } else {
      updateItem('approvals', a.id, {
        status: status as Approval['status'],
        decidedBy: 'Admin User',
        decidedAt: nowISO(),
        ...(comment ? { notes: comment } : {}),
      }, {
        action: status, entity: 'Approval', entityRef: a.refNo,
        details: `${a.refNo} ${status.toLowerCase()}${comment ? ` — ${comment}` : ''}`,
        verb: status, verbColor: status === 'Approved' ? 'green' : status === 'Rejected' ? 'red' : 'grey',
      });
      toasts.push(
        status === 'Approved' ? `${a.refNo} approved` : status === 'Rejected' ? `${a.refNo} rejected` : `${a.refNo} returned for changes`,
      );
    }
    setReviewFor(null);
  };

  const bulkApprove = () => {
    const items = approvals.filter((a) => selected.has(a.id) && a.status === 'Pending');
    if (items.length === 0) return;
    mutateStore((d) => {
      d.approvals.forEach((ap) => {
        if (selected.has(ap.id) && ap.status === 'Pending') {
          Object.assign(ap, { status: 'Approved', decidedBy: 'Admin User', decidedAt: nowISO() });
        }
      });
    }, {
      action: 'Approved', entity: 'Approval', entityRef: `${items.length} items`,
      details: `Bulk approval — ${items.length} ${items[0].type} item(s) approved`,
      verb: 'Approved', verbColor: 'green',
    });
    toasts.push(`${items.length} approvals approved`);
    setSelected(new Set());
  };

  const selectedPending = approvals.filter((a) => selected.has(a.id));
  const bulkSameType = selectedPending.length > 0 && selectedPending.every((a) => a.type === selectedPending[0].type && a.status === 'Pending');

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exportCsv = () => {
    downloadCSV(
      'fbv-approvals.csv',
      ['Ref', 'Type', 'Title', 'Amount (KES)', 'Requested By', 'Requested At', 'Status', 'Decided By', 'Decided At'],
      rows.map((a) => [a.refNo, a.type, a.title, a.amount ?? '', a.requestedBy, a.requestedAt, a.status, a.decidedBy ?? '', a.decidedAt ?? '']),
    );
    toasts.push(`Exported ${rows.length} approvals to CSV`);
  };

  return (
    <div className="px-7 pb-8 pt-6">
      {toasts.node}
      <PageHeader
        title="Approval Workflow"
        subtitle="Review and approve documents, bid decisions and changes."
        actions={
          <button onClick={exportCsv} className={BTN_SECONDARY}><Download size={15} /> Export CSV</button>
        }
      />

      {/* Stats */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { icon: <Hourglass size={17} />, value: stats.pending, label: 'Pending', variant: 'amber' as const },
          { icon: <CheckCircle2 size={17} />, value: stats.approvedToday, label: 'Approved Today', variant: 'green' as const },
          { icon: <XCircle size={17} />, value: stats.rejected, label: 'Rejected', variant: 'red' as const },
          { icon: <Undo2 size={17} />, value: stats.returned, label: 'Returned', variant: 'navy' as const },
        ].map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: i * 0.05, ease: 'easeOut' }}>
            <StatChip icon={c.icon} value={c.value} label={c.label} variant={c.variant} />
          </motion.div>
        ))}
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b border-app-border">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => { setTab(t.value); setSelected(new Set()); }}
            className={cn(
              'relative flex items-center gap-1.5 px-3 pb-2 text-[13px] font-semibold transition',
              tab === t.value ? 'text-action' : 'text-app-slate hover:text-app-ink',
            )}
          >
            {t.label}
            {t.value === 'Pending' && stats.pending > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-warning px-1 text-[10px] font-bold text-white tnum">{stats.pending}</span>
            )}
            {tab === t.value && <motion.span layoutId="approvals-tab" className="absolute inset-x-0 -bottom-px h-0.5 bg-action" />}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            title={tab === 'Pending' ? 'All caught up — nothing pending approval' : `No ${tab.toLowerCase()} items`}
            hint="Documents, bid decisions and change requests submitted for review will appear here."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {rows.map((a, i) => {
              const meta = metaOf(a.type);
              const Icon = meta.icon;
              const age = Math.max(0, -daysUntil(a.requestedAt.slice(0, 10)));
              const pending = a.status === 'Pending';
              const stage = stageIndex(a);
              return (
                <motion.div
                  key={a.id}
                  layout="position"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 40, height: 0, marginBottom: 0, overflow: 'hidden', transition: { duration: 0.25 } }}
                  transition={{ duration: 0.25, delay: Math.min(i * 0.04, 0.3), ease: 'easeOut' }}
                  className="rounded-xl border border-app-border bg-app-card p-4 shadow-card"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    {pending && (
                      <input
                        type="checkbox"
                        checked={selected.has(a.id)}
                        onChange={() => toggleSelect(a.id)}
                        className="h-4 w-4 shrink-0 accent-action"
                        aria-label={`Select ${a.refNo}`}
                      />
                    )}
                    <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', meta.tile)}>
                      <Icon size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-mono text-[13px] font-medium text-navy-800">{a.refNo}</span>
                        <span className="truncate text-sm font-semibold text-app-ink">{a.title}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-app-muted">
                        <Avatar name={a.requestedBy} size={18} />
                        <span>{a.requestedBy}</span>
                        <span>·</span>
                        <span className="tnum">{formatDateTime(a.requestedAt)}</span>
                        <span>·</span>
                        <span className={cn('font-medium', age > 3 && pending ? 'text-danger' : 'text-app-muted')}>
                          {pending ? `waiting ${age}d` : `${a.status.toLowerCase()} ${a.decidedAt ? formatDateTime(a.decidedAt) : ''}`}
                        </span>
                      </div>
                    </div>
                    {a.amount != null && (
                      <div className="text-right">
                        <div className="text-lg font-bold text-app-ink tnum">{formatKES(a.amount)}</div>
                      </div>
                    )}
                    <div className="flex shrink-0 items-center gap-2">
                      {pending ? (
                        <>
                          <button onClick={() => setReviewFor(a)} className={BTN_PRIMARY}>Review</button>
                          <button onClick={() => decide(a, 'Approved', '')} className={BTN_GREEN}><Check size={14} /> Approve</button>
                          <button onClick={() => setReviewFor(a)} className={BTN_DANGER_GHOST}>Reject</button>
                        </>
                      ) : (
                        <Pill tone={a.status === 'Approved' ? 'green' : a.status === 'Rejected' ? 'red' : 'grey'}>{a.status}</Pill>
                      )}
                    </div>
                  </div>

                  {/* Stage stepper */}
                  <div className="mt-3 flex items-center gap-0 pl-1">
                    {STAGES.map((st, si) => {
                      const done = si < stage || a.status === 'Approved';
                      const current = si === stage && pending;
                      const failed = (a.status === 'Rejected' || a.status === 'Returned') && si === stage;
                      return (
                        <div key={st} className="flex flex-1 items-center last:flex-none">
                          <div className="flex items-center gap-1.5">
                            {done ? (
                              <motion.span
                                initial={{ scale: 0.6 }}
                                animate={{ scale: 1 }}
                                transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                                className="flex h-5 w-5 items-center justify-center rounded-full bg-success text-white"
                              >
                                <Check size={11} />
                              </motion.span>
                            ) : failed ? (
                              <span className={cn('flex h-5 w-5 items-center justify-center rounded-full text-white', a.status === 'Rejected' ? 'bg-danger' : 'bg-grey')}>
                                {a.status === 'Rejected' ? <XCircle size={11} /> : <Undo2 size={10} />}
                              </span>
                            ) : current ? (
                              <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-action bg-white animate-pulse-soft">
                                <span className="h-1.5 w-1.5 rounded-full bg-action" />
                              </span>
                            ) : (
                              <span className="h-5 w-5 rounded-full border-2 border-app-border bg-white" />
                            )}
                            <span className={cn('text-[11px] font-semibold', done ? 'text-success' : current ? 'text-action' : failed ? (a.status === 'Rejected' ? 'text-danger' : 'text-grey') : 'text-app-muted')}>
                              {failed ? a.status : st}
                            </span>
                          </div>
                          {si < STAGES.length - 1 && (
                            <motion.span
                              initial={{ scaleX: 0 }}
                              animate={{ scaleX: 1 }}
                              transition={{ duration: 0.3, delay: 0.15 + si * 0.08 }}
                              className={cn('mx-2 h-0.5 flex-1 origin-left rounded', si < stage ? 'bg-success' : 'bg-app-border')}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Bulk action bar */}
      <AnimatePresence>
        {selected.size > 0 && tab === 'Pending' && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-app-border bg-white px-4 py-3 shadow-card-hover"
          >
            <span className="text-[13px] font-medium text-app-ink tnum">{selected.size} selected</span>
            {!bulkSameType && <span className="text-xs text-app-muted">Bulk approve works for same-type pending items only</span>}
            <button onClick={bulkApprove} disabled={!bulkSameType} className={BTN_GREEN}>
              <Stamp size={14} /> Approve {selected.size} selected
            </button>
            <button onClick={() => setSelected(new Set())} className={BTN_SECONDARY}>Clear</button>
          </motion.div>
        )}
      </AnimatePresence>

      <ReviewDrawer approval={reviewFor} onClose={() => setReviewFor(null)} onDecide={decide} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Review drawer (560px)                                                */
/* ------------------------------------------------------------------ */

function ReviewDrawer({ approval, onClose, onDecide }: {
  approval: ApprovalX | null;
  onClose: () => void;
  onDecide: (a: ApprovalX, status: 'Approved' | 'Rejected' | 'Returned', comment: string) => void;
}) {
  const s = useStore();
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const key = approval?.id ?? null;
  if (key !== loadedFor) {
    setLoadedFor(key);
    setComment('');
    setError('');
  }

  if (!approval) return <Drawer open={false} onClose={onClose}>{null}</Drawer>;
  const meta = metaOf(approval.type);
  const Icon = meta.icon;
  const linkedDoc = s.documents.find((d) => approval.title.includes(d.docNo));

  const act = (status: 'Approved' | 'Rejected' | 'Returned') => {
    if ((status === 'Rejected' || status === 'Returned') && !comment.trim()) {
      return setError(`A comment is required to ${status === 'Rejected' ? 'reject' : 'return'} this item.`);
    }
    onDecide(approval, status, comment.trim());
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg', meta.tile)}><Icon size={14} /></span>
          Review — <span className="font-mono text-[13px]">{approval.refNo}</span>
        </span>
      }
      footer={
        <>
          <button onClick={() => act('Rejected')} className={BTN_DANGER_GHOST}>Reject</button>
          <button onClick={() => act('Returned')} className={BTN_SECONDARY}><Undo2 size={14} /> Return for changes</button>
          <button onClick={() => act('Approved')} className={BTN_GREEN}><Check size={14} /> Approve &amp; Issue</button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Payload preview */}
        <div className="rounded-xl border border-app-border p-4">
          <div className="mb-2 flex items-center justify-between">
            <Pill tone="gold">{approval.type}</Pill>
            <Pill tone="amber">{approval.status}</Pill>
          </div>
          <h3 className="text-[15px] font-semibold text-app-ink">{approval.title}</h3>
          {approval.amount != null && (
            <div className="mt-2 text-[22px] font-bold text-app-ink tnum">{formatKES(approval.amount)}</div>
          )}
          <div className="mt-3 space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-app-muted">Requested by</span><span className="font-medium text-app-ink">{approval.requestedBy}</span></div>
            <div className="flex justify-between"><span className="text-app-muted">Submitted</span><span className="font-medium text-app-ink tnum">{formatDateTime(approval.requestedAt)}</span></div>
            {linkedDoc && (
              <div className="flex justify-between"><span className="text-app-muted">Linked document</span><span className="font-mono text-[13px] font-medium text-navy-800">{linkedDoc.docNo} · {linkedDoc.status}</span></div>
            )}
            {approval.notes && (
              <div className="rounded-lg bg-app-bg px-3 py-2 text-[13px] text-app-slate">{approval.notes}</div>
            )}
          </div>
        </div>

        <Field label="Comment" hint="Required when rejecting or returning for changes." error={error || undefined}>
          <TextareaInput
            value={comment}
            onChange={(e) => { setComment(e.target.value); setError(''); }}
            rows={4}
            placeholder="Decision rationale, conditions, or requested changes…"
          />
        </Field>
        <p className="rounded-lg bg-app-bg px-3 py-2 text-xs text-app-muted">
          The decision is written to the Audit Trail and the requester sees it in Recent Activity.
        </p>
      </div>
    </Drawer>
  );
}
