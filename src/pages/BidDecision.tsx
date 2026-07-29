/** Bid / No-Bid Engine — /bid-decision
 *  Weighted scoring across 10 criteria (weights total 100, editable).
 *  Score = Σ weight × rating/5 → 0–100. Verdict: BID ≥70 · Bid with Caution 45–69 · Do Not Bid <45. */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Check, Scale, Send } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { useStore, addItem, nextDocNumber, nowISO, uid } from '@/lib/store';
import { formatDateTime, formatKESCompact } from '@/lib/format';
import { PageHeader, Pill, TextareaInput } from '@/components/shared';
import {
  latestBidDecision, saveBidDecision, useExtras,
} from '@/components/tenders/extras';
import type { BidVerdict } from '@/components/tenders/extras';
import { TenderContextBar, useTenderParam } from '@/components/tenders/TenderContextBar';
import { Btn, Card, PageEnter, SectionTitle, TweenNumber } from '@/components/tenders/ui';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/* Criteria (weights per specification — total 100)                    */
/* ------------------------------------------------------------------ */

interface CriterionDef {
  id: string;
  label: string;
  weight: number;
  caption: string;
}

const CRITERIA: CriterionDef[] = [
  { id: 'expected-profit', label: 'Expected Profit', weight: 15, caption: 'Margin after direct costs, overheads & financing.' },
  { id: 'strategic-importance', label: 'Strategic Importance', weight: 10, caption: 'Entry into a new client, sector or region.' },
  { id: 'technical-capability', label: 'Technical Capability', weight: 15, caption: 'Proven skills, references & equipment for the scope.' },
  { id: 'resource-availability', label: 'Resource Availability', weight: 10, caption: 'People, stock & cash free in the delivery window.' },
  { id: 'competition-level', label: 'Competition Level', weight: 10, caption: 'Fewer credible competitors = higher score.' },
  { id: 'client-relationship', label: 'Client Relationship', weight: 10, caption: 'History, payment culture & access to evaluators.' },
  { id: 'payment-risk', label: 'Payment Risk', weight: 10, caption: 'Client payment track record; lower risk = higher score.' },
  { id: 'contract-complexity', label: 'Contract Complexity', weight: 5, caption: 'Penalties, LDs & legal terms; simpler = higher score.' },
  { id: 'time-available', label: 'Time Available', weight: 10, caption: 'Enough time to price & submit a quality bid.' },
  { id: 'capacity-utilization', label: 'Capacity Utilization', weight: 5, caption: 'Current workload — idle capacity = higher score.' },
];

const DEFAULT_RATINGS: Record<string, number> = Object.fromEntries(CRITERIA.map((c) => [c.id, 3]));
const DEFAULT_WEIGHTS: Record<string, number> = Object.fromEntries(CRITERIA.map((c) => [c.id, c.weight]));

function verdictOf(score: number): BidVerdict {
  if (score >= 70) return 'BID';
  if (score >= 45) return 'CAUTION';
  return 'NO-BID';
}

const VERDICT_META: Record<BidVerdict, { label: string; message: string; tone: 'green' | 'amber' | 'red'; bg: string; hex: string }> = {
  BID: { label: 'BID', message: 'Strong fit — proceed to costing.', tone: 'green', bg: 'bg-success-soft', hex: '#16A34A' },
  CAUTION: { label: 'Bid with Caution', message: 'Management review required before committing bid costs.', tone: 'amber', bg: 'bg-warning-soft', hex: '#D97706' },
  'NO-BID': { label: 'Do Not Bid', message: 'Score below threshold — decline and document the rationale.', tone: 'red', bg: 'bg-danger-soft', hex: '#DC2626' },
};

/* ================================================================== */

