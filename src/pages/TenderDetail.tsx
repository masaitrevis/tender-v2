/** Tender Detail — /tenders/:id
 *  Status-colored header, KPI strip, and tabs: Overview / Workflow / Documents / Timeline.
 *  Status transitions confirm Won (offers contract generation) and Lost (lost-reason select). */
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle, ArrowLeft, ArrowUpRight, Ban, CalendarClock, Circle, CircleCheck,
  ClipboardCheck, Copy, FileText, Gauge, Landmark, MoreHorizontal, Paperclip, Pencil,
  Plus, Scale, Trash2, Trophy,
} from 'lucide-react';
import {
  useStore, updateItem, removeItem, addItem, reserveDocNumber, nowISO, uid, daysUntil, TODAY,
} from '@/lib/store';
import type { ActivityEntry, TenderStatus } from '@/lib/store';
import { formatKES, formatKESCompact, formatDate, formatDateTime } from '@/lib/format';
import {
  Pill, CountdownChip, ExpiryBadge, EmptyState, ConfirmDialog, Modal, Drawer,
  Field, SelectInput, TextareaInput, TimelineItem, TextInput,
} from '@/components/shared';
import {
  useExtras, setTenderExtras, latestBidDecision, latestEstimate, computeTotals, getExtras,
} from '@/components/tenders/extras';
import { TenderFormDrawer } from '@/components/tenders/TenderFormDrawer';
import { Avatar, Btn, Card, PageEnter, SectionTitle, STATUS_HEX, CountUp } from '@/components/tenders/ui';
import { cn } from '@/lib/utils';

type TabKey = 'overview' | 'workflow' | 'documents' | 'timeline';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'workflow', label: 'Workflow' },
  { key: 'documents', label: 'Documents' },
  { key: 'timeline', label: 'Timeline' },
];

const STATUS_OPTIONS: TenderStatus[] = ['Open', 'Submitted', 'Under Evaluation', 'Won', 'Lost', 'Cancelled'];
const LOST_REASONS = ['Price', 'Technical', 'Late', 'Other'];
const RISK_CATEGORIES = ['Financial', 'Compliance', 'Supply Chain', 'Operational', 'Technical', 'Other'];

const DOC_TYPE_LABEL: Record<string, string> = {
  quotation: 'Quotation', proforma: 'Proforma', invoice: 'Invoice',
  receipt: 'Receipt', 'purchase-order': 'Purchase Order', contract: 'Contract',
};

