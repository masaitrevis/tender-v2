/**
 * LetterheadDoc — A4 (794×1123px) document renderer fed by the Company
 * Profile store. Used for the live preview pane and the print portal.
 * Also exports `useDocPrinter()` which mounts a body-level print portal and
 * triggers the native print dialog (print rules live in src/styles/print.css).
 */
import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import type { AppState, CompanyProfile, DocType, DocumentLine, FbvDocument } from '@/lib/store';
import { formatDate, formatKES } from '@/lib/format';
import { vatAmount } from '@/lib/format';
import { DOC_META } from './docConfig';
import { getDocExtras } from './extras';
import type { ContractExtras } from './extras';
import '@/styles/print.css';

/* ------------------------------------------------------------------ */
/* Types & helpers                                                     */
/* ------------------------------------------------------------------ */

export interface PartyInfo {
  name: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  kraPin?: string;
  address?: string;
  city?: string;
}

/** Resolve the counterparty for a document (POs bill suppliers, the rest bill clients). */
export function resolveParty(s: AppState, type: DocType, partyId: string): PartyInfo | null {
  if (!partyId) return null;
  if (type === 'purchase-order') {
    const sup = s.suppliers.find((x) => x.id === partyId);
    if (!sup) return null;
    return {
      name: sup.name, contactPerson: sup.contactPerson, email: sup.email,
      phone: sup.phone, kraPin: sup.kraPin, address: sup.address, city: sup.city,
    };
  }
  const cli = s.clients.find((x) => x.id === partyId);
  if (!cli) return null;
  return {
    name: cli.name, contactPerson: cli.contactPerson, email: cli.email,
    phone: cli.phone, kraPin: cli.kraPin, address: cli.address, city: cli.city,
  };
}

export interface LetterPayment {
  method: string;
  reference: string;
  date: string;
}

/** Everything the letterhead needs to render one document. */
export interface LetterDoc {
  type: DocType;
  docNo: string;
  issueDate: string;
  dueDate?: string;
  party: PartyInfo | null;
  partyLabel: string; // "Bill To" / "Supplier" / "Received From"
  tenderRef?: string;
  lines: DocumentLine[];
  subtotal: number;
  discountAmount: number;
  vat: number;
  total: number;
  terms?: string;
  payment?: LetterPayment; // receipts
  contract?: ContractExtras; // contract clause layout
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function threeDigits(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h) parts.push(`${ONES[h]} Hundred`);
  if (rest) {
    if (rest < 20) parts.push(ONES[rest]);
    else {
      const t = Math.floor(rest / 10);
      const o = rest % 10;
      parts.push(o ? `${TENS[t]}-${ONES[o]}` : TENS[t]);
    }
  }
  return parts.join(' ');
}

/** `1,234,560.5` → "One Million Two Hundred … Kenya Shillings and Fifty Cents Only". */
export function amountInWords(amount: number): string {
  const shillings = Math.floor(Math.abs(amount));
  const cents = Math.round((Math.abs(amount) - shillings) * 100);
  const groups: Array<[number, string]> = [
    [Math.floor(shillings / 1_000_000_000), 'Billion'],
    [Math.floor((shillings % 1_000_000_000) / 1_000_000), 'Million'],
    [Math.floor((shillings % 1_000_000) / 1_000), 'Thousand'],
    [shillings % 1_000, ''],
  ];
  const words = groups
    .filter(([n]) => n > 0)
    .map(([n, label]) => `${threeDigits(n)}${label ? ` ${label}` : ''}`)
    .join(' ');
  const base = words || 'Zero';
  return cents > 0
    ? `${base} Kenya Shillings and ${threeDigits(cents)} Cents Only`
    : `${base} Kenya Shillings Only`;
}

function profileIncomplete(p: CompanyProfile): boolean {
  return !p.name || !p.kraPin || !p.address || !p.phone || !p.email;
}

/* ------------------------------------------------------------------ */
/* Small building blocks                                               */
/* ------------------------------------------------------------------ */

function MiniTitle({ children }: { children: ReactNode }) {
  return (
    <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#8494A7]">{children}</div>
  );
}