export default function BidDecision() {
  const state = useStore();
  const extras = useExtras();
  const navigate = useNavigate();
  const [tenderId, setTenderId] = useTenderParam();
  const tender = state.tenders.find((t) => t.id === tenderId);

  const [ratings, setRatings] = useState<Record<string, number>>(DEFAULT_RATINGS);
  const [weights, setWeights] = useState<Record<string, number>>(DEFAULT_WEIGHTS);
  const [weightEditor, setWeightEditor] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [approvalSent, setApprovalSent] = useState(false);

  /* load the latest decision for the selected tender */
  useEffect(() => {
    setApprovalSent(false);
    setNotes('');
    setWeightEditor(null);
    if (!tenderId) {
      setRatings(DEFAULT_RATINGS);
      setWeights(DEFAULT_WEIGHTS);
      return;
    }
    const d = latestBidDecision(tenderId);
    if (d) {
      setRatings({ ...DEFAULT_RATINGS, ...d.ratings });
      setWeights({ ...DEFAULT_WEIGHTS, ...d.weights });
      setNotes(d.notes ?? '');
    } else {
      setRatings(DEFAULT_RATINGS);
      setWeights(DEFAULT_WEIGHTS);
    }
  }, [tenderId, extras.bidDecisions.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const weightsTotal = CRITERIA.reduce((s, c) => s + (weights[c.id] ?? 0), 0);
  const score = Math.round(CRITERIA.reduce((s, c) => s + ((weights[c.id] ?? 0) * (ratings[c.id] ?? 0)) / 5, 0));
  const verdict = verdictOf(score);
  const meta = VERDICT_META[verdict];
  const maxContribution = Math.max(...CRITERIA.map((c) => weights[c.id] ?? 0));

  const contributions = useMemo(
    () =>
      CRITERIA.map((c) => {
        const w = weights[c.id] ?? 0;
        const r = ratings[c.id] ?? 0;
        return { def: c, points: (w * r) / 5, rating: r, weight: w };
      }),
    [ratings, weights],
  );

  const save = () => {
    if (!tender || weightsTotal !== 100) return;
    saveBidDecision(
      {
        id: uid('bid'),
        tenderId: tender.id,
        ratings,
        weights,
        score,
        verdict,
        notes: notes.trim() || undefined,
        decidedBy: 'Admin User',
        decidedAt: nowISO(),
      },
      tender.refNo,
    );
  };

  const submitForApproval = () => {
    if (!tender) return;
    const refNo = nextDocNumber('FBV-APR');
    addItem('approvals', {
      id: uid('apr'),
      refNo,
      type: 'Bid Decision',
      title: `Bid-with-caution review — ${tender.refNo} (${tender.title})`,
      amount: tender.value,
      requestedBy: 'Admin User',
      requestedAt: nowISO(),
      status: 'Pending',
      notes: `Weighted score ${score} — Bid with Caution. ${notes.trim()}`,
    }, {
      entityRef: refNo,
      details: `Bid-with-caution decision submitted for approval — ${tender.refNo} (score ${score})`,
      verb: 'Submitted',
      verbColor: 'gold',
    });
    setApprovalSent(true);
  };

  return (
    <PageEnter>
      <PageHeader
        title="Bid / No-Bid Engine"
        subtitle="Weighted scoring across 10 criteria recommends whether to bid."
      />
      <TenderContextBar tenderId={tenderId} onChange={setTenderId} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {/* scoring matrix (2fr) */}
        <div className="xl:col-span-2">
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SectionTitle>Scoring Matrix</SectionTitle>
              <span className={cn('text-xs font-semibold tnum', weightsTotal === 100 ? 'text-success' : 'text-danger')}>
                Weights total: {weightsTotal}%{weightsTotal === 100 ? ' ✓' : ' — must equal 100%'}
              </span>
            </div>
            <div className="mt-4 flex flex-col gap-3">
              {CRITERIA.map((c) => {
                const w = weights[c.id] ?? 0;
                const r = ratings[c.id] ?? 0;
                return (
                  <div key={c.id} className="rounded-xl border border-app-border p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-app-ink">{c.label}</span>
                          <span className="relative">
                            <button
                              onClick={() => setWeightEditor(weightEditor === c.id ? null : c.id)}
                              className="rounded-full bg-grey-soft px-2 py-0.5 text-[10px] font-bold text-grey transition hover:bg-[#E4EBF4] tnum"
                              title="Edit weight"
                            >
                              {w}%
                            </button>
                            {weightEditor === c.id && (
                              <motion.div
                                initial={{ opacity: 0, y: -4, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                transition={{ duration: 0.15 }}
                                className="absolute left-0 top-6 z-20 flex items-center gap-1.5 rounded-xl border border-app-border bg-white p-2 shadow-card-hover"
                              >
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={w}
                                  onChange={(e) => setWeights((prev) => ({ ...prev, [c.id]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) }))}
                                  className="h-8 w-16 rounded-lg border border-app-border px-2 text-xs text-app-ink outline-none tnum focus:border-action"
                                />
                                <span className="text-[11px] text-app-muted">%</span>
                              </motion.div>
                            )}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-app-muted">{c.caption}</p>
                      </div>
                      {/* 1–5 segmented rating */}
                      <div className="flex items-center gap-1.5">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <motion.button
                            key={n}
                            onClick={() => setRatings((prev) => ({ ...prev, [c.id]: n }))}
                            whileTap={{ scale: 0.85 }}
                            animate={r === n ? { scale: [0.85, 1] } : { scale: 1 }}
                            transition={{ duration: 0.18, delay: r === n ? 0 : 0 }}
                            className={cn(
                              'flex h-8 w-9 items-center justify-center rounded-lg border text-[13px] font-semibold transition-colors tnum',
                              r === n
                                ? 'border-action bg-action text-white'
                                : 'border-app-border bg-white text-app-slate hover:border-action hover:text-action',
                            )}
                          >
                            {n}
                          </motion.button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* decision log */}
          <Card className="mt-5 p-5">
            <SectionTitle>Decision Log</SectionTitle>
            {extras.bidDecisions.length === 0 ? (
              <p className="mt-3 text-sm text-app-muted">No saved decisions yet — score a tender and save the decision.</p>
            ) : (
              <table className="mt-3 w-full">
                <thead>
                  <tr className="bg-[#F8FAFC] text-left">
                    <th className="rounded-l-lg px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-app-muted">Tender</th>
                    <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-app-muted">Score</th>
                    <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-app-muted">Verdict</th>
                    <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-app-muted">Decided By</th>
                    <th className="rounded-r-lg px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-app-muted">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {extras.bidDecisions.slice(0, 8).map((d) => {
                    const t = state.tenders.find((x) => x.id === d.tenderId);
                    const m = VERDICT_META[d.verdict];
                    return (
                      <tr key={d.id} className="border-t border-[#EEF1F5]">
                        <td className="px-3 py-2.5">
                          <span className="font-mono text-xs font-medium text-navy-800">{t?.refNo ?? '—'}</span>
                          <span className="ml-2 text-xs text-app-slate">{t ? formatKESCompact(t.value) : ''}</span>
                        </td>
                        <td className="px-3 py-2.5 text-sm font-semibold text-app-ink tnum">{d.score}</td>
                        <td className="px-3 py-2.5"><Pill tone={m.tone}>{m.label}</Pill></td>
                        <td className="px-3 py-2.5 text-[13px] text-app-slate">{d.decidedBy}</td>
                        <td className="px-3 py-2.5 text-xs text-app-muted tnum">{formatDateTime(d.decidedAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        {/* recommendation rail (1fr, sticky) */}
        <div className="xl:sticky xl:top-[76px] xl:self-start">
          <Card className="p-5">
            <SectionTitle>Recommendation</SectionTitle>
            <div className="relative mx-auto mt-2 max-w-[220px]">
              <ResponsiveContainer width="100%" height={190}>
                <PieChart>
                  <Pie
                    data={[{ value: score }, { value: Math.max(0, 100 - score) }]}
                    dataKey="value"
                    startAngle={90}
                    endAngle={-270}
                    innerRadius={64}
                    outerRadius={88}
                    cy="50%"
                    stroke="none"
                    isAnimationActive
                    animationDuration={600}
                  >
                    <Cell fill={meta.hex} />
                    <Cell fill="#EEF1F5" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[34px] font-bold leading-9 text-app-ink tnum">
                  <TweenNumber value={score} format={(n) => `${Math.round(n)}`} duration={0.6} />
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-app-muted">weighted score</span>
              </div>
            </div>

            {/* verdict banner (color-morphs) */}
            <motion.div
              animate={{ backgroundColor: verdict === 'BID' ? '#E7F6EE' : verdict === 'CAUTION' ? '#FCF3E3' : '#FBEAEA' }}
              transition={{ duration: 0.3 }}
              className="mt-3 rounded-xl p-4 text-center"
            >
              <div className="text-[15px] font-bold" style={{ color: meta.hex }}>{meta.label}</div>
              <p className="mt-0.5 text-xs text-app-slate">{meta.message}</p>
              {verdict === 'CAUTION' && (
                <Btn
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  disabled={!tender || approvalSent}
                  onClick={submitForApproval}
                >
                  {approvalSent ? <Check size={13} /> : <Send size={13} />}
                  {approvalSent ? 'Submitted for approval' : 'Submit for approval'}
                </Btn>
              )}
            </motion.div>

            {/* factor contribution bars */}
            <SectionTitle className="mt-5">Factor Contribution</SectionTitle>
            <div className="mt-3 flex flex-col gap-2">
              {contributions.map((c) => (
                <div key={c.def.id}>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium text-app-slate">{c.def.label}</span>
                    <span className="font-semibold text-app-ink tnum">{c.points.toFixed(1)} / {c.weight}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-grey-soft">
                    <motion.div
                      className={cn('h-full rounded-full', c.rating >= 4 ? 'bg-success' : c.rating === 3 ? 'bg-info' : 'bg-danger')}
                      animate={{ width: `${maxContribution ? (c.points / maxContribution) * 100 : 0}%` }}
                      transition={{ duration: 0.4, ease: 'easeOut' }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <SectionTitle className="mt-5">Decision Rationale</SectionTitle>
            <TextareaInput
              className="mt-2"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Why this verdict? Key assumptions, conditions…"
            />

            <div className="mt-4 flex flex-col gap-2">
              <Btn onClick={save} disabled={!tender || weightsTotal !== 100}>
                <Scale size={14} /> Save decision
              </Btn>
              <Btn
                variant="secondary"
                disabled={!tender}
                onClick={() => tender && navigate(`/estimation?tender=${tender.id}`)}
              >
                Go to Cost Estimation <ArrowRight size={14} />
              </Btn>
              {!tender && (
                <p className="rounded-xl bg-app-bg p-3 text-xs text-app-muted">
                  Pick a tender above to save the decision against it.
                </p>
              )}
            </div>
            <p className="mt-3 text-center text-xs text-app-muted">
              BID ≥70 · Bid with Caution 45–69 · Do Not Bid &lt;45
            </p>
          </Card>
        </div>
      </div>

      {/* deep link to approvals for transparency */}
      {approvalSent && (
        <p className="mt-4 text-xs text-app-slate">
          Review queued in <Link to="/approvals" className="font-medium text-action hover:underline">Approvals</Link>.
        </p>
      )}
    </PageEnter>
  );
}
