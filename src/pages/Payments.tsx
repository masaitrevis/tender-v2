/**
 * Payment Tracker — /payments
 * Invoice balances with derived statuses, record-payment modal (6 modes),
 * auto FBV-RCT- receipt generation, invoice drawer, aging panel.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, animate, motion } from 'framer-motion';
import {
  Banknote, BellRing, Building2, CalendarClock, Check, ChevronDown, CreditCard,
  Download, ExternalLink, FileCheck, FileWarning, Hourglass, Landmark,
  MoreHorizontal, Plus, Printer, Receipt as ReceiptIcon, Search, Smartphone, Zap,
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import type { ActivityEntry, FbvDocument, PaymentMethod } from '@/lib/store';
import {
  addItem, daysUntil, getState, mutateStore, reserveDocNumber, nowISO, uid,
  useStore, TODAY,
} from '@/lib/store';
import { formatDate, formatDateTime, formatKES, formatKESCompact } from '@/lib/format';
import {
  CountdownChip, Drawer, EmptyState, Modal, PageHeader, Pill, StatChip,
  TimelineItem, Field, TextInput, DateInput, CurrencyInput, SelectInput,
} from '@/components/shared';
import { Combobox } from '@/components/documents/Combobox';
import { letterFromFbv, useDocPrinter } from '@/components/documents/LetterheadDoc';
import { clientOf } from '@/components/documents/docConfig';
import { cn } from '@/lib/utils';

/* ---------------- derived status ---------------- */
type InvStatus = 'Paid' | 'Partly Paid' | 'Unpaid' | 'Overdue';

function invoiceBalance(inv: FbvDocument): number {
  return Math.max(0, Math.round((inv.total - inv.amountPaid) * 100) / 100);
}

function invoiceStatus(inv: FbvDocument): InvStatus {
  const balance = inv.total - inv.amountPaid;
  if (balance <= 0) return 'Paid';
  if (inv.dueDate && daysUntil(inv.dueDate) < 0) return 'Overdue';
  if (inv.amountPaid > 0) return 'Partly Paid';
  return 'Unpaid';
}

const STATUS_TONE: Record<InvStatus, 'green' | 'amber' | 'grey' | 'red'> = {
  Paid: 'green',
  'Partly Paid': 'amber',
  Unpaid: 'grey',
  Overdue: 'red',
};

type PayMode = PaymentMethod | 'Card';

const PAY_MODES: Array<{ mode: PayMode; icon: typeof Banknote; placeholder: string }> = [
  { mode: 'Bank Transfer', icon: Building2, placeholder: 'e.g. EFT-KCB-2026-1182' },
  { mode: 'M-Pesa', icon: Smartphone, placeholder: 'e.g. QGH7X2K1LM' },
  { mode: 'Cheque', icon: FileCheck, placeholder: 'e.g. CHQ-KSM-00934' },
  { mode: 'Cash', icon: Banknote, placeholder: 'e.g. CASH-RCPT-0042' },
  { mode: 'RTGS', icon: Zap, placeholder: 'e.g. RTGS-KCB-660214' },
  { mode: 'Card', icon: CreditCard, placeholder: 'e.g. CARD-AUTH-88213' },
];

/* ---------------- count-up / tween value ---------------- */
function Tween({ value, format }: { value: number; format: (n: number) => string }) {
  const [display, setDisplay] = useState(0);
  const current = useRef(0);
  useEffect(() => {
    const c = animate(current.current, value, {
      duration: 0.8,
      ease: 'easeOut',
      onUpdate: (v) => {
        current.current = v;
        setDisplay(v);
      },
    });
    return () => c.stop();
  }, [value]);
  return <span>{format(display)}</span>;
}

