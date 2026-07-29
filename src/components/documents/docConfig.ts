/**
 * Shared document-type metadata + status/derivation helpers for the
 * Document Center, Document Editor and Payment Tracker.
 */
import type { LucideIcon } from 'lucide-react';
import {
  FileText, FileClock, FileCheck, Receipt, ShoppingCart, ScrollText,
} from 'lucide-react';
import type { AppState, Approval, DocType, FbvDocument } from '@/lib/store';
import { daysUntil } from '@/lib/store';
import type { Tone } from '@/components/shared';

export interface DocTypeMeta {
  type: DocType;
  label: string; // singular, e.g. "Quotation"
  plural: string; // e.g. "Quotations"
  title: string; // printed doc title, e.g. "TAX INVOICE"
  icon: LucideIcon;
  tile: string; // icon tile classes
  purpose: string; // one-liner for the type picker
}

export const DOC_TYPES: DocTypeMeta[] = [
  {
    type: 'quotation', label: 'Quotation', plural: 'Quotations', title: 'QUOTATION',
    icon: FileText, tile: 'bg-info-soft text-info',
    purpose: 'Send pricing to a client',
  },
  {
    type: 'proforma', label: 'Proforma Invoice', plural: 'Proforma', title: 'PROFORMA INVOICE',
    icon: FileClock, tile: 'bg-purple-soft text-purple',
    purpose: 'Request payment before delivery',
  },
  {
    type: 'invoice', label: 'Tax Invoice', plural: 'Tax Invoices', title: 'TAX INVOICE',
    icon: FileCheck, tile: 'bg-[#E4EBF4] text-navy-800',
    purpose: 'Bill a client for goods or services',
  },
  {
    type: 'receipt', label: 'Receipt', plural: 'Receipts', title: 'RECEIPT',
    icon: Receipt, tile: 'bg-success-soft text-success',
    purpose: 'Acknowledge payment received',
  },
  {
    type: 'purchase-order', label: 'Purchase Order', plural: 'Purchase Orders', title: 'PURCHASE ORDER',
    icon: ShoppingCart, tile: 'bg-warning-soft text-warning',
    purpose: 'Order goods from a supplier',
  },
  {
    type: 'contract', label: 'Contract', plural: 'Contracts', title: 'CONTRACT AGREEMENT',
    icon: ScrollText, tile: 'bg-gold-soft text-gold',
    purpose: 'Formalise an awarded engagement',
  },
];

export const DOC_META: Record<DocType, DocTypeMeta> = Object.fromEntries(
  DOC_TYPES.map((m) => [m.type, m]),
) as Record<DocType, DocTypeMeta>;

/** Conversion chain: QUO → PRO → INV → RCT; PO and CON convert to INV too. */
export const NEXT_STAGE: Record<DocType, DocType | null> = {
  quotation: 'proforma',
  proforma: 'invoice',
  invoice: 'receipt',
  receipt: null,
  'purchase-order': 'invoice',
  contract: 'invoice',
};

/* ------------------------------------------------------------------ */
/* Approval linkage (Approvals store rows carry `doc:<id>` in notes)    */
/* ------------------------------------------------------------------ */

export function approvalFor(doc: FbvDocument, approvals: Approval[]): Approval | undefined {
  return approvals.find((a) => a.notes === `doc:${doc.id}`);
}

/** Design display status: Draft / Submitted / Approved / Sent / Issued / Partly Paid / Paid / Overdue / Cancelled. */
export type DocDisplayStatus =
  | 'Draft' | 'Submitted' | 'Approved' | 'Sent' | 'Issued'
  | 'Partly Paid' | 'Paid' | 'Overdue' | 'Cancelled';

