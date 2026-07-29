/**
 * Tender tools data layer — page-local extension store for tender fields and
 * engine results that are NOT part of the central AppState schema:
 * officer assignment, department, win probability, competitors, bid-bond
 * commercials, eligibility assessments, bid/no-bid decisions and BOQ estimates.
 *
 * Persisted to localStorage under its own key. Audit Trail / Recent Activity
 * entries are written through the central store via `logActivity`.
 */
import { useSyncExternalStore } from 'react';
import { logActivity, uid, nowISO } from '@/lib/store';
import type { TenderStatus } from '@/lib/store';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface TenderExtras {
  department?: string;
  assignedOfficerId?: string;
  winProbability?: number; // 0–100
  competitors?: string[];
  bidBondAmount?: number;
  securityType?: string;
  submittedDate?: string; // actual submission date (vs. deadline)
  lostReason?: string;
}

export interface EligibilityCheckState {
  done: boolean;
  note?: string;
  attachmentName?: string;
}

export type EligibilityVerdict = 'Likely Eligible' | 'Gaps to Close' | 'Not Eligible';

export interface EligibilityAssessment {
  tenderId: string;
  score: number; // 0–100
  verdict: EligibilityVerdict;
  gaps: string[];
  assessor: string;
  timestamp: string;
}

export type BidVerdict = 'BID' | 'CAUTION' | 'NO-BID';

export interface BidDecision {
  id: string;
  tenderId: string;
  ratings: Record<string, number>; // criterionId -> 1..5
  weights: Record<string, number>; // criterionId -> % (totals 100)
  score: number; // 0–100
  verdict: BidVerdict;
  notes?: string;
  decidedBy: string;
  decidedAt: string;
}

export interface BoqItem {
  id: string;
  productId?: string;
  description: string;
  unit: string;
  qty: number;
  rate: number;
}

export interface BoqSection {
  id: string;
  title: string;
  items: BoqItem[];
}

export type EstimateStatus = 'Draft' | 'Pushed to Quotation';

export interface Estimate {
  id: string;
  tenderId: string;
  sections: BoqSection[];
  overheadsPct: number;
  contingencyPct: number;
  marginPct: number;
  discountPct: number;
  status: EstimateStatus;
  quotationDocNo?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExtrasState {
  tenders: Record<string, TenderExtras>;
  eligibilityChecks: Record<string, Record<string, EligibilityCheckState>>;
  eligibility: Record<string, EligibilityAssessment>;
  bidDecisions: BidDecision[];
  estimates: Estimate[];
}

const EMPTY: ExtrasState = {
  tenders: {},
  eligibilityChecks: {},
  eligibility: {},
  bidDecisions: [],
  estimates: [],
};

/* ------------------------------------------------------------------ */
/* Persistence + subscription engine                                   */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = 'fbv-tcms-v2-tender-extras';

function load(): ExtrasState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ExtrasState>;
      return { ...EMPTY, ...parsed };
    }
  } catch {
    /* corrupted — start fresh */
  }
  return EMPTY;
}

let state: ExtrasState = load();
const listeners = new Set<() => void>();

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function commit(next: ExtrasState) {
  state = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota */
  }
  listeners.forEach((l) => l());
}

/** React hook — re-renders when any tender-extras slice changes. */
export function useExtras(): ExtrasState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

export function getExtras(): ExtrasState {
  return state;
}

/* ------------------------------------------------------------------ */
/* Tender extras (register columns + drawer fields)                    */
/* ------------------------------------------------------------------ */

export function setTenderExtras(
  tenderId: string,
  patch: TenderExtras,
  log?: { refNo: string; details?: string },
): void {
  commit({
    ...state,
    tenders: {
      ...state.tenders,
      [tenderId]: { ...state.tenders[tenderId], ...patch },
    },
  });
  if (log) {
    logActivity({
      action: 'Updated',
      entity: 'Tender',
      entityRef: log.refNo,
      details: log.details ?? `Tender details updated — ${log.refNo}`,
      verb: 'Updated',
      verbColor: 'blue',
    });
  }
}

/** Default win probability by status when no explicit value is stored. */
export const DEFAULT_WIN_PROB: Record<TenderStatus, number> = {
  Open: 50,
  Submitted: 70,
  'Under Evaluation': 65,
  Won: 100,
  Lost: 0,
  Cancelled: 0,
};

export function winProbabilityOf(tenderId: string, status: TenderStatus): number {
  return state.tenders[tenderId]?.winProbability ?? DEFAULT_WIN_PROB[status];
}

/* ------------------------------------------------------------------ */
/* Eligibility checker                                                 */
/* ------------------------------------------------------------------ */

export function setEligibilityCheck(
  tenderId: string,
  reqId: string,
  patch: Partial<EligibilityCheckState>,
): void {
  const forTender = state.eligibilityChecks[tenderId] ?? {};
  const cur = forTender[reqId] ?? { done: false };
  commit({
    ...state,
    eligibilityChecks: {
      ...state.eligibilityChecks,
      [tenderId]: { ...forTender, [reqId]: { ...cur, ...patch } },
    },
  });
}