function PartyBox({ label, party }: { label: string; party: PartyInfo | null }) {
  return (
    <div className="fbv-doc-avoid-break rounded-lg border border-[#E4E9F0] bg-[#F8FAFC] p-4">
      <MiniTitle>{label}</MiniTitle>
      {party ? (
        <div className="mt-1.5 text-[12px] leading-5 text-[#1A2B3C]">
          <div className="text-[13px] font-bold">{party.name}</div>
          {party.contactPerson && <div>Attn: {party.contactPerson}</div>}
          {party.address && <div>{party.address}{party.city ? `, ${party.city}` : ''}</div>}
          {party.phone && <div>Tel: {party.phone}{party.email ? ` · ${party.email}` : ''}</div>}
          {party.kraPin && (
            <div>
              KRA PIN: <span className="font-mono font-medium">{party.kraPin}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-1.5 text-[12px] italic text-[#8494A7]">No counterparty selected.</div>
      )}
    </div>
  );
}

function LinesTable({ doc }: { doc: LetterDoc }) {
  const isReceipt = doc.type === 'receipt';
  return (
    <table className="fbv-doc-table mt-5 w-full border-collapse">
      <thead>
        <tr className="bg-[#1F3B57] text-white">
          <th className="w-8 px-2 py-2 text-left text-[10px] font-bold uppercase tracking-[0.06em]">#</th>
          <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-[0.06em]">
            {isReceipt ? 'Particulars' : 'Description'}
          </th>
          <th className="w-14 px-2 py-2 text-right text-[10px] font-bold uppercase tracking-[0.06em]">Qty</th>
          <th className="w-16 px-2 py-2 text-left text-[10px] font-bold uppercase tracking-[0.06em]">Unit</th>
          <th className="w-28 px-2 py-2 text-right text-[10px] font-bold uppercase tracking-[0.06em]">Unit Price</th>
          <th className="w-32 px-2 py-2 text-right text-[10px] font-bold uppercase tracking-[0.06em]">Amount</th>
        </tr>
      </thead>
      <tbody>
        {doc.lines.map((l, i) => (
          <tr key={l.id} className={i % 2 === 1 ? 'bg-[#F8FAFC]' : 'bg-white'}>
            <td className="border-b border-[#EEF1F5] px-2 py-2 text-[11px] text-[#8494A7]">{i + 1}</td>
            <td className="border-b border-[#EEF1F5] px-2 py-2 text-[12px] text-[#1A2B3C]">{l.description}</td>
            <td className="border-b border-[#EEF1F5] px-2 py-2 text-right text-[12px] tabular-nums text-[#1A2B3C]">{l.qty}</td>
            <td className="border-b border-[#EEF1F5] px-2 py-2 text-[12px] text-[#5B6B7C]">{l.unit}</td>
            <td className="border-b border-[#EEF1F5] px-2 py-2 text-right text-[12px] tabular-nums text-[#1A2B3C]">
              {formatKES(l.unitPrice)}
            </td>
            <td className="border-b border-[#EEF1F5] px-2 py-2 text-right text-[12px] font-semibold tabular-nums text-[#1A2B3C]">
              {formatKES(l.amount)}
            </td>
          </tr>
        ))}
        {doc.lines.length === 0 && (
          <tr>
            <td colSpan={6} className="border-b border-[#EEF1F5] px-2 py-6 text-center text-[12px] italic text-[#8494A7]">
              No line items yet.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function TotalsBlock({ doc }: { doc: LetterDoc }) {
  const isReceipt = doc.type === 'receipt';
  return (
    <div className="fbv-doc-avoid-break ml-auto mt-3 w-[300px]">
      <div className="flex justify-between py-1 text-[12px] text-[#5B6B7C]">
        <span>Subtotal</span>
        <span className="tabular-nums text-[#1A2B3C]">{formatKES(doc.subtotal)}</span>
      </div>
      {doc.discountAmount > 0 && (
        <div className="flex justify-between py-1 text-[12px] text-[#5B6B7C]">
          <span>Discount</span>
          <span className="tabular-nums text-[#DC2626]">− {formatKES(doc.discountAmount)}</span>
        </div>
      )}
      {!isReceipt && (
        <div className="flex justify-between py-1 text-[12px] text-[#5B6B7C]">
          <span>VAT 16%</span>
          <span className="tabular-nums text-[#1A2B3C]">{formatKES(doc.vat)}</span>
        </div>
      )}
      <div
        className="mt-1 flex items-baseline justify-between pt-2"
        style={{ borderTop: '3px double #1A2B3C' }}
      >
        <span className="text-[13px] font-bold uppercase tracking-[0.04em] text-[#1F3B57]">
          {isReceipt ? 'Total Received KES' : 'Grand Total KES'}
        </span>
        <span className="text-[17px] font-bold tabular-nums text-[#1F3B57]">{formatKES(doc.total)}</span>
      </div>
      {isReceipt && (
        <div className="mt-1 text-right text-[10px] italic leading-4 text-[#5B6B7C]">
          {amountInWords(doc.total)}
        </div>
      )}
    </div>
  );
}

function PaymentDetailsBox({ profile }: { profile: CompanyProfile }) {
  return (
    <div className="fbv-doc-avoid-break mt-6 rounded-lg border border-[#E4E9F0] p-4">
      <MiniTitle>Payment Details</MiniTitle>
      <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-[12px] leading-5 text-[#1A2B3C]">
        <div><span className="text-[#8494A7]">Bank:</span> {profile.bankName || '—'}</div>
        <div><span className="text-[#8494A7]">Branch:</span> {profile.bankBranch || '—'}</div>
        <div>
          <span className="text-[#8494A7]">Account No:</span>{' '}
          <span className="font-mono font-medium">{profile.bankAccount || '—'}</span>
        </div>
        <div>
          <span className="text-[#8494A7]">SWIFT:</span>{' '}
          <span className="font-mono font-medium">{profile.bankSwift || '—'}</span>
        </div>
      </div>
    </div>
  );
}

function ReceiptPaymentBox({ payment }: { payment: LetterPayment }) {
  return (
    <div className="fbv-doc-avoid-break mt-5 rounded-lg border border-[#E4E9F0] p-4">
      <MiniTitle>Payment Received Via</MiniTitle>
      <div className="mt-2 grid grid-cols-3 gap-4 text-[12px] leading-5 text-[#1A2B3C]">
        <div><span className="text-[#8494A7]">Mode:</span> <span className="font-semibold">{payment.method}</span></div>
        <div>
          <span className="text-[#8494A7]">Reference:</span>{' '}
          <span className="font-mono font-medium">{payment.reference || '—'}</span>
        </div>
        <div><span className="text-[#8494A7]">Date:</span> {formatDate(payment.date)}</div>
      </div>
    </div>
  );
}

function SignatureRow({ profile }: { profile: CompanyProfile }) {
  return (
    <div className="fbv-doc-avoid-break mt-8 flex items-end justify-between gap-10">
      <div className="w-[240px]">
        <div className="flex h-[64px] items-end justify-center">
          {profile.signatureData ? (
            <img src={`data:image/png;base64,${profile.signatureData}`} alt="Signature" className="max-h-[64px]" />
          ) : (
            <div className="flex h-[48px] w-full items-center justify-center rounded border border-dashed border-[#C6CFDA] text-[10px] uppercase tracking-[0.1em] text-[#8494A7]">
              Signature
            </div>
          )}
        </div>
        <div className="mt-1 border-t border-[#1A2B3C] pt-1 text-center text-[10px] uppercase tracking-[0.08em] text-[#5B6B7C]">
          Authorized Signatory · Date
        </div>
      </div>
      <div className="w-[200px]">
        <div className="flex h-[64px] items-end justify-center">
          {profile.stampData ? (
            <img src={`data:image/png;base64,${profile.stampData}`} alt="Company stamp" className="max-h-[64px]" />
          ) : (
            <div className="flex h-[56px] w-[120px] items-center justify-center rounded border border-dashed border-[#C6CFDA] text-[10px] uppercase tracking-[0.1em] text-[#8494A7]">
              Stamp
            </div>
          )}
        </div>
        <div className="mt-1 border-t border-[#1A2B3C] pt-1 text-center text-[10px] uppercase tracking-[0.08em] text-[#5B6B7C]">
          Company Stamp
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Contract clause layout                                              */
/* ------------------------------------------------------------------ */

function Clause({ no, title, children }: { no: number; title: string; children: ReactNode }) {
  return (
    <div className="fbv-doc-avoid-break mt-5">
      <div className="text-[12px] font-bold uppercase tracking-[0.05em] text-[#1F3B57]">
        {no}. {title}
      </div>
      <div className="mt-1.5 text-[12px] leading-5 text-[#1A2B3C]">{children}</div>
    </div>
  );
}

function ContractBody({ doc, profile }: { doc: LetterDoc; profile: CompanyProfile }) {
  const c = doc.contract;
  const partyName = doc.party?.name ?? 'the Client';
  const clauses: ReactNode[] = [];
  let n = 0;
  const next = () => ++n;

  clauses.push(
    <Clause key="scope" no={next()} title="Scope of Works &amp; Supplies">
      The Contractor shall supply and/or deliver the following goods and services to {partyName}:
      <LinesTable doc={doc} />
    </Clause>,
  );
  clauses.push(
    <Clause key="period" no={next()} title="Contract Period">
      This Agreement runs from <strong>{formatDate(c?.startDate)}</strong> to{' '}
      <strong>{formatDate(c?.endDate)}</strong>, unless terminated earlier in accordance with its terms.
    </Clause>,
  );
  clauses.push(
    <Clause key="value" no={next()} title="Contract Value">
      The total contract value is <strong>{formatKES(doc.total)}</strong>
      {doc.discountAmount > 0 && <> (after a discount of {formatKES(doc.discountAmount)})</>}, inclusive of VAT at 16%.
      <div className="mt-1 italic text-[#5B6B7C]">{amountInWords(doc.total)}.</div>
    </Clause>,
  );
  clauses.push(
    <Clause key="terms" no={next()} title="Payment Terms">
      {doc.terms || 'Payment shall be made within thirty (30) days of receipt of a valid tax invoice.'}
    </Clause>,
  );
  clauses.push(
    <Clause key="penalty" no={next()} title="Penalties &amp; Liquidated Damages">
      {c?.penalty || 'Standard remedies under the Laws of Kenya apply.'}
    </Clause>,
  );
  if (c && c.milestones.length > 0) {
    clauses.push(
      <Clause key="milestones" no={next()} title="Contract Milestones">
        <table className="fbv-doc-table mt-2 w-full border-collapse">
          <thead>
            <tr className="bg-[#1F3B57] text-white">
              <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-[0.06em]">Milestone</th>
              <th className="w-28 px-2 py-2 text-left text-[10px] font-bold uppercase tracking-[0.06em]">Due Date</th>
              <th className="w-32 px-2 py-2 text-right text-[10px] font-bold uppercase tracking-[0.06em]">Amount</th>
            </tr>
          </thead>
          <tbody>
            {c.milestones.map((m, i) => (
              <tr key={m.id} className={i % 2 === 1 ? 'bg-[#F8FAFC]' : 'bg-white'}>
                <td className="border-b border-[#EEF1F5] px-2 py-2 text-[12px]">{m.title}</td>
                <td className="border-b border-[#EEF1F5] px-2 py-2 text-[12px] tabular-nums">{formatDate(m.dueDate)}</td>
                <td className="border-b border-[#EEF1F5] px-2 py-2 text-right text-[12px] tabular-nums">
                  {m.amount > 0 ? formatKES(m.amount) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Clause>,
    );
  }
  clauses.push(
    <Clause key="law" no={next()} title="Governing Law">
      This Agreement is governed by the Laws of Kenya. Any dispute shall be resolved amicably, failing which
      it shall be referred to arbitration in Nairobi under the Arbitration Act, 1995.
    </Clause>,
  );

  return (
    <>
      <p className="mt-5 text-[12px] leading-5 text-[#1A2B3C]">
        This Agreement is made on <strong>{formatDate(doc.issueDate)}</strong> between{' '}
        <strong>{profile.name}</strong> of {profile.address}, {profile.city} (the “Contractor”) and{' '}
        <strong>{partyName}</strong>
        {doc.party?.address ? ` of ${doc.party.address}${doc.party.city ? `, ${doc.party.city}` : ''}` : ''}{' '}
        (the “Client”), together the “Parties”.
      </p>
      {clauses}
      <div className="fbv-doc-avoid-break mt-8 grid grid-cols-2 gap-10">
        {[
          { head: `For ${profile.name}`, name: c?.signatoryFbv || 'Admin User', img: profile.signatureData },
          { head: `For ${partyName}`, name: c?.signatoryClient || doc.party?.contactPerson || '________________', img: undefined },
        ].map((s) => (
          <div key={s.head}>
            <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#1F3B57]">{s.head}</div>
            <div className="mt-3 flex h-[56px] items-end">
              {s.img ? (
                <img src={`data:image/png;base64,${s.img}`} alt="Signature" className="max-h-[56px]" />
              ) : (
                <div className="w-full border-b border-[#1A2B3C]" />
              )}
            </div>
            <div className="mt-1 text-[11px] text-[#5B6B7C]">
              Name: <span className="font-semibold text-[#1A2B3C]">{s.name}</span>
            </div>
            <div className="text-[11px] text-[#5B6B7C]">Signature &amp; Date</div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Main renderer                                                       */
/* ------------------------------------------------------------------ */

export function LetterheadDoc({
  doc,
  profile,
  scale = 1,
}: {
  doc: LetterDoc;
  profile: CompanyProfile;
  scale?: number;
}) {
  const meta = DOC_META[doc.type];
  const isContract = doc.type === 'contract';
  const showPaymentBox = doc.type === 'quotation' || doc.type === 'proforma'
    || doc.type === 'invoice' || doc.type === 'purchase-order';

  return (
    <div
      className="fbv-a4 fbv-print-sheet bg-white text-[#1A2B3C] shadow-[0_10px_36px_rgba(15,36,56,.18)]"
      style={{
        width: 794,
        minHeight: 1123,
        padding: '44px 48px 36px',
        transform: scale === 1 ? undefined : `scale(${scale})`,
        transformOrigin: 'top left',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* 1 — Letterhead header */}
      <div className="flex items-start justify-between gap-6">
        <div className="flex items-center gap-3">
          <img
            src={profile.logoData ? `data:image/png;base64,${profile.logoData}` : '/logo.svg'}
            alt={profile.name}
            className="h-16 w-16 rounded-lg object-contain"
          />
          <div>
            <div className="text-[16px] font-bold leading-5 text-[#1F3B57]">{profile.name || 'Company Name'}</div>
            <div className="text-[10px] italic text-[#5B6B7C]">{profile.tagline}</div>
          </div>
        </div>
        <div className="text-right text-[10.5px] leading-4 text-[#5B6B7C]">
          {profile.poBox && <div>{profile.poBox}</div>}
          {profile.address && <div>{profile.address}</div>}
          <div>{[profile.city, profile.country].filter(Boolean).join(', ')}</div>
          {profile.phone && <div>Tel: {profile.phone}</div>}
          {profile.email && <div>{profile.email}</div>}
          {profile.website && <div>{profile.website}</div>}
          {profile.kraPin && (
            <div>
              KRA PIN: <span className="font-mono font-medium text-[#1A2B3C]">{profile.kraPin}</span>
            </div>
          )}
        </div>
      </div>

      {profileIncomplete(profile) && (
        <Link
          to="/profile"
          className="no-print mt-2 flex items-center gap-1.5 rounded-lg bg-warning-soft px-3 py-1.5 text-[11px] font-semibold text-warning"
        >
          <AlertTriangle size={13} /> Complete your Company Profile →
        </Link>
      )}

      {/* 2 — Gold rule */}
      <div className="mt-4 h-[3px] w-full rounded bg-[#C9A227]" />

      {/* 3 — Title block */}
      <div className="mt-5 text-center">
        <h2 className="text-[18px] font-bold uppercase tracking-[0.08em] text-[#1F3B57]">{meta.title}</h2>
        <div className="mt-1 font-mono text-[13px] font-medium text-[#5B6B7C]">{doc.docNo}</div>
        <div className="mt-1 flex items-center justify-center gap-5 text-[11px] text-[#5B6B7C]">
          <span>Date: <span className="font-semibold tabular-nums text-[#1A2B3C]">{formatDate(doc.issueDate)}</span></span>
          {doc.dueDate && (
            <span>
              {doc.type === 'quotation' ? 'Valid Until' : doc.type === 'purchase-order' ? 'Delivery By' : 'Due Date'}:{' '}
              <span className="font-semibold tabular-nums text-[#1A2B3C]">{formatDate(doc.dueDate)}</span>
            </span>
          )}
          {doc.tenderRef && (
            <span>Tender Ref: <span className="font-mono font-medium text-[#1A2B3C]">{doc.tenderRef}</span></span>
          )}
        </div>
      </div>

      {/* 4 — Party box */}
      <div className="mt-5">
        <PartyBox label={doc.partyLabel} party={doc.party} />
      </div>

      {/* 5–7 — Body per type */}
      {isContract ? (
        <ContractBody doc={doc} profile={profile} />
      ) : (
        <>
          <LinesTable doc={doc} />
          <TotalsBlock doc={doc} />
          {doc.payment && <ReceiptPaymentBox payment={doc.payment} />}
          {showPaymentBox && <PaymentDetailsBox profile={profile} />}
        </>
      )}

      {/* 8 — Signature row (contracts render their own two-party signatures) */}
      {!isContract && <SignatureRow profile={profile} />}

      {/* 9 — Footer pinned to sheet bottom */}
      <div className="mt-auto pt-8">
        {doc.terms && !isContract && (
          <p className="text-[9px] leading-4 text-[#8494A7]">
            <span className="font-bold uppercase tracking-[0.06em]">Terms:</span> {doc.terms}
          </p>
        )}
        <div className="mt-3 flex items-center justify-between border-t border-[#E4E9F0] pt-2 text-[9px] text-[#8494A7]">
          <span>© {profile.name || 'Future Bright Ventures Ltd'} — generated by FBV System</span>
          <span className="tabular-nums">Page 1 of 1</span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stored-document → LetterDoc converter                               */
/* ------------------------------------------------------------------ */

export function partyLabelFor(type: DocType): string {
  if (type === 'purchase-order') return 'Supplier';
  if (type === 'receipt') return 'Received From';
  if (type === 'contract') return 'Client';
  return 'Bill To';
}

/** Build a printable LetterDoc from a stored FbvDocument (+ extras side-store). */
export function letterFromFbv(s: AppState, d: FbvDocument): LetterDoc {
  const extras = getDocExtras(d.id);
  const discountAmount = extras.discountType === 'percent'
    ? Math.round(d.subtotal * (extras.discountValue / 100) * 100) / 100
    : Math.min(extras.discountValue || 0, d.subtotal);
  const net = d.subtotal - discountAmount;
  const vat = d.type === 'receipt' ? 0 : vatAmount(net, s.settings.vatRate);
  const total = discountAmount > 0 ? net + vat : d.total;

  // Receipts: recover payment mode/reference from the linked payment row.
  let payment: LetterPayment | undefined;
  if (d.type === 'receipt') {
    const refMatch = d.notes?.match(/FBV-PAY-\d{4}-\d+/);
    const pay = refMatch ? s.payments.find((p) => p.refNo === refMatch[0]) : undefined;
    payment = pay
      ? { method: pay.method, reference: pay.reference, date: pay.date }
      : { method: '—', reference: '—', date: d.issueDate };
  }

  return {
    type: d.type,
    docNo: d.docNo,
    issueDate: d.issueDate,
    dueDate: d.dueDate,
    party: resolveParty(s, d.type, d.clientId),
    partyLabel: partyLabelFor(d.type),
    tenderRef: d.tenderId ? s.tenders.find((t) => t.id === d.tenderId)?.refNo : undefined,
    lines: d.lines,
    subtotal: d.subtotal,
    discountAmount,
    vat,
    total,
    terms: extras.terms || d.notes,
    payment,
    contract: d.type === 'contract' ? extras.contract : undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Print portal hook                                                   */
/* ------------------------------------------------------------------ */

/**
 * `const printer = useDocPrinter()` → call `printer.request(letterDoc, profile)`
 * to mount a body-level A4 copy and open the native print dialog; render
 * `{printer.portal}` anywhere in the page.
 */
export function useDocPrinter() {
  const [job, setJob] = useState<{ doc: LetterDoc; profile: CompanyProfile } | null>(null);

  const request = useCallback((doc: LetterDoc, profile: CompanyProfile) => {
    setJob({ doc, profile });
  }, []);

  useEffect(() => {
    if (!job) return;
    // 150ms "settle" before the native dialog, per design.
    const t = window.setTimeout(() => window.print(), 150);
    const done = () => setJob(null);
    window.addEventListener('afterprint', done);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('afterprint', done);
    };
  }, [job]);

  const portal = job
    ? createPortal(
        <div className="fbv-print-portal">
          <LetterheadDoc doc={job.doc} profile={job.profile} />
        </div>,
        document.body,
      )
    : null;

  return { request, portal };
}
