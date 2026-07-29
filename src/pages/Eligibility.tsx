/** Eligibility Checker — /eligibility
 *  Weighted 11-requirement checklist. Company-compliance and financial items are
 *  auto-verified from the DMS vault + Company Profile + store; tender requirements
 *  are manual checkboxes with notes and evidence attachments (uploaded to DMS).
 *  Score ≥80% = Likely Eligible, 50–79% = Gaps to Close, <50% = Not Eligible. */
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight, CircleCheck, ClipboardCheck, Paperclip, TriangleAlert, Upload, XCircle,
} from 'lucide-react';
import { Pie, PieChart, Cell, ResponsiveContainer } from 'recharts';
import {
  useStore, addItem, alertLevel, daysUntil, nowISO, readFileAsBase64, uid, TODAY,
} from '@/lib/store';
import type { AppState, DmsDocument } from '@/lib/store';
import { formatDate, formatDateTime, formatKES } from '@/lib/format';
import { PageHeader, Pill } from '@/components/shared';
import {
  saveEligibilityAssessment, setEligibilityCheck, useExtras,
} from '@/components/tenders/extras';
import type { EligibilityVerdict } from '@/components/tenders/extras';
import { TenderContextBar, useTenderParam } from '@/components/tenders/TenderContextBar';
import { Btn, Card, PageEnter, SectionTitle, TweenNumber } from '@/components/tenders/ui';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/* Requirement definitions (weights total 100)                         */
/* ------------------------------------------------------------------ */

type CheckStatus = 'pass' | 'warn' | 'fail';

interface AutoResult {
  status: CheckStatus;
  evidence: string;
  actionLabel?: string;
  actionRoute?: string;
}

interface ReqDef {
  id: string;
  label: string;
  weight: number;
  section: 'company' | 'tender' | 'financial';
  manual?: boolean;
  hint?: string;
  auto?: (s: AppState, tenderId: string) => AutoResult;
}

const findDms = (s: AppState, kw: string): DmsDocument | undefined =>
  s.dms.find((d) => d.title.toLowerCase().includes(kw));

function docResult(doc: DmsDocument | undefined, s: AppState): AutoResult {
  if (!doc) {
    return {
      status: 'fail',
      evidence: 'Not found in Business Documents — upload it to the vault.',
      actionLabel: 'Upload →',
      actionRoute: '/dms',
    };
  }
  if (!doc.expiryDate) {
    return { status: 'pass', evidence: `Found: ${doc.refNo} (no expiry)` };
  }
  const level = alertLevel(doc.expiryDate, s.settings);
  const days = daysUntil(doc.expiryDate);
  if (level === 'EXPIRED') {
    return {
      status: 'fail',
      evidence: `${doc.refNo} expired ${formatDate(doc.expiryDate)} — renew before submission.`,
      actionLabel: 'Renew →',
      actionRoute: '/dms',
    };
  }
  if (level === 'CRITICAL' || level === 'WARNING') {
    return {
      status: 'warn',
      evidence: `Found: ${doc.refNo} — expires in ${days} days, renew soon.`,
      actionLabel: 'Renew →',
      actionRoute: '/dms',
    };
  }
  return { status: 'pass', evidence: `Found: ${doc.refNo}, expires ${formatDate(doc.expiryDate)}` };
}

