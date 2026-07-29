/**
 * Risk Register — /risks
 * 5×5 likelihood × impact heat matrix + per-tender risk table with mitigation tracking.
 */
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ShieldAlert, AlertTriangle, ShieldCheck, Gauge, Plus, Download, Trash2, Pencil } from 'lucide-react';
import {
  useStore, addItem, updateItem, removeItem, uid, nowISO, TODAY,
  type Risk,
} from '@/lib/store';
import { formatDate } from '@/lib/format';
import {
  PageHeader, StatChip, Pill, Drawer, EmptyState, ConfirmDialog,
  Field, TextInput, DateInput, SelectInput, TextareaInput,
} from '@/components/shared';
import type { Tone } from '@/components/shared';
import { Avatar, BTN_PRIMARY, BTN_SECONDARY, Card, SectionTitle, downloadCSV, ownerOptions, useToasts } from '@/components/trackers/ui';
import { cn } from '@/lib/utils';

/* Extended fields carried in localStorage but missing from the base Risk type. */
type RiskStatus = 'Open' | 'Mitigating' | 'Mitigated' | 'Closed';
type RiskX = Omit<Risk, 'status'> & { status: RiskStatus; mitigation?: string; tenderRef?: string; reviewDate?: string };

const STATUS_TONE: Record<RiskStatus, Tone> = { Open: 'amber', Mitigating: 'blue', Mitigated: 'green', Closed: 'grey' };

const CATEGORIES = ['Financial', 'Operational', 'Compliance', 'Technical', 'Supply Chain'];
const CAT_TONE: Record<string, Tone> = {
  Financial: 'amber', Operational: 'blue', Compliance: 'purple', Technical: 'navy', 'Supply Chain': 'gold',
};

function bandOf(score: number): 'low' | 'medium' | 'high' {
  if (score >= 15) return 'high';
  if (score >= 8) return 'medium';
  return 'low';
}
const BAND_CELL = { low: 'bg-success-soft', medium: 'bg-warning-soft', high: 'bg-danger-soft' } as const;
const BAND_TEXT = { low: 'text-success', medium: 'text-warning', high: 'text-danger' } as const;