export function saveEligibilityAssessment(a: EligibilityAssessment, refNo: string): void {
  commit({ ...state, eligibility: { ...state.eligibility, [a.tenderId]: a } });
  logActivity({
    action: 'Updated',
    entity: 'Eligibility',
    entityRef: refNo,
    details: `Eligibility checked — ${a.score}% ${a.verdict} · ${a.assessor}`,
    verb: 'Eligibility checked',
    verbColor: a.score >= 80 ? 'green' : a.score >= 50 ? 'gold' : 'red',
    text: `Eligibility ${a.score}% — ${a.verdict} (${refNo})`,
  });
}

/* ------------------------------------------------------------------ */
/* Bid / No-Bid decisions                                              */
/* ------------------------------------------------------------------ */

export function saveBidDecision(d: BidDecision, refNo: string): void {
  commit({ ...state, bidDecisions: [d, ...state.bidDecisions] });
  logActivity({
    action: 'Updated',
    entity: 'Bid Decision',
    entityRef: refNo,
    details: `Bid/No-Bid decision — ${d.verdict} at ${d.score}% · ${d.decidedBy}`,
    verb: 'Bid decision',
    verbColor: d.verdict === 'BID' ? 'green' : d.verdict === 'CAUTION' ? 'gold' : 'red',
    text: `${d.verdict === 'NO-BID' ? 'Do Not Bid' : d.verdict === 'CAUTION' ? 'Bid with Caution' : 'Bid'} — score ${d.score} (${refNo})`,
  });
}

export function latestBidDecision(tenderId: string, s: ExtrasState = state): BidDecision | undefined {
  return s.bidDecisions.find((d) => d.tenderId === tenderId);
}

/* ------------------------------------------------------------------ */
/* Cost estimation & BOQ                                               */
/* ------------------------------------------------------------------ */

export function saveEstimate(e: Estimate, refNo: string): void {
  const idx = state.estimates.findIndex((x) => x.id === e.id);
  const estimates = idx >= 0 ? state.estimates.map((x) => (x.id === e.id ? e : x)) : [e, ...state.estimates];
  commit({ ...state, estimates });
  logActivity({
    action: idx >= 0 ? 'Updated' : 'Created',
    entity: 'Estimate',
    entityRef: refNo,
    details: `Cost estimate saved — ${refNo} (${e.sections.length} sections)`,
    verb: 'Saved estimate',
    verbColor: 'navy',
  });
}

export function markEstimatePushed(id: string, docNo: string, refNo: string): void {
  commit({
    ...state,
    estimates: state.estimates.map((x) =>
      x.id === id ? { ...x, status: 'Pushed to Quotation' as const, quotationDocNo: docNo, updatedAt: nowISO() } : x,
    ),
  });
  logActivity({
    action: 'Created',
    entity: 'Quotation',
    entityRef: docNo,
    details: `Quotation ${docNo} generated from BOQ estimate — ${refNo}`,
    verb: 'Generated',
    verbColor: 'gold',
    text: `Quotation ${docNo} generated from BOQ (${refNo})`,
  });
}

export function latestEstimate(tenderId: string, s: ExtrasState = state): Estimate | undefined {
  return s.estimates.find((e) => e.tenderId === tenderId);
}

export function newBoqItem(partial?: Partial<BoqItem>): BoqItem {
  return { id: uid('boq'), description: '', unit: 'pcs', qty: 1, rate: 0, ...partial };
}

export function newBoqSection(title: string): BoqSection {
  return { id: uid('sec'), title, items: [newBoqItem()] };
}

/* ------------------------------------------------------------------ */
/* Bid price cascade                                                   */
/* ------------------------------------------------------------------ */

export interface EstimateTotals {
  direct: number;
  overheads: number;
  contingency: number;
  subtotal: number;
  margin: number;
  bidExVat: number;
  discount: number;
  net: number;
  vat: number;
  total: number;
  profit: number;
  marginOnBid: number; // profit / net * 100
}

export function computeTotals(input: {
  sections: BoqSection[];
  overheadsPct: number;
  contingencyPct: number;
  marginPct: number;
  discountPct: number;
}, vatRate = 16): EstimateTotals {
  const direct = input.sections.reduce(
    (s, sec) => s + sec.items.reduce((a, it) => a + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0),
    0,
  );
  const overheads = (direct * input.overheadsPct) / 100;
  const contingency = ((direct + overheads) * input.contingencyPct) / 100;
  const subtotal = direct + overheads + contingency;
  const margin = (subtotal * input.marginPct) / 100;
  const bidExVat = subtotal + margin;
  const discount = (bidExVat * input.discountPct) / 100;
  const net = bidExVat - discount;
  const vat = (net * vatRate) / 100;
  const total = net + vat;
  const profit = net - subtotal;
  const marginOnBid = net > 0 ? (profit / net) * 100 : 0;
  return { direct, overheads, contingency, subtotal, margin, bidExVat, discount, net, vat, total, profit, marginOnBid };
}