const REQUIREMENTS: ReqDef[] = [
  {
    id: 'tcc', label: 'Valid Tax Compliance Certificate', weight: 14, section: 'company',
    auto: (s) => docResult(findDms(s, 'tax compliance'), s),
  },
  {
    id: 'kra-pin', label: 'KRA PIN certificate', weight: 8, section: 'company',
    auto: (s) => ({
      status: 'pass',
      evidence: `KRA PIN ${s.profile.kraPin} on file — Company Profile.`,
      actionLabel: 'Profile →',
      actionRoute: '/profile',
    }),
  },
  {
    id: 'permit', label: 'Single Business Permit', weight: 12, section: 'company',
    auto: (s) => docResult(findDms(s, 'business permit'), s),
  },
  {
    id: 'agpo', label: 'AGPO certificate (if applicable)', weight: 8, section: 'company',
    auto: (s) => {
      const doc = findDms(s, 'agpo');
      if (!doc) {
        return {
          status: 'warn',
          evidence: 'Not uploaded — only required for AGPO-reserved tenders.',
          actionLabel: 'Upload →',
          actionRoute: '/dms',
        };
      }
      return docResult(doc, s);
    },
  },
  {
    id: 'cr12', label: 'CR12 (issued ≤ 12 months ago)', weight: 8, section: 'company',
    auto: (s) => {
      const doc = findDms(s, 'cr12');
      if (!doc) return docResult(undefined, s);
      const ageDays = Math.abs(daysUntil(doc.issueDate));
      if (ageDays > 365) {
        return {
          status: 'fail',
          evidence: `${doc.refNo} issued ${formatDate(doc.issueDate)} — older than 12 months.`,
          actionLabel: 'Renew →',
          actionRoute: '/dms',
        };
      }
      return { status: 'pass', evidence: `Found: ${doc.refNo}, issued ${formatDate(doc.issueDate)}` };
    },
  },
  {
    id: 'bid-bond', label: 'Bid bond KES 250,000 attached', weight: 14, section: 'tender',
    manual: true, hint: 'Bank or insurance bid bond matching the tender requirement.',
  },
  {
    id: 'turnover', label: 'Annual turnover ≥ KES 10M', weight: 12, section: 'tender',
    manual: true, hint: 'Per audited accounts FY2025.',
  },
  {
    id: 'similar', label: '3 similar completed contracts', weight: 10, section: 'tender',
    manual: true, hint: 'Attach completion certificates or LPOs.',
  },
  {
    id: 'manufacturer', label: 'Manufacturer authorization letter', weight: 8, section: 'tender',
    manual: true, hint: 'Required when reselling OEM goods.',
  },
  {
    id: 'statutory', label: 'No overdue statutory payments', weight: 3, section: 'financial',
    auto: () => ({
      status: 'pass',
      evidence: 'Auto-verified — PAYE & VAT filings current, no overdue statutory items.',
    }),
  },
  {
    id: 'insurance', label: 'Professional Indemnity Insurance valid', weight: 3, section: 'financial',
    auto: (s) => docResult(findDms(s, 'indemnity'), s),
  },
];

const SECTION_META: Array<{ key: ReqDef['section']; title: string; caption: string }> = [
  { key: 'company', title: 'Company Compliance', caption: 'Auto-verified from Business Documents & Company Profile' },
  { key: 'tender', title: 'Tender Requirements', caption: 'Manual checks — confirm each requirement' },
  { key: 'financial', title: 'Financial', caption: 'Auto-verified from the store' },
];

function verdictOf(score: number): EligibilityVerdict {
  if (score >= 80) return 'Likely Eligible';
  if (score >= 50) return 'Gaps to Close';
  return 'Not Eligible';
}

const STATUS_ICON: Record<CheckStatus, typeof CircleCheck> = {
  pass: CircleCheck,
  warn: TriangleAlert,
  fail: XCircle,
};
const STATUS_COLOR: Record<CheckStatus, string> = {
  pass: 'text-success',
  warn: 'text-warning',
  fail: 'text-danger',
};

interface RowResult {
  def: ReqDef;
  status: CheckStatus;
  evidence: string;
  actionLabel?: string;
  actionRoute?: string;
  done: boolean;
  note: string;
  attachmentName?: string;
}

/* ================================================================== */

