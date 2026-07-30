/**
 * Document Center — /documents
 * List/filter all generated documents, conversion chain, type picker,
 * CSV export, print via the LetterheadDoc print portal.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight, Ban, Copy, Download, ExternalLink, FilePlus2, FileText,
  Hourglass, Layers, MoreHorizontal, Printer, Search, Stamp,
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import type { DocType, FbvDocument } from '@/lib/store';
import { addItem, getState, nextDocNumber, reserveDocNumber, uid, updateItem, useStore, TODAY } from '@/lib/store';
import { formatDate, formatKES, formatKESCompact } from '@/lib/format';
import {
  ConfirmDialog, EmptyState, Modal, PageHeader, Pill, StatChip,
} from '@/components/shared';
import { cn } from '@/lib/utils';
import {
  DOC_META, DOC_STATUS_TONE, DOC_TYPES, NEXT_STAGE, buildConvertedDoc,
  canConvert, clientOf, docDisplayStatus, docTenderRef, shortNo,
} from '@/components/documents/docConfig';
import { getDocExtras, setDocExtras } from '@/components/documents/extras';
import { letterFromFbv, useDocPrinter } from '@/components/documents/LetterheadDoc';

/* ---------------- CSV export ---------------- */
function exportCsv(docs: FbvDocument[], s: ReturnType<typeof getState>) {
  const head = ['Doc No', 'Type', 'Client', 'Tender', 'Date', 'Due Date', 'Amount (KES)', 'Paid (KES)', 'Status'];
  const rows = docs.map((d) => [
    d.docNo,
    DOC_META[d.type].label,
    clientOf(s, d.clientId)?.name ?? s.suppliers.find((x) => x.id === d.clientId)?.name ?? '',
    docTenderRef(s, d) ?? '',
    d.issueDate,
    d.dueDate ?? '',
    d.total.toFixed(2),
    d.amountPaid.toFixed(2),
    docDisplayStatus(d, s.approvals),
  ]);
  const csv = [head, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `fbv-documents-${TODAY}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success(`Exported ${docs.length} documents to CSV`);
}

/* ---------------- row action menu ---------------- */
function RowMenu({
  doc,
  onOpen,
  onDuplicate,
  onConvert,
  onPrint,
  onCancel,
}: {
  doc: FbvDocument;
  onOpen: () => void;
  onDuplicate: () => void;
  onConvert: (() => void) | null;
  onPrint: () => void;
  onCancel: () => void;
}) {
  const [open, setOpen] = useState(false);
  const next = NEXT_STAGE[doc.type];
  return (
    <div className="relative" onMouseLeave={() => setOpen(false)}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-app-muted transition hover:bg-app-bg hover:text-app-ink"
        aria-label="Document actions"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.15 }}
          className="absolute right-0 top-9 z-20 w-52 origin-top rounded-xl border border-app-border bg-white p-1 shadow-card-hover"
        >
          {[
            { icon: ExternalLink, label: 'Open', fn: onOpen },
            { icon: Copy, label: 'Duplicate', fn: onDuplicate },
            ...(next && onConvert
              ? [{ icon: ArrowRight, label: `Convert → ${DOC_META[next].label}`, fn: onConvert }]
              : []),
            { icon: Printer, label: 'Print', fn: onPrint },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => {
                setOpen(false);
                item.fn();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium text-app-ink transition hover:bg-app-bg"
            >
              <item.icon size={15} className="text-app-slate" />
              {item.label}
            </button>
          ))}
          <div className="my-1 border-t border-app-border" />
          <button
            onClick={() => {
              setOpen(false);
              onCancel();
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium text-danger transition hover:bg-danger-soft"
          >
            <Ban size={15} />
            Cancel document
          </button>
        </motion.div>
      )}
    </div>
  );
}

/* ---------------- main page ---------------- */
export default function DocumentCenter() {
  const state = useStore();
  const navigate = useNavigate();
  const printer = useDocPrinter();

  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | DocType>('all');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSel, setPickerSel] = useState<DocType | null>(null);
  const [cancelTarget, setCancelTarget] = useState<FbvDocument | null>(null);

  const docs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...state.documents]
      .filter((d) => (tab === 'all' ? true : d.type === tab))
      .filter((d) => {
        if (!q) return true;
        const client = clientOf(state, d.clientId)?.name
          ?? state.suppliers.find((x) => x.id === d.clientId)?.name ?? '';
        return (
          d.docNo.toLowerCase().includes(q)
          || client.toLowerCase().includes(q)
          || (docTenderRef(state, d) ?? '').toLowerCase().includes(q)
          || DOC_META[d.type].label.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (b.issueDate + b.docNo).localeCompare(a.issueDate + a.docNo));
  }, [state, search, tab]);

  const stats = useMemo(() => {
    const month = TODAY.slice(0, 7);
    const display = state.documents.map((d) => docDisplayStatus(d, state.approvals));
    const issuedThisMonth = state.documents.filter(
      (d) => d.issueDate.startsWith(month) && ['Issued', 'Paid', 'Partly Paid', 'Overdue'].includes(d.status),
    );
    return {
      drafts: display.filter((s) => s === 'Draft').length,
      awaiting: display.filter((s) => s === 'Submitted').length,
      issuedCount: issuedThisMonth.length,
      issuedValue: issuedThisMonth.reduce((a, d) => a + d.total, 0),
    };
  }, [state]);

  /* ------------- actions ------------- */
  const openDoc = (d: FbvDocument) => navigate(`/documents/new/${d.type}?edit=${d.id}`);

  const duplicateDoc = async (d: FbvDocument) => {
    const s = getState();
    const docNo = await reserveDocNumber(s.settings.docPrefixes[d.type] ?? 'FBV-DOC');
    const copy: FbvDocument = {
      ...d,
      id: uid('doc'),
      docNo,
      status: 'Draft',
      amountPaid: 0,
      convertedFromId: undefined,
      issueDate: TODAY,
      createdAt: `${TODAY}T09:00:00`,
      lines: d.lines.map((l) => ({ ...l, id: uid('ln') })),
    };
    addItem('documents', copy, {
      action: 'Created', entity: DOC_META[d.type].label, entityRef: docNo,
      details: `Duplicated ${DOC_META[d.type].label} — ${docNo} from ${d.docNo}`,
      verb: 'Duplicated', verbColor: 'grey',
    });
    setDocExtras(copy.id, getDocExtras(d.id));
    toast.success(`Duplicated as ${docNo}`);
  };

  const convertDoc = async (d: FbvDocument) => {
    const target = NEXT_STAGE[d.type];
    if (!target) return;
    const s = getState();
    const newDoc = await buildConvertedDoc(s, d, target);
    addItem('documents', newDoc, {
      action: 'Created', entity: DOC_META[target].label, entityRef: newDoc.docNo,
      details: `Converted ${d.docNo} → ${newDoc.docNo}`,
      verb: 'Converted', verbColor: 'blue',
      text: `${DOC_META[target].label} ${newDoc.docNo} created from ${d.docNo}`,
    });
    // Carry discount + terms forward (no retyping).
    const src = getDocExtras(d.id);
    setDocExtras(newDoc.id, { ...getDocExtras(newDoc.id), discountType: src.discountType, discountValue: src.discountValue, terms: src.terms });
    toast.success(`${DOC_META[target].label} ${newDoc.docNo} created from ${d.docNo}`);
    navigate(`/documents/new/${target}?edit=${newDoc.id}`);
  };

  const printDoc = (d: FbvDocument) => {
    printer.request(letterFromFbv(getState(), d), state.profile);
  };

  const cancelDoc = () => {
    if (!cancelTarget) return;
    updateItem('documents', cancelTarget.id, { status: 'Cancelled' }, {
      action: 'Cancelled', entity: DOC_META[cancelTarget.type].label, entityRef: cancelTarget.docNo,
      details: `Cancelled ${DOC_META[cancelTarget.type].label} — ${cancelTarget.docNo}`,
      verb: 'Cancelled', verbColor: 'red',
    });
    toast.success(`${cancelTarget.docNo} cancelled`);
  };

  /* ------------- render ------------- */
  return (
    <div className="px-7 pt-6 pb-10">
      <Toaster position="top-right" richColors toastOptions={{ duration: 4000 }} />
      {printer.portal}

      <PageHeader
        title="Document Center"
        subtitle="Generate, convert and track all business documents."
        actions={
          <>
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-app-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search documents…"
                className="h-9 w-56 rounded-lg border border-app-border bg-white pl-9 pr-3 text-sm text-app-ink outline-none transition placeholder:text-app-muted focus:border-action focus:ring-2 focus:ring-[rgba(37,99,235,.25)]"
              />
            </div>
            <button
              onClick={() => exportCsv(docs, getState())}
              className="flex h-9 items-center gap-2 rounded-lg border border-app-border bg-white px-3.5 text-[13px] font-semibold text-app-ink transition hover:-translate-y-px hover:brightness-105 active:scale-[.98]"
            >
              <Download size={15} /> Export CSV
            </button>
            <button
              onClick={() => {
                setPickerSel(null);
                setPickerOpen(true);
              }}
              className="flex h-9 items-center gap-2 rounded-lg bg-action px-3.5 text-[13px] font-semibold text-white transition hover:-translate-y-px hover:bg-action-hover active:scale-[.98]"
            >
              <FilePlus2 size={15} /> New Document
            </button>
          </>
        }
      />

      {/* StatChips */}
      <motion.div
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.05 } } }}
        className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4"
      >
        {[
          <StatChip key="d" icon={<FileText size={17} />} value={stats.drafts} label="Drafts" variant="grey"
            className="[&>div:first-child]:bg-grey-soft [&>div:first-child]:text-grey" />,
          <StatChip key="a" icon={<Hourglass size={17} />} value={stats.awaiting} label="Awaiting Approval" variant="amber" />,
          <StatChip key="i" icon={<Stamp size={17} />} value={stats.issuedCount} label="Issued This Month" variant="blue" />,
          <StatChip key="v" icon={<Layers size={17} />} value={formatKESCompact(stats.issuedValue)} label="Value Issued" variant="navy" />,
        ].map((chip, i) => (
          <motion.div
            key={i}
            variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            {chip}
          </motion.div>
        ))}
      </motion.div>

      {/* Doc-type tab bar */}
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-app-border bg-app-card p-1 shadow-card">
        {[{ key: 'all' as const, label: 'All', icon: Layers, count: state.documents.length },
          ...DOC_TYPES.map((m) => ({
            key: m.type as DocType, label: m.plural, icon: m.icon,
            count: state.documents.filter((d) => d.type === m.type).length,
          })),
        ].map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'relative flex h-9 shrink-0 items-center gap-2 rounded-lg px-3.5 text-[13px] font-semibold transition-colors',
                active ? 'text-white' : 'text-app-slate hover:bg-app-bg hover:text-app-ink',
              )}
            >
              {active && (
                <motion.span
                  layoutId="doc-tab-pill"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  className="absolute inset-0 rounded-lg bg-navy-800"
                />
              )}
              <t.icon size={15} className="relative z-10" />
              <span className="relative z-10">{t.label}</span>
              <span
                className={cn(
                  'relative z-10 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
                  active ? 'bg-white/20 text-white' : 'bg-grey-soft text-grey',
                )}
              >
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-app-border bg-app-card shadow-card">
        {docs.length === 0 ? (
          <EmptyState
            title="No documents found"
            hint="Try a different filter, or generate a new quotation, invoice, purchase order or contract."
            action={
              <button
                onClick={() => setPickerOpen(true)}
                className="flex h-9 items-center gap-2 rounded-lg bg-action px-4 text-[13px] font-semibold text-white transition hover:bg-action-hover"
              >
                <FilePlus2 size={15} /> New Document
              </button>
            }
          />
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-[#F8FAFC] text-left">
                {['Doc No', 'Type', 'Client', 'Tender', 'Date', 'Amount', 'Status', ''].map((h, i) => (
                  <th
                    key={h || 'actions'}
                    className={cn(
                      'px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-app-muted',
                      i === 5 && 'text-right',
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {docs.map((d, i) => {
                const display = docDisplayStatus(d, state.approvals);
                const meta = DOC_META[d.type];
                const client = clientOf(state, d.clientId)
                  ?? state.suppliers.find((x) => x.id === d.clientId);
                const source = d.convertedFromId
                  ? state.documents.find((x) => x.id === d.convertedFromId)
                  : undefined;
                return (
                  <motion.tr
                    key={d.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, delay: Math.min(i, 12) * 0.02 }}
                    layout="position"
                    onClick={() => openDoc(d)}
                    className="h-14 cursor-pointer border-t border-[#EEF1F5] transition-colors hover:bg-[#F8FAFC]"
                  >
                    <td className="px-4 py-2">
                      <div className="font-mono text-[13px] font-semibold text-navy-800">{d.docNo}</div>
                      {source && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openDoc(source);
                          }}
                          className="mt-0.5 font-mono text-[10px] font-medium text-app-muted transition hover:text-action"
                        >
                          {shortNo(source.docNo)} → {shortNo(d.docNo)}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-2 text-[13px] font-medium text-app-ink">
                        <span className={cn('flex h-6 w-6 items-center justify-center rounded-md', meta.tile)}>
                          <meta.icon size={13} />
                        </span>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-sm text-app-ink">{client?.name ?? '—'}</td>
                    <td className="px-4 py-2 font-mono text-xs text-app-slate">{docTenderRef(state, d) ?? '—'}</td>
                    <td className="px-4 py-2 text-sm tabular-nums text-app-slate">{formatDate(d.issueDate)}</td>
                    <td className="px-4 py-2 text-right text-sm font-semibold tabular-nums text-app-ink">
                      {formatKES(d.total)}
                    </td>
                    <td className="px-4 py-2">
                      <Pill tone={DOC_STATUS_TONE[display]} pulse={display === 'Overdue'}>{display}</Pill>
                    </td>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <RowMenu
                        doc={d}
                        onOpen={() => openDoc(d)}
                        onDuplicate={() => duplicateDoc(d)}
                        onConvert={canConvert(d, state.approvals) ? () => convertDoc(d) : null}
                        onPrint={() => printDoc(d)}
                        onCancel={() => setCancelTarget(d)}
                      />
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        )}
        {docs.length > 0 && (
          <div className="flex items-center justify-between border-t border-app-border px-4 py-3 text-xs text-app-muted">
            <span>{docs.length} result{docs.length === 1 ? '' : 's'}</span>
            <span className="tabular-nums">Page 1 of 1</span>
          </div>
        )}
      </div>

      {/* New Document type picker */}
      <Modal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="New Document — choose a type"
        width="max-w-[700px]"
        footer={
          <>
            <button
              onClick={() => setPickerOpen(false)}
              className="h-9 rounded-lg border border-app-border bg-white px-4 text-[13px] font-semibold text-app-ink transition hover:brightness-105"
            >
              Cancel
            </button>
            <button
              disabled={!pickerSel}
              onClick={() => {
                if (pickerSel) navigate(`/documents/new/${pickerSel}`);
              }}
              className="h-9 rounded-lg bg-action px-4 text-[13px] font-semibold text-white transition hover:bg-action-hover disabled:opacity-50"
            >
              Continue
            </button>
          </>
        }
      >
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.05 } } }}
          className="grid grid-cols-2 gap-3 sm:grid-cols-3"
        >
          {DOC_TYPES.map((m) => {
            const nextNo = nextDocNumber(state.settings.docPrefixes[m.type] ?? 'FBV-DOC');
            const selected = pickerSel === m.type;
            return (
              <motion.button
                key={m.type}
                variants={{ hidden: { opacity: 0, scale: 0.92 }, show: { opacity: 1, scale: 1 } }}
                transition={{ duration: 0.2 }}
                onClick={() => setPickerSel(m.type)}
                className={cn(
                  'rounded-xl border bg-white p-4 text-left transition',
                  selected
                    ? 'border-action ring-2 ring-[rgba(37,99,235,.3)]'
                    : 'border-app-border hover:-translate-y-0.5 hover:shadow-card-hover',
                )}
              >
                <span className={cn('flex h-10 w-10 items-center justify-center rounded-lg', m.tile)}>
                  <m.icon size={18} />
                </span>
                <div className="mt-2.5 text-[13px] font-semibold text-app-ink">{m.label}</div>
                <div className="mt-0.5 font-mono text-[10px] font-medium text-app-muted">Next: {nextNo}</div>
                <div className="mt-1 text-xs leading-4 text-app-slate">{m.purpose}</div>
              </motion.button>
            );
          })}
        </motion.div>
      </Modal>

      <ConfirmDialog
        open={cancelTarget != null}
        onClose={() => setCancelTarget(null)}
        onConfirm={cancelDoc}
        title="Cancel document"
        message={
          cancelTarget
            ? `Cancel ${cancelTarget.docNo}? It will remain in the register marked as Cancelled and can no longer be edited or converted.`
            : ''
        }
        confirmLabel="Cancel document"
        destructive
      />
    </div>
  );
}
