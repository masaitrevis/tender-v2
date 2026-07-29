/**
 * Document extras — fields the central FbvDocument model does not carry
 * (discount, internal reference, terms text, contract clauses/signatories).
 * Kept in a small page-local localStorage side-store keyed by document id
 * so the central store module remains untouched.
 */

export interface ContractMilestoneDraft {
  id: string;
  title: string;
  dueDate: string;
  amount: number;
  pushed?: boolean; // already fed into the Contract Milestones collection
}

export interface ContractExtras {
  startDate: string;
  endDate: string;
  penalty: string;
  signatoryFbv: string;
  signatoryClient: string;
  milestones: ContractMilestoneDraft[];
}

export interface DocExtras {
  discountType: 'amount' | 'percent';
  discountValue: number;
  internalRef: string;
  terms: string;
  contract: ContractExtras;
}

const KEY = 'fbv-doc-extras-v1';

export const DEFAULT_TERMS =
  'Payment terms: 30 days from invoice date. Prices are in Kenya Shillings (KES) and include VAT at 16% where applicable. Goods remain the property of Future Bright Ventures Ltd until paid in full.';

export const PENALTY_CLAUSES = [
  'None — standard remedies under the Laws of Kenya apply.',
  'Liquidated damages at 0.05% of the contract value per day of delay, capped at 10%.',
  'Penalty of 1% of the undelivered value per week of delay, capped at 10% of contract value.',
  'Interest at 2% per month on overdue payments, accruing daily.',
];

export function emptyContractExtras(): ContractExtras {
  return {
    startDate: '',
    endDate: '',
    penalty: PENALTY_CLAUSES[1],
    signatoryFbv: 'Admin User',
    signatoryClient: '',
    milestones: [],
  };
}

export function emptyExtras(): DocExtras {
  return {
    discountType: 'amount',
    discountValue: 0,
    internalRef: '',
    terms: DEFAULT_TERMS,
    contract: emptyContractExtras(),
  };
}

function readAll(): Record<string, DocExtras> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Record<string, DocExtras>;
  } catch {
    /* corrupted — start fresh */
  }
  return {};
}

function writeAll(map: Record<string, DocExtras>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* quota — non-fatal */
  }
}

/** Extras for a document id; merged over defaults so old records stay valid. */
export function getDocExtras(id: string | undefined): DocExtras {
  const base = emptyExtras();
  if (!id) return base;
  const stored = readAll()[id];
  if (!stored) return base;
  return {
    ...base,
    ...stored,
    contract: { ...base.contract, ...(stored.contract ?? {}) },
  };
}

export function setDocExtras(id: string, extras: DocExtras): void {
  const map = readAll();
  map[id] = extras;
  writeAll(map);
}

export function removeDocExtras(id: string): void {
  const map = readAll();
  delete map[id];
  writeAll(map);
}