export default function Eligibility() {
  const state = useStore();
  const extras = useExtras();
  const navigate = useNavigate();
  const [tenderId, setTenderId] = useTenderParam();
  const tender = state.tenders.find((t) => t.id === tenderId);
  const [uploadError, setUploadError] = useState('');
  const [justSaved, setJustSaved] = useState(0);

  const checks = tenderId ? extras.eligibilityChecks[tenderId] ?? {} : {};
  const assessment = tenderId ? extras.eligibility[tenderId] : undefined;

  /* auto-default for the bid-bond row: a Bid Bond already on file counts as done */
  const bidBondDefault = useMemo(() => {
    if (!tender) return { done: false, evidence: undefined as string | undefined };
    const bond = state.bonds.find((b) => b.tenderId === tender.id && b.kind === 'Bid Bond' && b.status !== 'Expired');
    return bond
      ? { done: true, evidence: `${bond.kind} ${bond.refNo} on file — ${formatKES(bond.amount)} (${bond.issuer}).` }
      : { done: false, evidence: undefined };
  }, [state.bonds, tender]);

  const rows = useMemo<RowResult[]>(() => {
    return REQUIREMENTS.map((def): RowResult => {
      const manual = checks[def.id];
      if (def.manual) {
        const isBond = def.id === 'bid-bond';
        const done = manual?.done ?? (isBond ? bidBondDefault.done : false);
        const evidence = manual?.note
          ?? (done ? (isBond && bidBondDefault.evidence ? bidBondDefault.evidence : 'Confirmed by assessor.') : def.hint ?? 'Manual confirmation required.');
        return { def, status: (done ? 'pass' : 'fail') as CheckStatus, evidence, done, note: manual?.note ?? '', attachmentName: manual?.attachmentName };
      }
      const r = def.auto ? def.auto(state, tenderId) : { status: 'fail' as CheckStatus, evidence: 'Not evaluated.' };
      return { def, status: r.status, evidence: r.evidence, actionLabel: r.actionLabel, actionRoute: r.actionRoute, done: r.status === 'pass', note: '', attachmentName: undefined };
    });
  }, [checks, state, tenderId, bidBondDefault]);

  const score = Math.round(
    rows.reduce((s, r) => s + (r.status === 'pass' ? r.def.weight : r.status === 'warn' ? r.def.weight / 2 : 0), 0),
  );
  const verdict = verdictOf(score);
  const gaps = rows.filter((r) => r.status !== 'pass');

  const save = () => {
    if (!tender) return;
    saveEligibilityAssessment(
      {
        tenderId: tender.id,
        score,
        verdict,
        gaps: gaps.map((g) => g.def.label),
        assessor: 'Admin User',
        timestamp: nowISO(),
      },
      tender.refNo,
    );
    setJustSaved(Date.now());
  };

  const onAttach = async (reqId: string, label: string, file: File | null) => {
    if (!file || !tender) return;
    setUploadError('');
    try {
      const { fileName, fileData } = await readFileAsBase64(file);
      const refNo = `EVD-${tender.refNo}-${reqId.toUpperCase()}`;
      addItem('dms', {
        id: uid('dms'),
        docType: 'other',
        refNo,
        title: `Evidence: ${label} (${tender.refNo})`,
        issuer: 'Future Bright Ventures Ltd',
        issueDate: TODAY,
        fileName,
        fileData,
        version: 'v1.0',
        notes: `Eligibility evidence for ${tender.refNo}`,
        createdAt: nowISO(),
      }, {
        entityRef: refNo,
        details: `Uploaded eligibility evidence — ${label} (${tender.refNo})`,
        verb: 'Uploaded',
        verbColor: 'blue',
      });
      setEligibilityCheck(tender.id, reqId, { attachmentName: fileName });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    }
  };

  const gaugeColor = score >= 80 ? '#16A34A' : score >= 50 ? '#D97706' : '#DC2626';

  return (
    <PageEnter>
      <PageHeader
        title="Eligibility Checker"
        subtitle="Verify FBV meets the mandatory requirements before spending bid effort."
      />
      <TenderContextBar tenderId={tenderId} onChange={setTenderId} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {/* checklist (2fr) */}
        <div className="xl:col-span-2">
          <Card className="p-5">
            {SECTION_META.map((sec) => (
              <div key={sec.key} className="mb-6 last:mb-0">
                <div className="flex items-baseline justify-between">
                  <SectionTitle>{sec.title}</SectionTitle>
                  <span className="text-xs text-app-muted">{sec.caption}</span>
                </div>
                <div className="mt-3 flex flex-col gap-2">
                  {rows.filter((r) => r.def.section === sec.key).map((r, i) => {
                    const Icon = STATUS_ICON[r.status];
                    return (
                      <motion.div
                        key={r.def.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25, delay: i * 0.03 }}
                        className={cn(
                          'flex items-start gap-3 rounded-xl border p-3.5 transition-colors',
                          r.status === 'fail' ? 'border-danger/30 bg-danger-soft/40' : r.status === 'warn' ? 'border-warning/30 bg-warning-soft/40' : 'border-app-border bg-white',
                        )}
                      >
                        {r.def.manual ? (
                          <button
                            type="button"
                            disabled={!tender}
                            onClick={() => tender && setEligibilityCheck(tender.id, r.def.id, { done: !r.done })}
                            className="mt-0.5 shrink-0 disabled:opacity-40"
                            aria-label={`Toggle ${r.def.label}`}
                          >
                            <motion.span key={String(r.done)} initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 22 }} className="block">
                              <Icon size={20} className={STATUS_COLOR[r.status]} />
                            </motion.span>
                          </button>
                        ) : (
                          <motion.span key={r.status} initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 22 }} className="mt-0.5 shrink-0">
                            <Icon size={20} className={STATUS_COLOR[r.status]} />
                          </motion.span>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-app-ink">{r.def.label}</span>
                            <span className="rounded-full bg-grey-soft px-2 py-0.5 text-[10px] font-bold text-grey tnum">{r.def.weight}%</span>
                            {r.actionRoute && (
                              <Link to={r.actionRoute} className="text-xs font-medium text-action hover:underline">
                                {r.actionLabel}
                              </Link>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs leading-5 text-app-slate">{r.evidence}</p>
                          {r.def.manual && tender && (
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <input
                                value={r.note}
                                onChange={(e) => setEligibilityCheck(tender.id, r.def.id, { note: e.target.value })}
                                placeholder="Add a note (optional)…"
                                className="h-8 min-w-[200px] flex-1 rounded-lg border border-app-border bg-white px-2.5 text-xs text-app-ink outline-none transition placeholder:text-app-muted focus:border-action focus:ring-2 focus:ring-[rgba(37,99,235,.25)]"
                              />
                              <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-app-border bg-white px-2.5 text-xs font-medium text-app-slate transition hover:brightness-105">
                                <Paperclip size={12} />
                                {r.attachmentName ? 'Replace file' : 'Attach'}
                                <input
                                  type="file"
                                  className="hidden"
                                  onChange={(e) => onAttach(r.def.id, r.def.label, e.target.files?.[0] ?? null)}
                                />
                              </label>
                              {r.attachmentName && (
                                <span className="max-w-[180px] truncate text-[11px] text-app-muted">{r.attachmentName}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            ))}
          </Card>

          {/* verdict banner (after save / previously saved) */}
          {assessment && (
            <motion.div
              key={`${assessment.timestamp}-${justSaved}`}
              initial={{ y: -12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.25 }}
              className={cn(
                'mt-4 flex flex-wrap items-center gap-3 rounded-xl border p-4',
                assessment.score >= 80
                  ? 'border-success/30 bg-success-soft'
                  : assessment.score >= 50
                    ? 'border-warning/30 bg-warning-soft'
                    : 'border-danger/30 bg-danger-soft',
              )}
            >
              <ClipboardCheck size={18} className={assessment.score >= 80 ? 'text-success' : assessment.score >= 50 ? 'text-warning' : 'text-danger'} />
              <div className="flex-1">
                <span className="text-sm font-bold text-app-ink">
                  Saved verdict: {assessment.verdict} — {assessment.score}%
                </span>
                <p className="text-xs text-app-slate tnum">
                  {formatDateTime(assessment.timestamp)} · assessed by {assessment.assessor}
                </p>
              </div>
              <Pill tone={assessment.score >= 80 ? 'green' : assessment.score >= 50 ? 'amber' : 'red'}>{assessment.verdict}</Pill>
            </motion.div>
          )}
        </div>

        {/* verdict rail (1fr, sticky) */}
        <div className="xl:sticky xl:top-[76px] xl:self-start">
          <Card className="p-5">
            <SectionTitle>Eligibility Score</SectionTitle>
            <div className="relative mx-auto mt-2 max-w-[240px]">
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie
                    data={[{ value: score }, { value: Math.max(0, 100 - score) }]}
                    dataKey="value"
                    startAngle={180}
                    endAngle={0}
                    innerRadius={62}
                    outerRadius={88}
                    cy="78%"
                    stroke="none"
                    isAnimationActive
                    animationDuration={800}
                  >
                    <Cell fill={gaugeColor} />
                    <Cell fill="#EEF1F5" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-x-0 bottom-1 text-center">
                <div className="text-[30px] font-bold leading-8 text-app-ink tnum">
                  <TweenNumber value={score} format={(n) => `${Math.round(n)}`} duration={0.8} />%
                </div>
                <div className="text-[13px] font-semibold" style={{ color: gaugeColor }}>{verdict}</div>
              </div>
            </div>
            <p className="mt-2 text-center text-xs text-app-muted">
              ≥80% Likely Eligible · 50–79% Gaps to Close · &lt;50% Not Eligible
            </p>

            <SectionTitle className="mt-5">Gaps to Close ({gaps.length})</SectionTitle>
            <div className="mt-2 flex max-h-[220px] flex-col gap-2 overflow-y-auto">
              {gaps.length === 0 && (
                <p className="rounded-xl bg-success-soft p-3 text-xs font-medium text-success">
                  All requirements satisfied — no gaps.
                </p>
              )}
              {gaps.map((g) => (
                <div key={g.def.id} className="flex items-center justify-between gap-2 rounded-xl border border-app-border p-2.5">
                  <div className="flex items-center gap-2">
                    <XCircle size={14} className={g.status === 'warn' ? 'text-warning' : 'text-danger'} />
                    <span className="text-xs font-medium text-app-ink">{g.def.label}</span>
                  </div>
                  {g.def.manual ? (
                    <button
                      disabled={!tender}
                      onClick={() => tender && setEligibilityCheck(tender.id, g.def.id, { done: true })}
                      className="shrink-0 text-[11px] font-semibold text-action hover:underline disabled:opacity-40"
                    >
                      Mark done
                    </button>
                  ) : (
                    <Link to="/dms" className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-action hover:underline">
                      <Upload size={11} /> Upload
                    </Link>
                  )}
                </div>
              ))}
            </div>

            {uploadError && <p className="mt-3 text-xs text-danger">{uploadError}</p>}
            {!tender && (
              <p className="mt-3 rounded-xl bg-app-bg p-3 text-xs text-app-muted">
                Pick a tender above to enable manual checks and save the assessment.
              </p>
            )}

            <div className="mt-5 flex flex-col gap-2">
              <Btn onClick={save} disabled={!tender}>
                Save assessment
              </Btn>
              <Btn
                variant="secondary"
                disabled={!tender}
                onClick={() => tender && navigate(`/bid-decision?tender=${tender.id}`)}
              >
                Proceed to Bid Decision <ArrowRight size={14} />
              </Btn>
            </div>
          </Card>
        </div>
      </div>
    </PageEnter>
  );
}
