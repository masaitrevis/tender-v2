/**
 * Contracts & Milestones — /contracts
 * Running contracts, deliverables, payment triggers, retention & variation orders.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FileSignature, Flag, Banknote, Gauge, Plus, Download, Check, Circle, CircleDot,
  AlertTriangle, FileText, ReceiptText, GitPullRequest, Lock,
} from 'lucide-react';
import {
  useStore, addItem, updateItem, uid, daysUntil, nowISO, nextDocNumber, TODAY,
  type ContractMilestone, type FbvDocument,
} from '@/lib/store';
import { formatKES, formatKESCompact, formatDate } from '@/lib/format';
import {
  PageHeader, StatChip, Pill, Drawer, Modal, ConfirmDialog, EmptyState, TimelineItem,
  Field, TextInput, DateInput, CurrencyInput, SelectInput,
} from '@/components/shared';
import { BTN_GREEN, BTN_PRIMARY, BTN_SECONDARY, BTN_SM, Card, downloadCSV, useToasts } from '@/components/trackers/ui';
import { cn } from '@/lib/utils';

type ContractStatus = 'Active' | 'Completed' | 'Terminated';

function contractStatus(d: FbvDocument): ContractStatus {
  if (d.status === 'Cancelled') return 'Terminated';
  if (d.status === 'Paid') return 'Completed';
  return 'Active';
}

function milestoneTone(m: ContractMilestone): { dot: string; label: string } {
  if (m.status === 'Complete') return { dot: 'bg-success', label: 'Done' };
  if (m.status === 'Overdue' || daysUntil(m.dueDate) < 0) return { dot: 'bg-danger', label: 'Overdue' };
  if (m.status === 'In Progress') return { dot: 'bg-info', label: 'In Progress' };
  if (daysUntil(m.dueDate) <= 30) return { dot: 'bg-warning', label: 'Due soon' };
  return { dot: 'bg-grey', label: 'Pending' };
}

interface ContractView {
  doc: FbvDocument;
  status: ContractStatus;
  title: string;
  clientName: string;
  milestones: ContractMilestone[];
  completion: number; // 0–100
  invoiced: number;
  periodEnd?: string;
}

export default function Contracts() {
  const s = useStore();
  const navigate = useNavigate();
  const toasts = useToasts();
  const [openId, setOpenId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const contracts = useMemo<ContractView[]>(() => {
    return s.documents
      .filter((d) => d.type === 'contract')
      .map((doc) => {
        const milestones = s.milestones
          .filter((m) => m.contractId === doc.id)
          .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
        const clientName = s.clients.find((c) => c.id === doc.clientId)?.name ?? 'Unknown client';
        const title = milestones[0]?.contractTitle ?? doc.lines[0]?.description ?? doc.docNo;
        const completion = milestones.length
          ? Math.round((milestones.filter((m) => m.status === 'Complete').length / milestones.length) * 100)
          : 0;
        const invoiced = milestones.filter((m) => m.status === 'Complete').reduce((a, m) => a + (m.amount ?? 0), 0);
        const periodEnd = milestones.length ? milestones[milestones.length - 1].dueDate : undefined;
        return { doc, status: contractStatus(doc), title, clientName, milestones, completion, invoiced, periodEnd };
      });
  }, [s]);

  const stats = useMemo(() => {
    const running = contracts.filter((c) => c.status === 'Active').length;
    const dueSoon = s.milestones.filter(
      (m) => m.status !== 'Complete' && daysUntil(m.dueDate) <= 30,
    ).length;
    const value = contracts.reduce((a, c) => a + c.doc.total, 0);
    const avg = contracts.length ? Math.round(contracts.reduce((a, c) => a + c.completion, 0) / contracts.length) : 0;
    return { running, dueSoon, value, avg };
  }, [contracts, s.milestones]);

  const openContract = contracts.find((c) => c.doc.id === openId) ?? null;

  const exportCsv = () => {
    downloadCSV(
      'fbv-contracts.csv',
      ['Contract Ref', 'Title', 'Client', 'Status', 'Value (KES)', 'Invoiced (KES)', 'Completion %', 'Issue Date'],
      contracts.map((c) => [c.doc.docNo, c.title, c.clientName, c.status, c.doc.total, c.invoiced, c.completion, c.doc.issueDate]),
    );
    toasts.push(`Exported ${contracts.length} contracts to CSV`);
  };

  return (
    <div className="px-7 pb-8 pt-6">
      {toasts.node}
      <PageHeader
        title="Contracts & Milestones"
        subtitle="Running contracts, deliverables and payment triggers."
        actions={
          <>
            <button onClick={exportCsv} className={BTN_SECONDARY}><Download size={15} /> Export CSV</button>
            <button onClick={() => setNewOpen(true)} className={BTN_PRIMARY}><Plus size={15} /> New Contract</button>
          </>
        }
      />

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { icon: <FileSignature size={17} />, value: stats.running, label: 'Running', variant: 'green' as const },
          { icon: <Flag size={17} />, value: stats.dueSoon, label: 'Milestones Due ≤30d', variant: 'amber' as const },
          { icon: <Banknote size={17} />, value: formatKESCompact(stats.value), label: 'Contract Value', variant: 'navy' as const },
          { icon: <Gauge size={17} />, value: `${stats.avg}%`, label: 'Avg Completion', variant: 'blue' as const },
        ].map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: i * 0.05, ease: 'easeOut' }}>
            <StatChip icon={c.icon} value={c.value} label={c.label} variant={c.variant} />
          </motion.div>
        ))}
      </div>

      {contracts.length === 0 ? (
        <Card>
          <EmptyState
            title="No contracts yet"
            hint="Won tenders convert into contracts with milestone payment schedules."
            action={<button onClick={() => setNewOpen(true)} className={BTN_PRIMARY}><Plus size={15} /> New Contract</button>}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {contracts.map((c, i) => {
            const next3 = c.milestones.filter((m) => m.status !== 'Complete').slice(0, 3);
            return (
              <motion.div
                key={c.doc.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: i * 0.07, ease: 'easeOut' }}
                className="rounded-xl border border-app-border bg-app-card p-5 shadow-card transition-all duration-150 hover:-translate-y-0.5 hover:shadow-card-hover"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[13px] font-medium text-navy-800">{c.doc.docNo}</span>
                  <span className="rounded-full bg-app-bg px-2.5 py-1 text-xs font-medium text-app-slate">{c.clientName}</span>
                  <span className="ml-auto"><Pill status={c.status} /></span>
                </div>
                <h3 className="mt-2 text-[15px] font-semibold text-app-ink">{c.title}</h3>
                <div className="mt-1 flex items-baseline gap-3">
                  <span className="text-lg font-bold text-app-ink tnum">{formatKES(c.doc.total)}</span>
                  <span className="text-xs text-app-muted tnum">
                    {formatDate(c.doc.issueDate)}{c.periodEnd ? ` → ${formatDate(c.periodEnd)}` : ''}
                  </span>
                </div>
                {/* completion bar */}
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="font-medium text-app-slate">Completion</span>
                    <span className="font-semibold text-app-ink tnum">{c.completion}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-app-bg">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${c.completion}%` }}
                      transition={{ duration: 0.9, ease: 'easeOut', delay: 0.2 + i * 0.07 }}
                      className="h-full rounded-full bg-gold"
                    />
                  </div>
                </div>
                {/* next milestones */}
                <div className="mt-4 space-y-2">
                  {next3.length === 0 && <p className="text-xs text-app-muted">All milestones complete.</p>}
                  {next3.map((m) => {
                    const tone = milestoneTone(m);
                    return (
                      <div key={m.id} className="flex items-center gap-2 text-[13px]">
                        <span className={cn('h-2 w-2 shrink-0 rounded-full', tone.dot)} />
                        <span className="min-w-0 flex-1 truncate text-app-ink">{m.title}</span>
                        <span className="text-xs text-app-muted tnum">{formatDate(m.dueDate)}</span>
                        {m.amount != null && <span className="text-xs font-semibold text-app-slate tnum">{formatKESCompact(m.amount)}</span>}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 flex gap-2 border-t border-app-border pt-3">
                  <button onClick={() => setOpenId(c.doc.id)} className={BTN_PRIMARY}>Open</button>
                  <button onClick={() => navigate('/documents/new/invoice')} className={BTN_SECONDARY}>
                    <ReceiptText size={14} /> Record Invoice
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <ContractDrawer
        contract={openContract}
        onClose={() => setOpenId(null)}
        onToast={toasts.push}
        onGoInvoice={() => navigate('/documents/new/invoice')}
      />
      <NewContractModal open={newOpen} onClose={() => setNewOpen(false)} onSaved={(ref) => toasts.push(`Contract ${ref} created`)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Contract detail drawer (640px)                                       */
/* ------------------------------------------------------------------ */

function ContractDrawer({ contract, onClose, onToast, onGoInvoice }: {
  contract: ContractView | null;
  onClose: () => void;
  onToast: (msg: string, opts?: { kind?: 'success' | 'error' }) => void;
  onGoInvoice: () => void;
}) {
  const s = useStore();
  const [tab, setTab] = useState<'milestones' | 'documents' | 'timeline'>('milestones');
  const [completeFor, setCompleteFor] = useState<ContractMilestone | null>(null);
  const [addMsOpen, setAddMsOpen] = useState(false);
  const [addVoOpen, setAddVoOpen] = useState(false);
  const [msTitle, setMsTitle] = useState('');
  const [msDate, setMsDate] = useState('');
  const [msAmount, setMsAmount] = useState('');
  const [voTitle, setVoTitle] = useState('');
  const [voAmount, setVoAmount] = useState('');

  const docs = useMemo(() => {
    if (!contract) return [];
    return s.documents.filter((d) => d.tenderId != null && d.tenderId === contract.doc.tenderId && d.id !== contract.doc.id);
  }, [s, contract]);

  const variations = useMemo(() => {
    if (!contract) return [];
    return s.approvals.filter((a) => a.type === 'Change Request' && a.title.startsWith(contract.doc.docNo));
  }, [s, contract]);

  const activity = useMemo(() => {
    if (!contract) return [];
    return s.activity.filter((a) => a.ref === contract.doc.docNo || a.text.includes(contract.doc.docNo)).slice(0, 12);
  }, [s, contract]);

  if (!contract) return <Drawer open={false} onClose={onClose}>{null}</Drawer>;

  const balance = Math.max(0, contract.doc.total - contract.invoiced);
  const retention = Math.round(contract.doc.total * 0.1);

  const doComplete = (invoice: boolean) => {
    const m = completeFor;
    if (!m) return;
    updateItem('milestones', m.id, { status: 'Complete', completedDate: TODAY }, {
      action: 'Updated', entity: 'Contract Milestone', entityRef: m.title,
      details: `Milestone completed — ${m.title} (${contract.doc.docNo})`, verb: 'Completed', verbColor: 'green',
    });
    onToast(`Milestone "${m.title}" marked complete`);
    setCompleteFor(null);
    if (invoice) onGoInvoice();
  };

  const addMilestone = () => {
    if (!msTitle.trim() || !msDate) return;
    const item: ContractMilestone = {
      id: uid('mil'),
      contractId: contract.doc.id,
      contractTitle: contract.title,
      clientId: contract.doc.clientId,
      title: msTitle.trim(),
      dueDate: msDate,
      amount: msAmount ? Number(msAmount) : undefined,
      status: 'Pending',
    };
    addItem('milestones', item, {
      action: 'Created', entity: 'Contract Milestone', entityRef: item.title,
      details: `Milestone added to ${contract.doc.docNo} — ${item.title} (due ${formatDate(msDate)})`, verb: 'Created', verbColor: 'grey',
    });
    onToast(`Milestone "${item.title}" added`);
    setMsTitle(''); setMsDate(''); setMsAmount(''); setAddMsOpen(false);
  };

  const addVariation = () => {
    if (!voTitle.trim()) return;
    const refNo = nextDocNumber('FBV-APR');
    addItem('approvals', {
      id: uid('apr'),
      refNo,
      type: 'Change Request',
      title: `${contract.doc.docNo} — ${voTitle.trim()}`,
      amount: voAmount ? Number(voAmount) : undefined,
      requestedBy: 'Admin User',
      requestedAt: nowISO(),
      status: 'Pending',
    }, {
      action: 'Created', entity: 'Approval', entityRef: refNo,
      details: `Variation order raised on ${contract.doc.docNo} — ${voTitle.trim()}`, verb: 'Submitted', verbColor: 'navy',
    });
    onToast('Variation order submitted for approval');
    setVoTitle(''); setVoAmount(''); setAddVoOpen(false);
  };

  return (
    <>
      <Drawer
        open
        onClose={onClose}
        width="w-[640px]"
        title={
          <span className="flex items-center gap-2">
            <span className="font-mono text-[13px] text-navy-800">{contract.doc.docNo}</span>
            <Pill status={contract.status} />
          </span>
        }
      >
        <div className="mb-1 text-[15px] font-semibold text-app-ink">{contract.title}</div>
        <p className="mb-4 text-sm text-app-slate">{contract.clientName} · issued {formatDate(contract.doc.issueDate)}</p>

        {/* KPI strip */}
        <div className="mb-5 grid grid-cols-4 gap-2">
          {[
            { label: 'Value', value: formatKESCompact(contract.doc.total) },
            { label: 'Invoiced', value: formatKESCompact(contract.invoiced) },
            { label: 'Balance', value: formatKESCompact(balance) },
            { label: '% Complete', value: `${contract.completion}%` },
          ].map((k) => (
            <div key={k.label} className="rounded-lg border border-app-border bg-app-bg px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-app-muted">{k.label}</div>
              <div className="mt-0.5 text-[15px] font-bold text-app-ink tnum">{k.value}</div>
            </div>
          ))}
        </div>

        {/* Retention + variations strip */}
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-gold/30 bg-gold-soft px-3 py-2.5">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-navy-800">
            <Lock size={13} className="text-gold" /> Retention held (est. 10%): <span className="tnum">{formatKES(retention)}</span>
          </span>
          <span className="text-xs text-app-slate">· released after handover &amp; defect-liability period</span>
          <button onClick={() => setAddVoOpen(true)} className={cn(BTN_SM, 'ml-auto')}>
            <GitPullRequest size={13} /> Add Variation Order
          </button>
        </div>

        {/* Tabs */}
        <div className="mb-4 flex gap-1 border-b border-app-border">
          {(['milestones', 'documents', 'timeline'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'relative px-3 pb-2 text-[13px] font-semibold capitalize transition',
                tab === t ? 'text-action' : 'text-app-slate hover:text-app-ink',
              )}
            >
              {t}
              {tab === t && <motion.span layoutId="contract-tab" className="absolute inset-x-0 -bottom-px h-0.5 bg-action" />}
            </button>
          ))}
        </div>

        {tab === 'milestones' && (
          <div>
            {variations.length > 0 && (
              <div className="mb-4 rounded-lg border border-purple/30 bg-purple-soft px-3 py-2">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-purple">Variation Orders</div>
                {variations.map((v) => (
                  <div key={v.id} className="flex items-center gap-2 py-1 text-[13px]">
                    <span className="min-w-0 flex-1 truncate text-app-ink">{v.title.replace(`${contract.doc.docNo} — `, '')}</span>
                    {v.amount != null && <span className="text-xs font-semibold tnum">{formatKES(v.amount)}</span>}
                    <Pill status={v.status} />
                  </div>
                ))}
              </div>
            )}
            {contract.milestones.length === 0 ? (
              <EmptyState title="No milestones yet" hint="Break the contract into deliverables with payment triggers." />
            ) : (
              <div>
                {contract.milestones.map((m, i) => {
                  const tone = milestoneTone(m);
                  const done = m.status === 'Complete';
                  return (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, delay: i * 0.08 }}
                      className="flex gap-3 pb-4"
                    >
                      <div className="flex flex-col items-center pt-1">
                        {done ? (
                          <motion.span initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                            className="flex h-5 w-5 items-center justify-center rounded-full bg-success text-white">
                            <Check size={12} />
                          </motion.span>
                        ) : tone.label === 'Overdue' ? (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-danger text-white"><AlertTriangle size={11} /></span>
                        ) : m.status === 'In Progress' ? (
                          <CircleDot size={18} className="text-info" />
                        ) : (
                          <Circle size={18} className={tone.label === 'Due soon' ? 'text-warning' : 'text-app-border'} />
                        )}
                        {i < contract.milestones.length - 1 && <span className="mt-1 w-px flex-1 bg-app-border" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={cn('text-sm font-semibold', done ? 'text-app-muted line-through' : 'text-app-ink')}>{m.title}</span>
                          <Pill tone={done ? 'green' : tone.label === 'Overdue' ? 'red' : tone.label === 'In Progress' ? 'blue' : tone.label === 'Due soon' ? 'amber' : 'grey'}>
                            {tone.label}
                          </Pill>
                        </div>
                        <div className="mt-0.5 text-xs text-app-muted tnum">
                          Due {formatDate(m.dueDate)}
                          {done && m.completedDate ? ` · completed ${formatDate(m.completedDate)}` : ''}
                        </div>
                        {m.amount != null && (
                          <div className="mt-1 text-[13px] font-semibold text-navy-800 tnum">
                            Payment trigger: {formatKES(m.amount)} on completion
                          </div>
                        )}
                        {!done && (
                          <button onClick={() => setCompleteFor(m)} className={cn(BTN_GREEN, 'mt-2 h-8 px-3 text-xs')}>
                            <Check size={13} /> Mark complete
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
            <button onClick={() => setAddMsOpen(true)} className={BTN_SECONDARY}>
              <Plus size={14} /> Add Milestone
            </button>
          </div>
        )}

        {tab === 'documents' && (
          <div className="space-y-2">
            <div className="flex items-center gap-3 rounded-lg border border-app-border px-3 py-2.5">
              <FileText size={16} className="shrink-0 text-navy-800" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-app-ink">{contract.doc.docNo} — signed contract</div>
                <div className="text-xs text-app-muted">Contract document · {formatDate(contract.doc.issueDate)}</div>
              </div>
              <Pill status={contract.doc.status} />
            </div>
            {docs.map((d) => (
              <div key={d.id} className="flex items-center gap-3 rounded-lg border border-app-border px-3 py-2.5">
                <ReceiptText size={16} className="shrink-0 text-info" />
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[13px] font-medium text-navy-800">{d.docNo}</div>
                  <div className="text-xs text-app-muted capitalize">{d.type} · {formatDate(d.issueDate)} · {formatKES(d.total)}</div>
                </div>
                <Pill status={d.status} />
              </div>
            ))}
            {docs.length === 0 && <p className="py-3 text-sm text-app-muted">No invoices or related documents generated yet.</p>}
          </div>
        )}

        {tab === 'timeline' && (
          <div>
            {activity.length === 0 ? (
              <p className="py-3 text-sm text-app-muted">No activity recorded for this contract yet.</p>
            ) : (
              activity.map((a, i) => <TimelineItem key={a.id} entry={a} index={i} />)
            )}
          </div>
        )}
      </Drawer>

      {/* Mark complete → offer invoice generation */}
      <ConfirmDialog
        open={completeFor != null}
        onClose={() => setCompleteFor(null)}
        onConfirm={() => doComplete(true)}
        title="Milestone complete"
        message={
          completeFor?.amount
            ? `Mark "${completeFor.title}" complete and generate an invoice for ${formatKES(completeFor.amount)}? (Opens the Document Center.)`
            : `Mark "${completeFor?.title}" complete?`
        }
        confirmLabel={completeFor?.amount ? 'Complete & Generate Invoice' : 'Mark Complete'}
      />
      {/* Hidden secondary path: complete without invoice via cancel is fine; offer both */}
      <Modal
        open={addMsOpen}
        onClose={() => setAddMsOpen(false)}
        title="Add Milestone"
        footer={
          <>
            <button onClick={() => setAddMsOpen(false)} className={BTN_SECONDARY}>Cancel</button>
            <button onClick={addMilestone} disabled={!msTitle.trim() || !msDate} className={BTN_PRIMARY}>Add Milestone</button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Deliverable / milestone title" required>
            <TextInput value={msTitle} onChange={(e) => setMsTitle(e.target.value)} placeholder="e.g. Phase 3 delivery — laboratory reagents" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Due date" required>
              <DateInput value={msDate} onChange={(e) => setMsDate(e.target.value)} />
            </Field>
            <Field label="Payment trigger amount" hint="Optional — invoiced on completion.">
              <CurrencyInput value={msAmount} onChange={setMsAmount} />
            </Field>
          </div>
        </div>
      </Modal>
      <Modal
        open={addVoOpen}
        onClose={() => setAddVoOpen(false)}
        title="Add Variation Order"
        footer={
          <>
            <button onClick={() => setAddVoOpen(false)} className={BTN_SECONDARY}>Cancel</button>
            <button onClick={addVariation} disabled={!voTitle.trim()} className={BTN_PRIMARY}>Submit for Approval</button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Variation description" required>
            <TextInput value={voTitle} onChange={(e) => setVoTitle(e.target.value)} placeholder="e.g. Additional 4 CCTV cameras — parking wing" />
          </Field>
          <Field label="Value impact" hint="Optional — priced change to the contract sum.">
            <CurrencyInput value={voAmount} onChange={setVoAmount} />
          </Field>
          <p className="rounded-lg bg-purple-soft px-3 py-2 text-xs text-app-slate">
            Variation orders route through the Approval Workflow as Change Requests before the contract sum is adjusted.
          </p>
        </div>
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* New Contract modal                                                   */
/* ------------------------------------------------------------------ */

function NewContractModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (ref: string) => void }) {
  const s = useStore();
  const [clientId, setClientId] = useState('');
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const [issueDate, setIssueDate] = useState(nowISO().slice(0, 10));
  const [error, setError] = useState('');

  const save = () => {
    if (!clientId) return setError('Client is required');
    if (!title.trim()) return setError('Contract title is required');
    if (!value || Number(value) <= 0) return setError('Value must be a positive number');
    const gross = Number(value);
    const net = Math.round((gross / 1.16) * 100) / 100;
    const docNo = nextDocNumber('FBV-CON');
    const doc: FbvDocument = {
      id: uid('doc'),
      docNo,
      type: 'contract',
      clientId,
      issueDate,
      status: 'Issued',
      lines: [{ id: uid('ln'), description: title.trim(), qty: 1, unit: 'lot', unitPrice: net, amount: net }],
      subtotal: net,
      vatAmount: Math.round((gross - net) * 100) / 100,
      total: gross,
      amountPaid: 0,
      createdAt: nowISO(),
    };
    addItem('documents', doc, {
      action: 'Created', entity: 'Document', entityRef: docNo,
      details: `Contract ${docNo} created — ${title.trim()} (${formatKES(gross)})`, verb: 'Created', verbColor: 'navy',
    });
    onSaved(docNo);
    setClientId(''); setTitle(''); setValue(''); setError('');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Contract"
      footer={
        <>
          <button onClick={onClose} className={BTN_SECONDARY}>Cancel</button>
          <button onClick={save} className={BTN_PRIMARY}>Create Contract</button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Client" required error={error === 'Client is required' ? error : undefined}>
          <SelectInput
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            options={[{ value: '', label: '— Select client —' }, ...s.clients.filter((c) => c.status === 'Active').map((c) => ({ value: c.id, label: c.name }))]}
          />
        </Field>
        <Field label="Contract title" required error={error === 'Contract title is required' ? error : undefined}>
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Framework contract — office stationery (12 months)" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Contract value (incl. VAT)" required error={error === 'Value must be a positive number' ? error : undefined}>
            <CurrencyInput value={value} onChange={setValue} />
          </Field>
          <Field label="Start date" required>
            <DateInput value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </Field>
        </div>
        <p className="rounded-lg bg-app-bg px-3 py-2 text-xs text-app-muted">
          Milestones and payment triggers are added from the contract drawer after creation.
        </p>
      </div>
    </Modal>
  );
}