export default function Payments() {
  const state = useStore();
  const navigate = useNavigate();
  const printer = useDocPrinter();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'All' | InvStatus>('All');
  const [payOpen, setPayOpen] = useState(false);
  const [payInvoiceId, setPayInvoiceId] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [agingOpen, setAgingOpen] = useState(true);

  /* ---------------- invoice rows ---------------- */
  const invoices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.documents
      .filter((d) => d.type === 'invoice' && d.status !== 'Cancelled')
      .map((d) => ({ inv: d, status: invoiceStatus(d), balance: invoiceBalance(d) }))
      .filter((r) => (filter === 'All' ? true : r.status === filter))
      .filter((r) => {
        if (!q) return true;
        const client = clientOf(state, r.inv.clientId)?.name ?? '';
        return r.inv.docNo.toLowerCase().includes(q) || client.toLowerCase().includes(q);
      })
      .sort((a, b) => (a.inv.dueDate ?? '').localeCompare(b.inv.dueDate ?? ''));
  }, [state, search, filter]);

  const counts = useMemo(() => {
    const all = state.documents.filter((d) => d.type === 'invoice' && d.status !== 'Cancelled');
    const by = (s: InvStatus) => all.filter((d) => invoiceStatus(d) === s).length;
    return { All: all.length, Unpaid: by('Unpaid'), 'Partly Paid': by('Partly Paid'), Paid: by('Paid'), Overdue: by('Overdue') };
  }, [state]);

  /* ---------------- stats ---------------- */
  const stats = useMemo(() => {
    const month = TODAY.slice(0, 7);
    const collected = state.payments.reduce((a, p) => a + p.amount, 0);
    const paidThisMonth = state.payments.filter((p) => p.date.startsWith(month)).reduce((a, p) => a + p.amount, 0);
    const open = state.documents.filter((d) => d.type === 'invoice' && d.status !== 'Cancelled' && invoiceBalance(d) > 0);
    const outstanding = open.reduce((a, d) => a + invoiceBalance(d), 0);
    const overdue = open.filter((d) => invoiceStatus(d) === 'Overdue').length;
    const partly = open.filter((d) => invoiceStatus(d) === 'Partly Paid').length;
    return { collected, paidThisMonth, outstanding, overdue, partly };
  }, [state]);

  /* ---------------- aging buckets ---------------- */
  const aging = useMemo(() => {
    const buckets = { current: 0, d1to30: 0, d31plus: 0 };
    state.documents
      .filter((d) => d.type === 'invoice' && d.status !== 'Cancelled' && invoiceBalance(d) > 0)
      .forEach((d) => {
        const bal = invoiceBalance(d);
        const days = d.dueDate ? daysUntil(d.dueDate) : 0;
        if (days >= 0) buckets.current += bal;
        else if (days >= -30) buckets.d1to30 += bal;
        else buckets.d31plus += bal;
      });
    return buckets;
  }, [state]);

  const agingTotal = aging.current + aging.d1to30 + aging.d31plus;

  const detail = detailId ? state.documents.find((d) => d.id === detailId) : undefined;
  const receiptDoc = receiptId ? state.documents.find((d) => d.id === receiptId) : undefined;

  /* ---------------- actions ---------------- */
  const openRecord = (invoiceId?: string) => {
    setPayInvoiceId(invoiceId ?? '');
    setPayOpen(true);
  };

  const sendReminder = (inv: FbvDocument) => {
    const client = clientOf(getState(), inv.clientId);
    addItem('crm', {
      id: uid('crm'),
      clientId: inv.clientId,
      date: TODAY,
      channel: 'Email',
      subject: 'Payment reminder sent',
      notes: `Reminder for ${inv.docNo} — balance ${formatKES(invoiceBalance(inv))}.`,
      user: 'Admin User',
    }, {
      action: 'Created', entity: 'CRM Entry', entityRef: inv.docNo,
      details: `Payment reminder sent to ${client?.name ?? 'client'} — ${inv.docNo}`,
      verb: 'Sent reminder', verbColor: 'blue',
      text: `Payment reminder sent to ${client?.name ?? 'client'} — ${inv.docNo}`,
    });
    toast.success(`Reminder sent to ${client?.name ?? 'client'} — logged to CRM`);
  };

  const printInvoice = (inv: FbvDocument) => {
    printer.request(letterFromFbv(getState(), inv), state.profile);
  };

  const onPaymentSaved = (invoiceId: string, rctNo: string) => {
    toast.success(`Payment recorded — Receipt ${rctNo} generated`);
    setFlashId(invoiceId);
    window.setTimeout(() => setFlashId(null), 1100);
  };

  /* ================================ RENDER ================================ */
  return (
    <div className="px-7 pt-6 pb-10">
      <Toaster position="top-right" richColors toastOptions={{ duration: 4000 }} />
      {printer.portal}

      <PageHeader
        title="Payment Tracker"
        subtitle="Invoices, collections and outstanding balances."
        actions={
          <>
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-app-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search invoices…"
                className="h-9 w-52 rounded-lg border border-app-border bg-white pl-9 pr-3 text-sm text-app-ink outline-none transition placeholder:text-app-muted focus:border-action focus:ring-2 focus:ring-[rgba(37,99,235,.25)]"
              />
            </div>
            <SelectInput
              value={filter}
              onChange={(e) => setFilter(e.target.value as 'All' | InvStatus)}
              options={['All', 'Unpaid', 'Partly Paid', 'Paid', 'Overdue'].map((s) => ({ value: s, label: s === 'All' ? 'All statuses' : s }))}
              className="h-9 w-40"
            />
            <button
              onClick={() => exportPaymentsCsv(invoices.map((r) => r.inv), getState())}
              className="flex h-9 items-center gap-2 rounded-lg border border-app-border bg-white px-3.5 text-[13px] font-semibold text-app-ink transition hover:-translate-y-px hover:brightness-105 active:scale-[.98]"
            >
              <Download size={15} /> Export CSV
            </button>
            <button
              onClick={() => openRecord()}
              className="flex h-9 items-center gap-2 rounded-lg bg-action px-3.5 text-[13px] font-semibold text-white transition hover:-translate-y-px hover:bg-action-hover active:scale-[.98]"
            >
              <Plus size={15} /> Record Payment
            </button>
          </>
        }
      />

      {/* StatChips */}
      <motion.div
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.05 } } }}
        className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5"
      >
        {[
          <StatChip key="c" icon={<Banknote size={17} />} value={<Tween value={stats.collected} format={formatKESCompact} />} label="Collected" variant="green" />,
          <StatChip key="o" icon={<Landmark size={17} />} value={<Tween value={stats.outstanding} format={formatKESCompact} />} label="Outstanding" variant="navy" />,
          <StatChip key="ov" icon={<FileWarning size={17} />} value={stats.overdue} label="Overdue" variant="red" />,
          <StatChip key="p" icon={<Hourglass size={17} />} value={stats.partly} label="Partly Paid" variant="amber" />,
          <StatChip key="m" icon={<CalendarClock size={17} />} value={<Tween value={stats.paidThisMonth} format={formatKESCompact} />} label="Paid This Month" variant="blue" />,
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

      <div className="grid items-start gap-5 xl:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          {/* Filter tabs */}
          <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-app-border bg-app-card p-1 shadow-card">
            {(['All', 'Unpaid', 'Partly Paid', 'Paid', 'Overdue'] as const).map((t) => {
              const active = filter === t;
              return (
                <button
                  key={t}
                  onClick={() => setFilter(t)}
                  className={cn(
                    'relative flex h-9 shrink-0 items-center gap-2 rounded-lg px-3.5 text-[13px] font-semibold transition-colors',
                    active ? 'text-white' : 'text-app-slate hover:bg-app-bg hover:text-app-ink',
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="pay-tab-pill"
                      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                      className="absolute inset-0 rounded-lg bg-navy-800"
                    />
                  )}
                  <span className="relative z-10">{t}</span>
                  <span
                    className={cn(
                      'relative z-10 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
                      active ? 'bg-white/20 text-white' : 'bg-grey-soft text-grey',
                    )}
                  >
                    {counts[t]}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Main table */}
          <div className="overflow-hidden rounded-xl border border-app-border bg-app-card shadow-card">
            {invoices.length === 0 ? (
              <EmptyState
                title="No invoices in this view"
                hint="Adjust the filters, or record a payment against an outstanding invoice."
                action={
                  <button
                    onClick={() => openRecord()}
                    className="flex h-9 items-center gap-2 rounded-lg bg-action px-4 text-[13px] font-semibold text-white transition hover:bg-action-hover"
                  >
                    <Plus size={15} /> Record Payment
                  </button>
                }
              />
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="bg-[#F8FAFC] text-left">
                    {['Invoice', 'Client', 'Invoice Date', 'Due Date', 'Amount', 'Paid', 'Balance', 'Progress', 'Status', ''].map((h, i) => (
                      <th
                        key={h || 'actions'}
                        className={cn(
                          'px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-app-muted',
                          (i === 4 || i === 5 || i === 6) && 'text-right',
                        )}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(({ inv, status, balance }, i) => {
                    const client = clientOf(state, inv.clientId);
                    const pct = inv.total > 0 ? Math.min(100, (inv.amountPaid / inv.total) * 100) : 0;
                    return (
                      <motion.tr
                        key={inv.id}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.2, delay: Math.min(i, 12) * 0.02 }}
                        layout="position"
                        onClick={() => setDetailId(inv.id)}
                        className={cn(
                          'h-14 cursor-pointer border-t border-[#EEF1F5] transition-colors hover:bg-[#F8FAFC]',
                          flashId === inv.id && 'bg-success-soft',
                        )}
                      >
                        <td className="px-4 py-2 font-mono text-[13px] font-semibold text-navy-800">{inv.docNo}</td>
                        <td className="px-4 py-2 text-sm text-app-ink">{client?.name ?? '—'}</td>
                        <td className="px-4 py-2 text-sm tabular-nums text-app-slate">{formatDate(inv.issueDate)}</td>
                        <td className="px-4 py-2">
                          <div className="text-sm tabular-nums text-app-slate">{formatDate(inv.dueDate)}</div>
                          {inv.dueDate && <CountdownChip date={inv.dueDate} pulse={status === 'Overdue'} className="mt-0.5" />}
                        </td>
                        <td className="px-4 py-2 text-right text-sm font-semibold tabular-nums text-app-ink">{formatKES(inv.total)}</td>
                        <td className="px-4 py-2 text-right text-sm tabular-nums text-success">{formatKES(inv.amountPaid)}</td>
                        <td className={cn(
                          'px-4 py-2 text-right text-sm font-bold tabular-nums',
                          balance > 0 ? 'text-danger' : 'text-app-muted',
                        )}
                        >
                          {formatKES(balance)}
                        </td>
                        <td className="px-4 py-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-grey-soft">
                            <motion.div
                              className="h-full rounded-full bg-success"
                              initial={false}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.5, ease: 'easeOut' }}
                            />
                          </div>
                          <div className="mt-1 text-[10px] tabular-nums text-app-muted">{Math.round(pct)}%</div>
                        </td>
                        <td className="px-4 py-2">
                          <Pill tone={STATUS_TONE[status]} pulse={status === 'Overdue'}>{status}</Pill>
                        </td>
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <PayRowMenu
                            hasReceipts={state.documents.some((r) => r.type === 'receipt' && r.convertedFromId === inv.id)}
                            onRecord={() => openRecord(inv.id)}
                            onReceipts={() => {
                              const r = state.documents.find((x) => x.type === 'receipt' && x.convertedFromId === inv.id);
                              if (r) setReceiptId(r.id);
                              else toast.info('No receipts yet for this invoice.');
                            }}
                            onOpen={() => navigate(`/documents/new/invoice?edit=${inv.id}`)}
                            onRemind={() => sendReminder(inv)}
                          />
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {invoices.length > 0 && (
              <div className="flex items-center justify-between border-t border-app-border px-4 py-3 text-xs text-app-muted">
                <span>{invoices.length} result{invoices.length === 1 ? '' : 's'}</span>
                <span className="tabular-nums">Page 1 of 1</span>
              </div>
            )}
          </div>
        </div>

        {/* Aging right rail */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
          className="rounded-xl border border-app-border bg-app-card shadow-card"
        >
          <button
            onClick={() => setAgingOpen((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3.5 text-left"
          >
            <span className="text-[15px] font-semibold text-app-ink">Outstanding aging</span>
            <motion.span animate={{ rotate: agingOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown size={16} className="text-app-muted" />
            </motion.span>
          </button>
          {agingOpen && (
            <div className="border-t border-app-border px-4 py-4">
              {agingTotal <= 0 ? (
                <p className="text-sm text-app-slate">Nothing outstanding — all invoices are settled.</p>
              ) : (
                <>
                  <div className="flex h-4 w-full overflow-hidden rounded-full bg-grey-soft">
                    {[
                      { v: aging.current, c: '#2563EB', d: 0 },
                      { v: aging.d1to30, c: '#D97706', d: 0.1 },
                      { v: aging.d31plus, c: '#DC2626', d: 0.2 },
                    ].map((seg) => (
                      <motion.div
                        key={seg.c}
                        className="h-full"
                        style={{ background: seg.c }}
                        initial={{ width: 0 }}
                        animate={{ width: `${(seg.v / agingTotal) * 100}%` }}
                        transition={{ duration: 0.6, ease: 'easeOut', delay: seg.d }}
                        title={formatKES(seg.v)}
                      />
                    ))}
                  </div>
                  <ul className="mt-3 space-y-2">
                    {[
                      { label: 'Current', value: aging.current, dot: '#2563EB' },
                      { label: '1–30d overdue', value: aging.d1to30, dot: '#D97706' },
                      { label: '31–60d overdue', value: aging.d31plus, dot: '#DC2626' },
                    ].map((row) => (
                      <li key={row.label} className="flex items-center gap-2 text-[13px]">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: row.dot }} />
                        <span className="flex-1 text-app-slate">{row.label}</span>
                        <span className="font-semibold tabular-nums text-app-ink">{formatKESCompact(row.value)}</span>
                      </li>
                    ))}
                    <li className="flex items-center justify-between border-t border-app-border pt-2 text-[13px]">
                      <span className="font-semibold text-app-ink">Total outstanding</span>
                      <span className="font-bold tabular-nums text-navy-800">{formatKESCompact(agingTotal)}</span>
                    </li>
                  </ul>
                </>
              )}
            </div>
          )}
        </motion.div>
      </div>

      {/* Record Payment modal */}
      <RecordPaymentModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        preselectId={payInvoiceId}
        onSaved={onPaymentSaved}
      />

      {/* Invoice detail drawer */}
      <InvoiceDrawer
        invoice={detail}
        onClose={() => setDetailId(null)}
        onRecord={() => {
          if (detail) {
            setDetailId(null);
            openRecord(detail.id);
          }
        }}
        onPrint={() => detail && printInvoice(detail)}
        onRemind={() => detail && sendReminder(detail)}
        onViewReceipt={(id) => setReceiptId(id)}
      />

      {/* Receipt preview modal */}
      <Modal
        open={receiptDoc != null}
        onClose={() => setReceiptId(null)}
        title={receiptDoc ? `Receipt ${receiptDoc.docNo}` : ''}
        width="max-w-[760px]"
        footer={
          <>
            <button
              onClick={() => setReceiptId(null)}
              className="h-9 rounded-lg border border-app-border bg-white px-4 text-[13px] font-semibold text-app-ink transition hover:brightness-105"
            >
              Close
            </button>
            <button
              onClick={() => receiptDoc && printer.request(letterFromFbv(getState(), receiptDoc), getState().profile)}
              className="flex h-9 items-center gap-2 rounded-lg bg-action px-4 text-[13px] font-semibold text-white transition hover:bg-action-hover"
            >
              <Printer size={15} /> Print Receipt
            </button>
          </>
        }
      >
        {receiptDoc && (
          <div className="flex justify-center overflow-hidden rounded-lg bg-[#E4E9F0] p-4">
            <div style={{ width: 794 * 0.72, height: 1123 * 0.72 }} className="overflow-hidden rounded-sm">
              <ReceiptSheet doc={receiptDoc} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ---------------- receipt sheet (scaled preview) ---------------- */
import { LetterheadDoc } from '@/components/documents/LetterheadDoc';

function ReceiptSheet({ doc }: { doc: FbvDocument }) {
  const state = useStore();
  return <LetterheadDoc doc={letterFromFbv(state, doc)} profile={state.profile} scale={0.72} />;
}

/* ---------------- row menu ---------------- */
function PayRowMenu({
  hasReceipts,
  onRecord,
  onReceipts,
  onOpen,
  onRemind,
}: {
  hasReceipts: boolean;
  onRecord: () => void;
  onReceipts: () => void;
  onOpen: () => void;
  onRemind: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" onMouseLeave={() => setOpen(false)}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-app-muted transition hover:bg-app-bg hover:text-app-ink"
        aria-label="Invoice actions"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.15 }}
          className="absolute right-0 top-9 z-20 w-48 origin-top rounded-xl border border-app-border bg-white p-1 shadow-card-hover"
        >
          {[
            { icon: Banknote, label: 'Record Payment', fn: onRecord },
            { icon: ReceiptIcon, label: 'View Receipts', fn: onReceipts, disabled: !hasReceipts },
            { icon: ExternalLink, label: 'Open Invoice', fn: onOpen },
            { icon: BellRing, label: 'Send Reminder', fn: onRemind },
          ].map((item) => (
            <button
              key={item.label}
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.fn();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium text-app-ink transition hover:bg-app-bg disabled:opacity-40"
            >
              <item.icon size={15} className="text-app-slate" />
              {item.label}
            </button>
          ))}
        </motion.div>
      )}
    </div>
  );
}

/* ---------------- CSV ---------------- */
function exportPaymentsCsv(invoices: FbvDocument[], s: ReturnType<typeof getState>) {
  const head = ['Invoice', 'Client', 'Invoice Date', 'Due Date', 'Amount (KES)', 'Paid (KES)', 'Balance (KES)', 'Status'];
  const rows = invoices.map((d) => [
    d.docNo,
    clientOf(s, d.clientId)?.name ?? '',
    d.issueDate,
    d.dueDate ?? '',
    d.total.toFixed(2),
    d.amountPaid.toFixed(2),
    invoiceBalance(d).toFixed(2),
    invoiceStatus(d),
  ]);
  const csv = [head, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `fbv-payments-${TODAY}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success(`Exported ${invoices.length} invoices to CSV`);
}

/* ---------------- Record Payment modal ---------------- */
function RecordPaymentModal({
  open,
  onClose,
  preselectId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  preselectId: string;
  onSaved: (invoiceId: string, rctNo: string) => void;
}) {
  const state = useStore();
  const [invoiceId, setInvoiceId] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [mode, setMode] = useState<PayMode>('Bank Transfer');
  const [reference, setReference] = useState('');
  const [date, setDate] = useState(TODAY);
  const [error, setError] = useState('');
  const amountRef = useRef<HTMLDivElement>(null);

  const outstanding = useMemo(
    () => state.documents
      .filter((d) => d.type === 'invoice' && d.status !== 'Cancelled' && invoiceBalance(d) > 0)
      .map((d) => ({
        value: d.id,
        label: d.docNo,
        caption: `${clientOf(state, d.clientId)?.name ?? ''} · balance ${formatKES(invoiceBalance(d))}`,
      })),
    [state],
  );

  const invoice = state.documents.find((d) => d.id === invoiceId);
  const balance = invoice ? invoiceBalance(invoice) : 0;
  const amount = Number(amountStr) || 0;
  const remaining = Math.max(0, Math.round((balance - amount) * 100) / 100);

  /* Reset whenever the modal opens. */
  useEffect(() => {
    if (!open) return;
    setInvoiceId(preselectId);
    setMode('Bank Transfer');
    setReference('');
    setDate(TODAY);
    setError('');
    if (preselectId) {
      const inv = getState().documents.find((d) => d.id === preselectId);
      setAmountStr(inv ? String(invoiceBalance(inv)) : '');
    } else {
      setAmountStr('');
    }
  }, [open, preselectId]);

  const pickInvoice = (id: string) => {
    setInvoiceId(id);
    const inv = state.documents.find((d) => d.id === id);
    setAmountStr(inv ? String(invoiceBalance(inv)) : '');
  };

  const save = async () => {
    if (!invoice) {
      setError('Please choose an invoice.');
      return;
    }
    if (amount <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }
    if (amount > balance + 0.005) {
      setError(`Amount exceeds the outstanding balance (${formatKES(balance)}).`);
      return;
    }
    if (mode !== 'Cash' && !reference.trim()) {
      setError(`Please enter the ${mode} reference.`);
      return;
    }
    const clientName = clientOf(getState(), invoice.clientId)?.name ?? 'client';
    const s = getState();
    const payRef = await reserveDocNumber('FBV-PAY', s.settings.docYear);
    const rctNo = await reserveDocNumber('FBV-RCT', s.settings.docYear);
    mutateStore((draft) => {
      const inv = draft.documents.find((d) => d.id === invoice.id);
      if (!inv) return;
      draft.payments.unshift({
        id: uid('pay'),
        refNo: payRef,
        invoiceId: inv.id,
        clientId: inv.clientId,
        date,
        amount,
        method: mode as PaymentMethod,
        reference: reference.trim(),
        notes: `Payment towards ${inv.docNo}`,
      });
      inv.amountPaid = Math.round((inv.amountPaid + amount) * 100) / 100;
      const newBalance = Math.max(0, Math.round((inv.total - inv.amountPaid) * 100) / 100);
      inv.status = newBalance <= 0 ? 'Paid' : 'Partly Paid';
      draft.documents.unshift({
        id: uid('doc'),
        docNo: rctNo,
        type: 'receipt',
        clientId: inv.clientId,
        issueDate: date,
        status: 'Paid',
        lines: [{
          id: uid('ln'),
          description: `Payment received — ${inv.docNo} (${mode}${reference.trim() ? ` · ${reference.trim()}` : ''})`,
          qty: 1, unit: 'lot', unitPrice: amount, amount,
        }],
        subtotal: amount,
        vatAmount: 0,
        total: amount,
        amountPaid: amount,
        convertedFromId: inv.id,
        notes: `Receipt for payment ${payRef}`,
        createdAt: nowISO(),
      });
      if (newBalance <= 0) {
        draft.deadlines.forEach((dd) => {
          if (dd.type === 'invoice' && dd.sourceRef === inv.docNo && dd.status === 'open') dd.status = 'done';
        });
      }
    }, {
      action: 'Created', entity: 'Payment', entityRef: payRef,
      details: `${mode} payment of ${formatKES(amount)} applied to ${invoice.docNo} — Receipt ${rctNo} generated`,
      verb: 'Received payment', verbColor: 'green',
      text: `Received payment · ${reference.trim() || mode} — ${formatKES(amount)} from ${clientName}`,
    });
    onClose();
    onSaved(invoice.id, rctNo);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record Payment"
      width="max-w-[520px]"
      footer={
        <>
          <button
            onClick={onClose}
            className="h-9 rounded-lg border border-app-border bg-white px-4 text-[13px] font-semibold text-app-ink transition hover:brightness-105"
          >
            Cancel
          </button>
          <button
            onClick={save}
            className="flex h-9 items-center gap-2 rounded-lg bg-action px-4 text-[13px] font-semibold text-white transition hover:-translate-y-px hover:bg-action-hover active:scale-[.98]"
          >
            <Check size={15} /> Save Payment &amp; Generate Receipt
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Invoice" required>
          <Combobox
            options={outstanding}
            value={invoiceId}
            onChange={pickInvoice}
            placeholder="Choose an outstanding invoice…"
            searchPlaceholder="Search by invoice or client…"
          />
        </Field>

        <div ref={amountRef}>
          <Field label="Amount" required hint={`Remaining after payment: ${formatKES(remaining)}`}>
            <CurrencyInput value={amountStr} onChange={setAmountStr} />
          </Field>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[
              { label: `Full balance ${formatKESCompact(balance)}`, fn: () => setAmountStr(String(balance)) },
              { label: '50%', fn: () => setAmountStr(String(Math.round(balance * 0.5 * 100) / 100)) },
              {
                label: 'Custom',
                fn: () => {
                  setAmountStr('');
                  amountRef.current?.querySelector('input')?.focus();
                },
              },
            ].map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={chip.fn}
                className="rounded-full border border-app-border bg-white px-2.5 py-1 text-[11px] font-semibold text-app-slate transition hover:border-action hover:text-action"
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        <Field label="Payment Mode" required>
          <div className="grid grid-cols-3 gap-2">
            {PAY_MODES.map((m) => {
              const selected = mode === m.mode;
              return (
                <motion.button
                  key={m.mode}
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setMode(m.mode)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-xl border bg-white px-2 py-3 transition',
                    selected
                      ? 'border-navy-800 ring-2 ring-navy-800/25'
                      : 'border-app-border hover:-translate-y-0.5 hover:shadow-card',
                  )}
                >
                  <m.icon size={17} className={selected ? 'text-navy-800' : 'text-app-muted'} />
                  <span className={cn('text-[11px] font-semibold', selected ? 'text-navy-800' : 'text-app-slate')}>
                    {m.mode}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Reference" required={mode !== 'Cash'}>
            <TextInput
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={PAY_MODES.find((m) => m.mode === mode)?.placeholder}
              className="font-mono"
            />
          </Field>
          <Field label="Date" required>
            <DateInput value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>

        {error && <p className="text-xs font-medium text-danger">{error}</p>}
      </div>
    </Modal>
  );
}

/* ---------------- Invoice detail drawer ---------------- */
function InvoiceDrawer({
  invoice,
  onClose,
  onRecord,
  onPrint,
  onRemind,
  onViewReceipt,
}: {
  invoice: FbvDocument | undefined;
  onClose: () => void;
  onRecord: () => void;
  onPrint: () => void;
  onRemind: () => void;
  onViewReceipt: (receiptId: string) => void;
}) {
  const state = useStore();
  if (!invoice) {
    return <Drawer open={false} onClose={onClose} title="">{null}</Drawer>;
  }
  const client = clientOf(state, invoice.clientId);
  const status = invoiceStatus(invoice);
  const balance = invoiceBalance(invoice);
  const payments = state.payments
    .filter((p) => p.invoiceId === invoice.id)
    .sort((a, b) => a.date.localeCompare(b.date));
  const receipts = state.documents.filter((r) => r.type === 'receipt' && r.convertedFromId === invoice.id);
  const overdueDays = invoice.dueDate ? Math.max(0, -daysUntil(invoice.dueDate)) : 0;

  const timeline: ActivityEntry[] = [
    {
      id: `t-${invoice.id}`, timestamp: invoice.issueDate, verb: 'Issued', verbColor: 'navy',
      ref: invoice.docNo, text: `Invoice issued — ${formatKES(invoice.total)}`, user: 'FBV System',
    },
    ...payments.map((p) => ({
      id: p.id, timestamp: p.date, verb: 'Received payment' as const, verbColor: 'green' as const,
      ref: p.refNo, text: `${p.method} · ${p.reference} — ${formatKES(p.amount)}`, user: 'Daniel Mutiso',
    })),
    ...(balance <= 0
      ? [{
          id: `t-full-${invoice.id}`, timestamp: payments[payments.length - 1]?.date ?? TODAY,
          verb: 'Fully paid', verbColor: 'gold' as const, ref: invoice.docNo,
          text: 'Invoice settled in full', user: 'FBV System',
        }]
      : []),
  ];

  return (
    <Drawer
      open
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <span className="font-mono">{invoice.docNo}</span>
          <Pill tone={STATUS_TONE[status]} pulse={status === 'Overdue'}>{status}</Pill>
        </span>
      }
      width="w-[560px]"
      footer={
        <>
          <button
            onClick={onRemind}
            className="flex h-9 items-center gap-2 rounded-lg border border-app-border bg-white px-3.5 text-[13px] font-semibold text-app-ink transition hover:brightness-105"
          >
            <BellRing size={15} /> Send Reminder
          </button>
          <button
            onClick={onPrint}
            className="flex h-9 items-center gap-2 rounded-lg border border-app-border bg-white px-3.5 text-[13px] font-semibold text-app-ink transition hover:brightness-105"
          >
            <Printer size={15} /> Print Invoice
          </button>
          {balance > 0 && (
            <button
              onClick={onRecord}
              className="flex h-9 items-center gap-2 rounded-lg bg-action px-4 text-[13px] font-semibold text-white transition hover:bg-action-hover"
            >
              <Banknote size={15} /> Record Payment
            </button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <div className="text-sm text-app-slate">{client?.name ?? '—'}</div>
          <div className={cn('mt-1 text-[28px] font-bold tabular-nums', balance > 0 ? 'text-danger' : 'text-success')}>
            {formatKES(balance)}
          </div>
          <div className="text-xs uppercase tracking-[0.06em] text-app-muted">Balance due</div>
        </div>

        {/* Summary box */}
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-app-border bg-app-bg p-4 text-sm">
          {[
            { label: 'Amount', value: formatKES(invoice.total) },
            { label: 'Paid', value: formatKES(invoice.amountPaid) },
            { label: 'Balance', value: formatKES(balance) },
            { label: 'Days overdue', value: overdueDays > 0 ? `${overdueDays} days` : '—' },
          ].map((r) => (
            <div key={r.label}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-app-muted">{r.label}</div>
              <div className="mt-0.5 font-semibold tabular-nums text-app-ink">{r.value}</div>
            </div>
          ))}
          <div className="col-span-2 text-xs text-app-muted">
            Issued {formatDateTime(invoice.issueDate)} · Due {formatDate(invoice.dueDate)}
          </div>
        </div>

        {/* Payment timeline */}
        <div>
          <h4 className="mb-1 text-[15px] font-semibold text-app-ink">Payment timeline</h4>
          <div>
            <AnimatePresence initial={false}>
              {timeline.map((entry, i) => (
                <TimelineItem key={entry.id} entry={entry} index={i} />
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Receipts */}
        <div>
          <h4 className="mb-2 text-[15px] font-semibold text-app-ink">Receipts</h4>
          {receipts.length === 0 ? (
            <p className="text-sm text-app-muted">No receipts yet — they are generated automatically when a payment is recorded.</p>
          ) : (
            <ul className="space-y-1.5">
              {receipts.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between rounded-lg border border-app-border bg-white px-3 py-2"
                >
                  <span className="flex items-center gap-2">
                    <ReceiptIcon size={14} className="text-success" />
                    <span className="font-mono text-[13px] font-semibold text-navy-800">{r.docNo}</span>
                    <span className="text-xs tabular-nums text-app-slate">{formatKES(r.total)}</span>
                  </span>
                  <button
                    onClick={() => onViewReceipt(r.id)}
                    className="text-[12px] font-semibold text-action transition hover:underline"
                  >
                    View Receipt
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Drawer>
  );
}