export function docDisplayStatus(doc: FbvDocument, approvals: Approval[]): DocDisplayStatus {
  if (doc.status === 'Cancelled') return 'Cancelled';
  if (doc.status === 'Paid') return 'Paid';
  // Invoices derive lateness from the due date (join with Payments logic).
  if (doc.type === 'invoice' && doc.status !== 'Draft' && doc.status !== 'Sent') {
    const balance = doc.total - doc.amountPaid;
    if (balance <= 0) return 'Paid';
    if (doc.dueDate && daysUntil(doc.dueDate) < 0) return 'Overdue';
    if (doc.amountPaid > 0) return 'Partly Paid';
    return doc.status === 'Issued' ? 'Issued' : 'Sent';
  }
  if (doc.status === 'Partly Paid') {
    if (doc.dueDate && daysUntil(doc.dueDate) < 0) return 'Overdue';
    return 'Partly Paid';
  }
  if (doc.status === 'Overdue') return 'Overdue';
  if (doc.status === 'Issued') return 'Issued';
  if (doc.status === 'Sent') {
    const apr = approvalFor(doc, approvals);
    if (apr?.status === 'Approved') return 'Approved';
    if (apr?.status === 'Pending') return 'Submitted';
    return 'Sent';
  }
  return 'Draft';
}

export const DOC_STATUS_TONE: Record<DocDisplayStatus, Tone> = {
  Draft: 'grey',
  Submitted: 'amber',
  Approved: 'blue',
  Sent: 'amber',
  Issued: 'navy',
  'Partly Paid': 'amber',
  Paid: 'green',
  Overdue: 'red',
  Cancelled: 'red',
};

/** Can this document be converted to the next stage? (Approved / Issued / Paid docs only.) */
export function canConvert(doc: FbvDocument, approvals: Approval[]): boolean {
  if (!NEXT_STAGE[doc.type]) return false;
  const s = docDisplayStatus(doc, approvals);
  return s === 'Approved' || s === 'Issued' || s === 'Paid' || s === 'Partly Paid' || s === 'Overdue';
}

/** Editing locks once a document is issued (or further down the money trail). */
export function isLocked(doc: FbvDocument): boolean {
  return doc.status === 'Issued' || doc.status === 'Paid' || doc.status === 'Partly Paid'
    || doc.status === 'Overdue' || doc.status === 'Cancelled';
}

/** Short lineage crumb, e.g. "QUO-003 → PRO-003". */
export function shortNo(docNo: string): string {
  const m = docNo.match(/^FBV-([A-Z]+)-\d+-(\d+)$/);
  return m ? `${m[1]}-${m[2]}` : docNo;
}

export function clientOf(s: AppState, id: string) {
  return s.clients.find((c) => c.id === id);
}

export function docTenderRef(s: AppState, doc: FbvDocument): string | undefined {
  return doc.tenderId ? s.tenders.find((t) => t.id === doc.tenderId)?.refNo : undefined;
}

/* ------------------------------------------------------------------ */
/* Conversion chain — carry client, lines and totals forward           */
/* ------------------------------------------------------------------ */

import { nextDocNumber, uid, TODAY } from '@/lib/store';

/** Build the next-stage document (QUO→PRO→INV→RCT; PO/CON→INV). Pure — caller adds it. */
export function buildConvertedDoc(s: AppState, source: FbvDocument, target: DocType): FbvDocument {
  const prefix = s.settings.docPrefixes[target] ?? 'FBV-DOC';
  const docNo = nextDocNumber(prefix, s.settings.docYear, s);
  const base = {
    id: uid('doc'),
    docNo,
    type: target,
    clientId: source.clientId,
    tenderId: source.tenderId,
    issueDate: TODAY,
    convertedFromId: source.id,
    createdAt: `${TODAY}T09:00:00`,
  };
  if (target === 'receipt') {
    // Receipt covers the outstanding balance of the source document.
    const balance = Math.max(0, source.total - source.amountPaid);
    return {
      ...base,
      dueDate: undefined,
      status: 'Paid',
      lines: [{
        id: uid('ln'),
        description: `Payment received — ${source.docNo}`,
        qty: 1, unit: 'lot', unitPrice: balance, amount: balance,
      }],
      subtotal: balance,
      vatAmount: 0,
      total: balance,
      amountPaid: balance,
      notes: `Receipt converted from ${source.docNo}`,
    };
  }
  const dueDate = target === 'invoice' ? addDays(TODAY, 30) : undefined;
  return {
    ...base,
    dueDate,
    status: 'Draft',
    lines: source.lines.map((l) => ({ ...l, id: uid('ln') })),
    subtotal: source.subtotal,
    vatAmount: source.vatAmount,
    total: source.total,
    amountPaid: 0,
    notes: `Converted from ${source.docNo}`,
  };
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