function nextRiskNo(risks: Risk[]): string {
  let max = 0;
  risks.forEach((r) => {
    const n = parseInt(r.refNo.replace(/\D/g, ''), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  });
  return `FBV-RSK-${String(max + 1).padStart(3, '0')}`;
}

export default function Risks() {
  const s = useStore();
  const toasts = useToasts();
  const [catFilter, setCatFilter] = useState('all');
  const [drawerFor, setDrawerFor] = useState<RiskX | 'new' | null>(null);
  const [deleteFor, setDeleteFor] = useState<RiskX | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);

  const risks = useMemo(() => s.risks as RiskX[], [s.risks]);
  const filtered = useMemo(() => risks.filter((r) => catFilter === 'all' || r.category === catFilter), [risks, catFilter]);
  const ordered = useMemo(
    () => [...filtered].sort((a, b) => b.likelihood * b.impact - a.likelihood * a.impact),
    [filtered],
  );

  const stats = useMemo(() => {
    const open = risks.filter((r) => r.status === 'Open').length;
    const high = risks.filter((r) => r.status !== 'Closed' && r.likelihood * r.impact >= 15).length;
    const mitigated = risks.filter((r) => r.status === 'Mitigated').length;
    const avg = risks.length ? (risks.reduce((a, r) => a + r.likelihood * r.impact, 0) / risks.length).toFixed(1) : '0.0';
    return { open, high, mitigated, avg };
  }, [risks]);

  const byCell = useMemo(() => {
    const m = new Map<string, RiskX[]>();
    ordered.forEach((r) => {
      const k = `${r.likelihood}-${r.impact}`;
      m.set(k, [...(m.get(k) ?? []), r]);
    });
    return m;
  }, [ordered]);

  const jumpTo = (id: string) => {
    setFlashId(id);
    document.getElementById(`risk-row-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => setFlashId(null), 1100);
  };

  const exportCsv = () => {
    downloadCSV(
      'fbv-risks.csv',
      ['Ref', 'Title', 'Category', 'Linked Tender', 'Likelihood', 'Impact', 'Score', 'Owner', 'Status', 'Mitigation'],
      ordered.map((r) => [r.refNo, r.title, r.category, r.tenderRef ?? '', r.likelihood, r.impact, r.likelihood * r.impact, r.owner, r.status, r.mitigation ?? r.description]),
    );
    toasts.push(`Exported ${ordered.length} risks to CSV`);
  };

  return (
    <div className="px-7 pb-8 pt-6">
      {toasts.node}
      <PageHeader
        title="Risk Register"
        subtitle="Identify, score and mitigate tender & contract risks."
        actions={
          <>
            <SelectInput
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
              options={[{ value: 'all', label: 'All categories' }, ...CATEGORIES.map((c) => ({ value: c, label: c }))]}
              className="w-[170px]"
              aria-label="Category filter"
            />
            <button onClick={exportCsv} className={BTN_SECONDARY}><Download size={15} /> Export CSV</button>
            <button onClick={() => setDrawerFor('new')} className={BTN_PRIMARY}><Plus size={15} /> Add Risk</button>
          </>
        }
      />

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { icon: <ShieldAlert size={17} />, value: stats.open, label: 'Open Risks', variant: 'amber' as const },
          { icon: <AlertTriangle size={17} />, value: stats.high, label: 'High / Critical', variant: 'red' as const },
          { icon: <ShieldCheck size={17} />, value: stats.mitigated, label: 'Mitigated', variant: 'green' as const },
          { icon: <Gauge size={17} />, value: stats.avg, label: 'Avg Score', variant: 'navy' as const },
        ].map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: i * 0.05, ease: 'easeOut' }}>
            <StatChip icon={c.icon} value={c.value} label={c.label} variant={c.variant} />
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[380px_1fr]">
        {/* Heat matrix (sticky) */}
        <Card className="self-start p-4 xl:sticky xl:top-4">
          <h3 className="mb-3 text-[15px] font-semibold text-app-ink">Heat Matrix</h3>
          <div className="flex gap-2">
            <div className="flex flex-col justify-between py-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-app-muted [writing-mode:vertical-rl] rotate-180 self-center">
                Likelihood →
              </span>
            </div>
            <div className="flex-1">
              <div className="grid grid-cols-[20px_repeat(5,1fr)] gap-1">
                {[5, 4, 3, 2, 1].map((l) => (
                  <div key={l} className="contents">
                    <div className="flex items-center justify-center text-[11px] font-semibold text-app-muted tnum">{l}</div>
                    {[1, 2, 3, 4, 5].map((i) => {
                      const score = l * i;
                      const cell = byCell.get(`${l}-${i}`) ?? [];
                      return (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.3, delay: 0.05 * Math.hypot(l - 3, i - 3), ease: 'easeOut' }}
                          className={cn('flex h-[52px] flex-wrap content-start items-start gap-1 rounded-lg p-1', BAND_CELL[bandOf(score)])}
                          title={`L${l} × I${i} = ${score}`}
                        >
                          {cell.slice(0, 3).map((r, idx) => {
                            const n = ordered.indexOf(r) + 1;
                            return (
                              <motion.button
                                key={r.id}
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ type: 'spring', stiffness: 400, damping: 22, delay: 0.3 + idx * 0.06 }}
                                onClick={() => jumpTo(r.id)}
                                title={r.title}
                                className="flex h-5 w-5 items-center justify-center rounded-full bg-navy-800 text-[10px] font-bold text-white transition hover:bg-action"
                              >
                                {n}
                              </motion.button>
                            );
                          })}
                          {cell.length > 3 && (
                            <span className="flex h-5 items-center rounded-full bg-navy-800/60 px-1.5 text-[10px] font-bold text-white" title={cell.slice(3).map((r) => r.title).join('\n')}>
                              +{cell.length - 3}
                            </span>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                ))}
                <div />
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="pt-0.5 text-center text-[11px] font-semibold text-app-muted tnum">{i}</div>
                ))}
              </div>
              <div className="mt-1 text-center text-[10px] font-semibold uppercase tracking-wide text-app-muted">Impact →</div>
              <div className="mt-2 flex items-center justify-center gap-3 text-[11px] text-app-slate">
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-success-soft ring-1 ring-success/30" /> 1–6 Low</span>
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-warning-soft ring-1 ring-warning/30" /> 8–12 Medium</span>
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-danger-soft ring-1 ring-danger/30" /> 15–25 High</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Risk table */}
        <Card className="overflow-hidden">
          <SectionTitle>Registered Risks · {ordered.length}</SectionTitle>
          {ordered.length === 0 ? (
            <EmptyState
              title="No risks registered"
              hint="Add tender & contract risks to score and track mitigations."
              action={<button onClick={() => setDrawerFor('new')} className={BTN_PRIMARY}><Plus size={15} /> Add Risk</button>}
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-app-border bg-[#F8FAFC] text-left">
                  {['#', 'Risk', 'Tender', 'L × I', 'Score', 'Owner', 'Mitigation', 'Status', ''].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-app-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {ordered.map((r, idx) => {
                    const score = r.likelihood * r.impact;
                    return (
                      <motion.tr
                        key={r.id}
                        id={`risk-row-${r.id}`}
                        layout="position"
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0, backgroundColor: flashId === r.id ? '#F7F0DA' : 'rgba(255,255,255,0)' }}
                        transition={{ duration: 0.2, delay: Math.min(idx * 0.02, 0.2), backgroundColor: { duration: flashId === r.id ? 0.3 : 1 } }}
                        className="border-b border-[#EEF1F5] last:border-0 hover:bg-[#F8FAFC]"
                      >
                        <td className="px-3 py-2.5">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-navy-800 text-[11px] font-bold text-white tnum">{idx + 1}</span>
                        </td>
                        <td className="max-w-[220px] px-3 py-2.5">
                          <div className="truncate font-semibold text-app-ink" title={r.title}>{r.title}</div>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <Pill tone={CAT_TONE[r.category] ?? 'grey'}>{r.category}</Pill>
                            <span className="font-mono text-[10px] text-app-muted">{r.refNo}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-navy-800">{r.tenderRef ?? '—'}</td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-app-slate tnum">
                            <span className="rounded bg-app-bg px-1.5 py-0.5">{r.likelihood}</span>×
                            <span className="rounded bg-app-bg px-1.5 py-0.5">{r.impact}</span>
                          </span>
                        </td>
                        <td className={cn('px-3 py-2.5 text-[15px] font-bold tnum', BAND_TEXT[bandOf(score)])}>{score}</td>
                        <td className="px-3 py-2.5">
                          <span className="flex items-center gap-1.5">
                            <Avatar name={r.owner} size={22} />
                            <span className="hidden max-w-[90px] truncate text-xs text-app-slate 2xl:inline">{r.owner}</span>
                          </span>
                        </td>
                        <td className="max-w-[180px] px-3 py-2.5">
                          <span className="block truncate text-xs text-app-slate" title={r.mitigation ?? r.description}>
                            {r.mitigation ?? r.description}
                          </span>
                        </td>
                        <td className="px-3 py-2.5"><Pill tone={STATUS_TONE[r.status] ?? 'grey'}>{r.status}</Pill></td>
                        <td className="px-3 py-2.5">
                          <div className="flex gap-1">
                            <button onClick={() => setDrawerFor(r)} title="Edit risk" className="flex h-7 w-7 items-center justify-center rounded-lg text-app-muted hover:bg-app-bg hover:text-action">
                              <Pencil size={13} />
                            </button>
                            <button onClick={() => setDeleteFor(r)} title="Delete risk" className="flex h-7 w-7 items-center justify-center rounded-lg text-app-muted hover:bg-danger-soft hover:text-danger">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <RiskDrawer
        risk={drawerFor}
        onClose={() => setDrawerFor(null)}
        onSaved={(msg) => toasts.push(msg)}
      />

      <ConfirmDialog
        open={deleteFor != null}
        onClose={() => setDeleteFor(null)}
        onConfirm={() => {
          if (!deleteFor) return;
          removeItem('risks', deleteFor.id, {
            action: 'Deleted', entity: 'Risk', entityRef: deleteFor.refNo,
            details: `Risk deleted — ${deleteFor.title}`, verb: 'Deleted', verbColor: 'red',
          });
          toasts.push(`Risk ${deleteFor.refNo} deleted`);
        }}
        title="Delete risk"
        message={`Delete "${deleteFor?.title}"? This action is recorded in the Audit Trail.`}
        confirmLabel="Delete"
        destructive
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Add / Edit risk drawer                                               */
/* ------------------------------------------------------------------ */

function RiskDrawer({ risk, onClose, onSaved }: {
  risk: RiskX | 'new' | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const s = useStore();
  const isNew = risk === 'new';
  const editing = risk !== 'new' && risk != null ? risk : null;

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Financial');
  const [tenderId, setTenderId] = useState('');
  const [likelihood, setLikelihood] = useState(3);
  const [impact, setImpact] = useState(3);
  const [mitigation, setMitigation] = useState('');
  const [owner, setOwner] = useState('');
  const [reviewDate, setReviewDate] = useState('');
  const [status, setStatus] = useState<RiskStatus>('Open');
  const [error, setError] = useState('');
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Populate form when the drawer target changes
  const key = risk == null ? null : isNew ? 'new' : (risk as RiskX).id;
  if (key !== loadedFor) {
    setLoadedFor(key);
    if (editing) {
      setTitle(editing.title); setCategory(editing.category);
      setTenderId(s.tenders.find((t) => t.refNo === editing.tenderRef)?.id ?? '');
      setLikelihood(editing.likelihood); setImpact(editing.impact);
      setMitigation(editing.mitigation ?? editing.description); setOwner(editing.owner);
      setReviewDate(editing.reviewDate ?? ''); setStatus(editing.status); setError('');
    } else {
      setTitle(''); setCategory('Financial'); setTenderId(''); setLikelihood(3); setImpact(3);
      setMitigation(''); setOwner(''); setReviewDate(''); setStatus('Open'); setError('');
    }
  }

  const score = likelihood * impact;
  const tenderRef = s.tenders.find((t) => t.id === tenderId)?.refNo;

  const save = () => {
    if (!title.trim()) return setError('Risk title is required');
    if (!owner) return setError('Owner is required');
    if (editing) {
      updateItem('risks', editing.id, {
        title: title.trim(), category, likelihood, impact, owner, status: status as Risk['status'],
        description: mitigation.trim() || editing.description,
        ...(mitigation.trim() ? { mitigation: mitigation.trim() } : {}),
        ...(tenderRef ? { tenderRef } : {}),
        ...(reviewDate ? { reviewDate } : {}),
      } as Partial<Risk>, {
        action: 'Updated', entity: 'Risk', entityRef: editing.refNo,
        details: `Risk updated — ${title.trim()} (score ${score})`, verb: 'Updated', verbColor: 'blue',
      });
      onSaved(`Risk ${editing.refNo} updated`);
    } else {
      const refNo = nextRiskNo(s.risks);
      const item = {
        id: uid('rsk'), refNo, title: title.trim(), description: mitigation.trim() || title.trim(),
        category, likelihood, impact, owner, status: status as Risk['status'], createdAt: nowISO(),
        ...(mitigation.trim() ? { mitigation: mitigation.trim() } : {}),
        ...(tenderRef ? { tenderRef } : {}),
        ...(reviewDate ? { reviewDate } : {}),
      } as Risk;
      addItem('risks', item, {
        action: 'Created', entity: 'Risk', entityRef: refNo,
        details: `Risk registered — ${title.trim()} (L${likelihood} × I${impact} = ${score})`, verb: 'Created', verbColor: 'grey',
      });
      onSaved(`Risk ${refNo} registered`);
    }
    onClose();
  };

  return (
    <Drawer
      open={risk != null}
      onClose={onClose}
      title={editing ? `Edit ${editing.refNo}` : 'Add Risk'}
      footer={
        <>
          <button onClick={onClose} className={BTN_SECONDARY}>Cancel</button>
          <button onClick={save} className={BTN_PRIMARY}>{editing ? 'Save Changes' : 'Register Risk'}</button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Risk title" required error={error === 'Risk title is required' ? error : undefined}>
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Supplier lead-time slippage" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Category" required>
            <SelectInput value={category} onChange={(e) => setCategory(e.target.value)} options={CATEGORIES.map((c) => ({ value: c, label: c }))} />
          </Field>
          <Field label="Linked tender">
            <SelectInput
              value={tenderId}
              onChange={(e) => setTenderId(e.target.value)}
              options={[{ value: '', label: '— Not linked —' }, ...s.tenders.map((t) => ({ value: t.id, label: `${t.refNo} — ${t.title}` }))]}
            />
          </Field>
        </div>

        {/* Likelihood / impact sliders with live score */}
        <div className="rounded-xl border border-app-border p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[13px] font-medium text-app-ink">Score preview</span>
            <motion.span
              key={score}
              initial={{ scale: 0.85 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.2 }}
              className={cn('rounded-full px-3 py-1 text-sm font-bold tnum', BAND_CELL[bandOf(score)], BAND_TEXT[bandOf(score)])}
            >
              {likelihood} × {impact} = {score}
            </motion.span>
          </div>
          <div className="space-y-3">
            {([
              { label: 'Likelihood', value: likelihood, set: setLikelihood },
              { label: 'Impact', value: impact, set: setImpact },
            ] as const).map((sl) => (
              <div key={sl.label}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="font-medium text-app-slate">{sl.label}</span>
                  <span className="font-semibold text-app-ink tnum">{sl.value} / 5</span>
                </div>
                <input
                  type="range" min={1} max={5} step={1} value={sl.value}
                  onChange={(e) => sl.set(Number(e.target.value))}
                  className="w-full accent-action"
                  aria-label={sl.label}
                />
                <div className="flex justify-between text-[10px] text-app-muted tnum">
                  {[1, 2, 3, 4, 5].map((n) => <span key={n}>{n}</span>)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <Field label="Mitigation plan">
          <TextareaInput value={mitigation} onChange={(e) => setMitigation(e.target.value)} placeholder="Actions to reduce likelihood or impact…" rows={4} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Owner" required error={error === 'Owner is required' ? error : undefined}>
            <SelectInput value={owner} onChange={(e) => setOwner(e.target.value)} options={[{ value: '', label: '— Select owner —' }, ...ownerOptions().map((o) => ({ value: o, label: o }))]} />
          </Field>
          <Field label="Review date" hint={`Today is ${formatDate(TODAY)}.`}>
            <DateInput value={reviewDate} onChange={(e) => setReviewDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Status" required>
          <SelectInput
            value={status}
            onChange={(e) => setStatus(e.target.value as RiskStatus)}
            options={(['Open', 'Mitigating', 'Mitigated', 'Closed'] as RiskStatus[]).map((x) => ({ value: x, label: x }))}
          />
        </Field>
      </div>
    </Drawer>
  );
}