export default function TenderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const state = useStore();
  const extras = useExtras();

  const tender = state.tenders.find((t) => t.id === id);
  const ex = tender ? extras.tenders[tender.id] : undefined;
  const client = tender ? state.clients.find((c) => c.id === tender.clientId) : undefined;
  const officer = ex?.assignedOfficerId ? state.employees.find((e) => e.id === ex.assignedOfficerId) : undefined;
  const bond = tender ? state.bonds.find((b) => b.tenderId === tender.id) : undefined;
  const assessment = tender ? extras.eligibility[tender.id] : undefined;
  const decision = tender ? latestBidDecision(tender.id, extras) : undefined;
  const estimate = tender ? latestEstimate(tender.id, extras) : undefined;
  const estimateTotals = estimate ? computeTotals(estimate, state.settings.vatRate) : undefined;

  const [tab, setTab] = useState<TabKey>('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [wonConfirm, setWonConfirm] = useState(false);
  const [contractPrompt, setContractPrompt] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState('Price');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [riskOpen, setRiskOpen] = useState(false);
  const [contractDocNo, setContractDocNo] = useState<string | null>(null);

  const linkedDocs = useMemo(
    () => (tender ? state.documents.filter((d) => d.tenderId === tender.id) : []),
    [state.documents, tender],
  );
  const attachments = useMemo(
    () => (tender ? state.dms.filter((d) => d.notes?.includes(tender.refNo)) : []),
    [state.dms, tender],
  );
  const linkedRisks = useMemo(() => {
    if (!tender || !client) return [];
    return state.risks.filter(
      (r) => r.title.includes(client.name.split(' ')[0]) || r.description.includes(tender.refNo) || r.title.includes(tender.refNo),
    );
  }, [state.risks, tender, client]);
  const timeline = useMemo(() => {
    if (!tender) return [] as ActivityEntry[];
    const entries = state.activity.filter((a) => a.ref === tender.refNo);
    const created: ActivityEntry = {
      id: `act-created-${tender.id}`,
      timestamp: tender.createdAt,
      verb: 'Created',
      verbColor: 'grey',
      ref: tender.refNo,
      text: `Tender registered — ${tender.title}`,
      user: 'Admin User',
    };
    return [...entries, created].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [state.activity, tender]);

  if (!tender) {
    return (
      <PageEnter>
        <Card>
          <EmptyState
            title="Tender not found"
            hint="It may have been deleted from the register."
            action={<Btn onClick={() => navigate('/tenders')}><ArrowLeft size={15} /> Back to register</Btn>}
          />
        </Card>
      </PageEnter>
    );
  }

  const days = daysUntil(tender.submissionDeadline);
  const winProb = ex?.winProbability ?? 50;

  const applyStatus = (s: TenderStatus, reason?: string) => {
    updateItem('tenders', tender.id, { status: s, awardDate: s === 'Won' ? TODAY : tender.awardDate }, {
      entityRef: tender.refNo,
      details: `Status changed to ${s} — ${tender.refNo}${reason ? ` (${reason})` : ''}`,
      verb: s === 'Won' ? 'Marked Won' : s === 'Lost' ? 'Marked Lost' : 'Updated',
      verbColor: s === 'Won' ? 'gold' : s === 'Lost' ? 'red' : 'blue',
    });
    if (reason) setTenderExtras(tender.id, { lostReason: reason });
  };

  const onStatusSelect = (s: TenderStatus) => {
    if (s === tender.status) return;
    if (s === 'Won') setWonConfirm(true);
    else if (s === 'Lost') setLostOpen(true);
    else applyStatus(s);
  };

  const generateContract = async () => {
    const docNo = await reserveDocNumber('FBV-CON');
    const subtotal = tender.value;
    const vatAmount = Math.round(subtotal * (state.settings.vatRate / 100) * 100) / 100;
    addItem('documents', {
      id: uid('doc'),
      docNo,
      type: 'contract',
      clientId: tender.clientId,
      tenderId: tender.id,
      issueDate: TODAY,
      status: 'Draft',
      lines: [{ id: uid('ln'), description: `Contract — ${tender.title}`, qty: 1, unit: 'lot', unitPrice: subtotal, amount: subtotal }],
      subtotal,
      vatAmount,
      total: subtotal + vatAmount,
      amountPaid: 0,
      createdAt: nowISO(),
    }, {
      entityRef: docNo,
      details: `Contract ${docNo} generated from tender ${tender.refNo}`,
      verb: 'Generated',
      verbColor: 'gold',
    });
    setContractDocNo(docNo);
  };

  const duplicate = async () => {
    const newId = uid('tnd');
    const refNo = await reserveDocNumber('FBV-TND');
    addItem('tenders', { ...tender, id: newId, refNo, title: `${tender.title} (Copy)`, status: 'Open', createdAt: nowISO() }, {
      entityRef: refNo, details: `Duplicated tender ${tender.refNo} → ${refNo}`, verb: 'Created', verbColor: 'grey',
    });
    const cur = getExtras().tenders[tender.id];
    if (cur) setTenderExtras(newId, cur);
    setMenuOpen(false);
    navigate(`/tenders/${newId}`);
  };

  /* workflow steps */
  const quotation = linkedDocs.find((d) => d.type === 'quotation');
  const submittedDone = ['Submitted', 'Under Evaluation', 'Won', 'Lost'].includes(tender.status);
  const evalDone = ['Under Evaluation', 'Won', 'Lost'].includes(tender.status);
  const finalDone = tender.status === 'Won' || tender.status === 'Lost';
  const steps: Array<{ label: string; done: boolean; caption: string; to?: string }> = [
    { label: 'Registered', done: true, caption: formatDate(tender.createdAt) },
    {
      label: 'Eligibility', done: Boolean(assessment),
      caption: assessment ? `${assessment.score}% · ${assessment.verdict}` : 'Not checked yet',
      to: `/eligibility?tender=${tender.id}`,
    },
    {
      label: 'Bid Decision', done: Boolean(decision),
      caption: decision ? `${decision.verdict === 'NO-BID' ? 'Do Not Bid' : decision.verdict === 'CAUTION' ? 'Bid with Caution' : 'BID'} ${decision.score}%` : 'No decision yet',
      to: `/bid-decision?tender=${tender.id}`,
    },
    {
      label: 'Estimate', done: Boolean(estimate),
      caption: estimate && estimateTotals ? `BOQ bid ${formatKESCompact(estimateTotals.total)}` : 'No estimate yet',
      to: `/estimation?tender=${tender.id}`,
    },
    {
      label: 'Quotation', done: Boolean(quotation),
      caption: quotation ? quotation.docNo : 'Not generated',
      to: '/documents',
    },
    { label: 'Submitted', done: submittedDone, caption: ex?.submittedDate ? formatDate(ex.submittedDate) : submittedDone ? 'Bid submitted' : `due ${formatDate(tender.submissionDeadline)}` },
    { label: 'Evaluation', done: evalDone, caption: evalDone ? 'Client evaluation' : 'Awaiting submission' },
    {
      label: tender.status === 'Lost' ? 'Lost' : 'Won',
      done: finalDone,
      caption: tender.status === 'Won' ? `awarded ${formatDate(tender.awardDate)}` : tender.status === 'Lost' ? (ex?.lostReason ? `lost — ${ex.lostReason}` : 'lost') : 'Pending outcome',
    },
  ];
  const currentIdx = steps.findIndex((s) => !s.done);

  return (
    <PageEnter>
      {/* back */}
      <button
        onClick={() => navigate('/tenders')}
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-app-slate transition hover:text-action"
      >
        <ArrowLeft size={15} /> Tender Register
      </button>

      {/* header card */}
      <Card className="overflow-hidden" >
        <div className="h-1" style={{ backgroundColor: STATUS_HEX[tender.status] }} />
        <div className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-medium text-navy-800">{tender.refNo}</span>
              <Pill status={tender.status} />
              {tender.status === 'Open' && <CountdownChip date={tender.submissionDeadline} pulse={days < 0} />}
            </div>
            <h1 className="mt-1.5 text-[18px] font-bold leading-6 text-app-ink">{tender.title}</h1>
            {client && (
              <Link
                to="/clients"
                className="mt-1 inline-flex items-center gap-1 rounded-full bg-grey-soft px-2.5 py-1 text-xs font-medium text-app-slate transition hover:bg-[#E4EBF4] hover:text-navy-800"
              >
                {client.name} <ArrowUpRight size={11} />
              </Link>
            )}
          </div>
          <div className="flex items-center gap-2">
            <SelectInput
              options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))}
              value={tender.status}
              onChange={(e) => onStatusSelect(e.target.value as TenderStatus)}
              className="h-9 w-[170px]"
            />
            <Btn variant="secondary" onClick={() => setEditOpen(true)}><Pencil size={14} /> Edit</Btn>
            <div className="relative">
              <Btn variant="secondary" onClick={() => setMenuOpen((v) => !v)} aria-label="More actions">
                <MoreHorizontal size={15} />
              </Btn>
              {menuOpen && (
                <div
                  className="absolute right-0 top-11 z-20 w-48 rounded-xl border border-app-border bg-white p-1 shadow-card-hover"
                  onMouseLeave={() => setMenuOpen(false)}
                >
                  <button onClick={duplicate} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] text-app-ink hover:bg-app-bg">
                    <Copy size={14} /> Duplicate
                  </button>
                  <button
                    onClick={() => { setCancelOpen(true); setMenuOpen(false); }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] text-app-ink hover:bg-app-bg"
                  >
                    <Ban size={14} /> Cancel tender
                  </button>
                  <button
                    onClick={() => { setDeleteOpen(true); setMenuOpen(false); }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] text-danger hover:bg-danger-soft"
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 gap-3 border-t border-app-border bg-[#F8FAFC] p-4 lg:grid-cols-4">
          <Kpi icon={<Gauge size={16} />} label="Tender Value">
            <CountUp value={tender.value} format={(n) => formatKES(n)} className="text-[15px] font-bold text-app-ink tnum" />
          </Kpi>
          <Kpi icon={<Trophy size={16} />} label="Win Probability">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-[72px] overflow-hidden rounded-full bg-grey-soft">
                <motion.div className="h-full rounded-full bg-action" initial={{ width: 0 }} animate={{ width: `${winProb}%` }} transition={{ duration: 0.6, ease: 'easeOut' }} />
              </div>
              <span className="text-[15px] font-bold text-app-ink tnum">{winProb}%</span>
            </div>
          </Kpi>
          <Kpi icon={<Landmark size={16} />} label="Bid Bond">
            {bond ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[15px] font-bold text-app-ink tnum">{formatKESCompact(bond.amount)}</span>
                <ExpiryBadge date={bond.expiryDate} showDays={false} />
              </div>
            ) : (
              <span className="text-[15px] font-bold text-app-muted">None</span>
            )}
          </Kpi>
          <Kpi icon={<CalendarClock size={16} />} label="Days to Close">
            {tender.status === 'Open' ? (
              <span className={cn('text-[15px] font-bold tnum', days < 0 ? 'text-danger' : 'text-app-ink')}>
                {days < 0 ? `${Math.abs(days)}d overdue` : `${days} days`}
              </span>
            ) : (
              <span className="text-[15px] font-bold text-app-muted">Closed</span>
            )}
          </Kpi>
        </div>
      </Card>

      {/* tabs */}
      <div className="mb-5 mt-6 flex items-center gap-1 border-b border-app-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'relative px-4 py-2.5 text-[13px] font-semibold transition-colors',
              tab === t.key ? 'text-action' : 'text-app-slate hover:text-app-ink',
            )}
          >
            {t.label}
            {tab === t.key && (
              <motion.span
                layoutId="tender-detail-tab"
                className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-action"
                transition={{ type: 'spring', duration: 0.22 }}
              />
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          {tab === 'overview' && (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              {/* key-value grid */}
              <Card className="p-5 xl:col-span-2">
                <SectionTitle>Tender Details</SectionTitle>
                <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3">
                  <Kv k="Tender No" v={<span className="font-mono text-xs">{tender.refNo}</span>} />
                  <Kv k="Client" v={client?.name ?? '—'} />
                  <Kv k="Category" v={tender.category} />
                  <Kv k="Status" v={<Pill status={tender.status} />} />
                  <Kv k="Opening Date" v={formatDate(tender.publishedDate)} />
                  <Kv k="Closing Date" v={formatDate(tender.submissionDeadline)} />
                  <Kv k="Submission Date" v={ex?.submittedDate ? formatDate(ex.submittedDate) : '—'} />
                  <Kv k="Award Date" v={tender.awardDate ? formatDate(tender.awardDate) : '—'} />
                  <Kv k="Value" v={<span className="tnum">{formatKES(tender.value)}</span>} />
                  <Kv k="Bid Bond Amount" v={ex?.bidBondAmount != null ? <span className="tnum">{formatKES(ex.bidBondAmount)}</span> : '—'} />
                  <Kv k="Security Type" v={ex?.securityType ?? '—'} />
                  <Kv k="Department" v={ex?.department ?? '—'} />
                  <Kv
                    k="Assigned Officer"
                    v={officer ? (
                      <span className="flex items-center gap-2"><Avatar name={officer.name} size={22} /> {officer.name}</span>
                    ) : 'Unassigned'}
                  />
                  <Kv k="Win Probability" v={<span className="tnum">{winProb}%</span>} />
                  <Kv k="Lost Reason" v={ex?.lostReason ?? '—'} />
                </dl>

                <SectionTitle className="mt-6">Competitors</SectionTitle>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {ex?.competitors?.length ? (
                    ex.competitors.map((c) => (
                      <span key={c} className="rounded-full bg-grey-soft px-2.5 py-1 text-xs font-medium text-app-ink">{c}</span>
                    ))
                  ) : (
                    <span className="text-sm text-app-muted">No competitors recorded.</span>
                  )}
                </div>

                <SectionTitle className="mt-6">Notes</SectionTitle>
                <div className="mt-3 rounded-xl bg-app-bg p-4 text-sm leading-6 text-app-slate">
                  {tender.notes ?? 'No notes captured for this tender yet.'}
                </div>
              </Card>

              {/* right column: engine summaries + risks */}
              <div className="flex flex-col gap-4">
                <SummaryCard
                  icon={<ClipboardCheck size={16} className="text-action" />}
                  title="Eligibility"
                  to={`/eligibility?tender=${tender.id}`}
                >
                  {assessment ? (
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-[22px] font-bold text-app-ink tnum">{assessment.score}%</span>
                      <Pill tone={assessment.score >= 80 ? 'green' : assessment.score >= 50 ? 'amber' : 'red'}>{assessment.verdict}</Pill>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-app-muted">Not checked yet — run the 11-point checklist.</p>
                  )}
                  {assessment && <p className="mt-1 text-xs text-app-muted">{formatDateTime(assessment.timestamp)} · {assessment.assessor}</p>}
                </SummaryCard>

                <SummaryCard
                  icon={<Scale size={16} className="text-action" />}
                  title="Bid / No-Bid"
                  to={`/bid-decision?tender=${tender.id}`}
                >
                  {decision ? (
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-[22px] font-bold text-app-ink tnum">{decision.score}</span>
                      <Pill tone={decision.verdict === 'BID' ? 'green' : decision.verdict === 'CAUTION' ? 'amber' : 'red'}>
                        {decision.verdict === 'NO-BID' ? 'Do Not Bid' : decision.verdict === 'CAUTION' ? 'Bid with Caution' : 'BID'}
                      </Pill>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-app-muted">No decision yet — score the 10 weighted criteria.</p>
                  )}
                  {decision && <p className="mt-1 text-xs text-app-muted">{formatDateTime(decision.decidedAt)} · {decision.decidedBy}</p>}
                </SummaryCard>

                <Card className="p-5">
                  <div className="flex items-center justify-between">
                    <SectionTitle>Linked Risks</SectionTitle>
                    <Btn variant="secondary" size="sm" onClick={() => setRiskOpen(true)}><Plus size={13} /> Add risk</Btn>
                  </div>
                  <div className="mt-3 flex flex-col gap-2.5">
                    {linkedRisks.length === 0 && (
                      <p className="text-sm text-app-muted">No risks linked to this tender or client.</p>
                    )}
                    {linkedRisks.map((r) => (
                      <div key={r.id} className="rounded-xl border border-app-border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[13px] font-semibold text-app-ink">{r.title}</span>
                          <Pill status={r.status} />
                        </div>
                        <p className="mt-1 text-xs leading-5 text-app-slate">{r.description}</p>
                        <p className="mt-1 text-[11px] text-app-muted">
                          <span className="font-mono">{r.refNo}</span> · L{r.likelihood} × I{r.impact} · {r.owner}
                        </p>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </div>
          )}

          {tab === 'workflow' && (
            <Card className="max-w-[640px] p-6">
              <SectionTitle>Tender Workflow</SectionTitle>
              <div className="mt-5">
                {steps.map((s, i) => {
                  const isCurrent = i === currentIdx;
                  return (
                    <div key={s.label} className="relative flex gap-4 pb-7 last:pb-0">
                      {i < steps.length - 1 && (
                        <motion.span
                          initial={{ scaleY: 0 }}
                          animate={{ scaleY: 1 }}
                          transition={{ duration: 0.3, delay: i * 0.08 }}
                          className={cn('absolute left-[13px] top-7 h-[calc(100%-28px)] w-0.5 origin-top', s.done ? 'bg-success' : 'bg-app-border')}
                        />
                      )}
                      <span
                        className={cn(
                          'z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                          s.done ? 'bg-success-soft text-success' : isCurrent ? 'bg-info-soft text-info ring-2 ring-action' : 'bg-grey-soft text-app-muted',
                        )}
                      >
                        {s.done ? <CircleCheck size={15} /> : <Circle size={13} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn('text-sm font-semibold', s.done || isCurrent ? 'text-app-ink' : 'text-app-muted')}>
                            {s.label}
                          </span>
                          {s.to && (
                            <Link to={s.to} className="inline-flex items-center gap-1 text-xs font-medium text-action hover:underline">
                              Open <ArrowUpRight size={11} />
                            </Link>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-app-muted tnum">{s.caption}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {tab === 'documents' && (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <SectionTitle>Generated Documents</SectionTitle>
                  <Link to="/documents" className="inline-flex items-center gap-1 text-xs font-medium text-action hover:underline">
                    Open Document Center <ArrowUpRight size={11} />
                  </Link>
                </div>
                <div className="mt-4 flex flex-col gap-2">
                  {linkedDocs.length === 0 && (
                    <p className="py-4 text-sm text-app-muted">No quotations, invoices or contracts linked to this tender yet.</p>
                  )}
                  {linkedDocs.map((d) => (
                    <Link
                      key={d.id}
                      to="/documents"
                      className="flex items-center gap-3 rounded-xl border border-app-border p-3 transition hover:-translate-y-px hover:shadow-card"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-info-soft text-info"><FileText size={16} /></span>
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-xs font-medium text-navy-800">{d.docNo}</div>
                        <div className="text-xs text-app-muted">{DOC_TYPE_LABEL[d.type]} · {formatDate(d.issueDate)}</div>
                      </div>
                      <span className="text-sm font-semibold text-app-ink tnum">{formatKESCompact(d.total)}</span>
                      <Pill status={d.status} />
                    </Link>
                  ))}
                </div>
              </Card>

              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <SectionTitle>Attached Files (DMS)</SectionTitle>
                  <Link to="/dms" className="inline-flex items-center gap-1 text-xs font-medium text-action hover:underline">
                    Business Documents <ArrowUpRight size={11} />
                  </Link>
                </div>
                <div className="mt-4 flex flex-col gap-2">
                  {attachments.length === 0 && (
                    <p className="py-4 text-sm text-app-muted">
                      No files attached. Evidence uploaded from the Eligibility Checker lands here.
                    </p>
                  )}
                  {attachments.map((d) => (
                    <div key={d.id} className="flex items-center gap-3 rounded-xl border border-app-border p-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold-soft text-gold"><Paperclip size={16} /></span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold text-app-ink">{d.title}</div>
                        <div className="truncate text-xs text-app-muted">{d.fileName} · {formatDate(d.createdAt)}</div>
                      </div>
                      {d.expiryDate && <ExpiryBadge date={d.expiryDate} showDays={false} />}
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {tab === 'timeline' && (
            <Card className="max-w-[640px] p-6">
              <SectionTitle>Activity Timeline</SectionTitle>
              <div className="mt-3 divide-y divide-[#EEF1F5]">
                {timeline.map((e, i) => <TimelineItem key={e.id} entry={e} index={i} />)}
              </div>
            </Card>
          )}
        </motion.div>
      </AnimatePresence>

      {/* edit drawer */}
      <TenderFormDrawer open={editOpen} onClose={() => setEditOpen(false)} tender={tender} />

      {/* status dialogs */}
      <ConfirmDialog
        open={wonConfirm}
        onClose={() => setWonConfirm(false)}
        onConfirm={() => { applyStatus('Won'); setContractPrompt(true); }}
        title="Mark tender as Won?"
        message={`${tender.refNo} will move to Won and the pipeline will be updated. You can generate the contract document next.`}
        confirmLabel="Mark Won"
      />
      <Modal
        open={contractPrompt}
        onClose={() => setContractPrompt(false)}
        title="Generate Contract?"
        footer={
          <>
            <Btn variant="secondary" onClick={() => setContractPrompt(false)}>Skip</Btn>
            <Btn variant="gold" onClick={() => { generateContract(); }}>Generate Contract</Btn>
          </>
        }
      >
        {contractDocNo ? (
          <div className="flex items-center gap-3 rounded-xl bg-success-soft p-4">
            <CircleCheck size={18} className="text-success" />
            <div className="text-sm text-app-ink">
              Contract <span className="font-mono font-medium">{contractDocNo}</span> created as a draft in the Document Center.
            </div>
          </div>
        ) : (
          <p className="text-sm leading-6 text-app-slate">
            Create a draft contract for <span className="font-mono text-navy-800">{tender.refNo}</span> worth{' '}
            <span className="font-semibold text-app-ink tnum">{formatKES(tender.value)}</span> (excl. VAT)? It lands in the Document Center as a draft.
          </p>
        )}
      </Modal>
      <Modal
        open={lostOpen}
        onClose={() => setLostOpen(false)}
        title="Mark tender as Lost?"
        footer={
          <>
            <Btn variant="secondary" onClick={() => setLostOpen(false)}>Cancel</Btn>
            <Btn variant="danger" onClick={() => { applyStatus('Lost', lostReason); setLostOpen(false); }}>Mark Lost</Btn>
          </>
        }
      >
        <Field label="Lost reason" required>
          <SelectInput
            options={LOST_REASONS.map((r) => ({ value: r, label: r }))}
            value={lostReason}
            onChange={(e) => setLostReason(e.target.value)}
          />
        </Field>
      </Modal>
      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => applyStatus('Cancelled')}
        title="Cancel this tender?"
        message={`${tender.refNo} will be marked Cancelled and leave the active pipeline.`}
        confirmLabel="Cancel tender"
        destructive
      />
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => {
          removeItem('tenders', tender.id, {
            entityRef: tender.refNo,
            details: `Deleted tender — ${tender.refNo} (${tender.title})`,
            verb: 'Deleted', verbColor: 'red',
          });
          navigate('/tenders');
        }}
        title="Delete tender?"
        message={`${tender.refNo} — ${tender.title} will be permanently removed from the register.`}
        confirmLabel="Delete"
        destructive
      />

      {/* add risk */}
      <AddRiskModal open={riskOpen} onClose={() => setRiskOpen(false)} tenderRef={tender.refNo} tenderTitle={tender.title} />
    </PageEnter>
  );
}

/* ---------------- small bits ---------------- */

function Kpi({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-app-border bg-white p-3.5">
      <div className="flex items-center gap-1.5 text-app-slate">
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em]">{label}</span>
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Kv({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-app-muted">{k}</dt>
      <dd className="mt-1 text-sm text-app-ink">{v}</dd>
    </div>
  );
}

function SummaryCard({ icon, title, to, children }: { icon: ReactNode; title: string; to: string; children: ReactNode }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-[13px] font-semibold text-app-ink">{title}</span>
        </div>
        <Link to={to} className="inline-flex items-center gap-1 text-xs font-medium text-action hover:underline">
          Open <ArrowUpRight size={11} />
        </Link>
      </div>
      {children}
    </Card>
  );
}

function AddRiskModal({
  open, onClose, tenderRef, tenderTitle,
}: {
  open: boolean;
  onClose: () => void;
  tenderRef: string;
  tenderTitle: string;
}) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Compliance');
  const [likelihood, setLikelihood] = useState(3);
  const [impact, setImpact] = useState(3);
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const save = async () => {
    if (!title.trim()) {
      setError('Risk title is required.');
      return;
    }
    const refNo = await reserveDocNumber('FBV-RSK');
    addItem('risks', {
      id: uid('rsk'),
      refNo,
      title: title.trim(),
      description: description.trim() || `Risk linked to tender ${tenderRef} — ${tenderTitle}.`,
      category,
      likelihood,
      impact,
      owner: 'Admin User',
      status: 'Open',
      createdAt: nowISO(),
    }, {
      entityRef: refNo,
      details: `Created risk ${refNo} linked to ${tenderRef}`,
      verb: 'Created', verbColor: 'grey',
    });
    setTitle(''); setDescription(''); setError('');
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`Add Risk — ${tenderRef}`}
      width="w-[480px]"
      footer={
        <>
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save}>Save Risk</Btn>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Risk title" required error={error}>
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Bid bond expiry before award" />
        </Field>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Category">
            <SelectInput options={RISK_CATEGORIES.map((c) => ({ value: c, label: c }))} value={category} onChange={(e) => setCategory(e.target.value)} />
          </Field>
          <Field label={`Likelihood (${likelihood})`}>
            <input type="range" min={1} max={5} value={likelihood} onChange={(e) => setLikelihood(Number(e.target.value))} className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-full" style={{ background: `linear-gradient(to right, #2563EB ${(likelihood / 5) * 100}%, #E4E9F0 ${(likelihood / 5) * 100}%)` }} />
          </Field>
          <Field label={`Impact (${impact})`}>
            <input type="range" min={1} max={5} value={impact} onChange={(e) => setImpact(Number(e.target.value))} className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-full" style={{ background: `linear-gradient(to right, #DC2626 ${(impact / 5) * 100}%, #E4E9F0 ${(impact / 5) * 100}%)` }} />
          </Field>
        </div>
        <Field label="Description">
          <TextareaInput value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the risk and mitigation…" rows={4} />
        </Field>
        <div className="flex items-start gap-2 rounded-xl bg-warning-soft p-3 text-xs leading-5 text-warning">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          The risk is registered in the central Risk Register and linked to this tender via its reference.
        </div>
      </div>
    </Drawer>
  );
}
