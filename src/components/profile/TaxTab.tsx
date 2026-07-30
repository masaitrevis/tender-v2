/** Tab 2 — Tax & Registration: KRA PIN, certificates with expiry tracking. */
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlarmClock, Paperclip } from 'lucide-react';
import { SectionCard, PF, BIG_INPUT, ValidCheck } from './tabShared';
import type { ScalarTabProps } from './CompanyTab';
import { AGPO_CATEGORIES, NCA_CLASSES, isValidKraPin } from './profileExtras';
import { daysUntil } from '@/lib/store';
import { formatDate } from '@/lib/format';

/** Amber hint chip shown when an expiry date is picked — Deadline Tracker wiring. */
function TrackedChip({ date }: { date: string }) {
  if (!date) return null;
  const days = daysUntil(date);
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="mt-2 flex flex-wrap items-center gap-2"
    >
      <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 text-[11px] font-semibold text-warning">
        <AlarmClock size={12} />
        Tracked in Deadline Tracker ✓ — we'll alert you 30 days before expiry
      </span>
      <span className="text-xs text-app-muted tnum">
        {days >= 0 ? `Expires in ${days} days (${formatDate(date)})` : `Expired ${Math.abs(days)} days ago`}
      </span>
    </motion.div>
  );
}

export default function TaxTab({ profile: p, dirty, onScalar }: ScalarTabProps) {
  const pinOk = isValidKraPin(p.kraPin);
  return (
    <div className="space-y-4">
      <SectionCard title="KRA & VAT" intro="Your tax identifiers — the KRA PIN prints on every invoice.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <PF
            label="KRA PIN"
            hint={pinOk ? 'Format looks good' : 'Format: letter + 9 digits + letter, e.g. P051234567X'}
            dirty={dirty.has('kraPin')}
          >
            <input
              className={`${BIG_INPUT} font-mono uppercase ${p.kraPin ? 'pr-10' : ''}`}
              value={p.kraPin}
              onChange={(e) => onScalar('kraPin', e.target.value.toUpperCase())}
              placeholder="P051234567X"
              maxLength={11}
            />
            <ValidCheck show={pinOk} />
          </PF>
          <PF label="VAT Registration No" dirty={dirty.has('vatNo')}>
            <input className={`${BIG_INPUT} font-mono`} value={p.vatNo ?? ''} onChange={(e) => onScalar('vatNo', e.target.value)} placeholder="VAT-04711230" />
          </PF>
        </div>
      </SectionCard>

      <SectionCard title="Incorporation & CR12" intro="From the Business Registration Service (eCitizen).">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <PF label="Certificate of Incorporation No" dirty={dirty.has('regNo')}>
            <input className={`${BIG_INPUT} font-mono`} value={p.regNo} onChange={(e) => onScalar('regNo', e.target.value)} placeholder="C.167890" />
          </PF>
          <PF label="CR12 Reference" hint="The CR12 lists your current directors — keep it recent" dirty={dirty.has('cr12Ref')}>
            <input className={`${BIG_INPUT} font-mono`} value={p.cr12Ref} onChange={(e) => onScalar('cr12Ref', e.target.value)} placeholder="CR12-2026-04882" />
          </PF>
        </div>
      </SectionCard>

      <SectionCard title="Licences & certificates with expiry" intro="Enter the expiry date and we'll track it — you'll get an alert 30 days before it lapses.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <PF label="Business Permit No" dirty={dirty.has('businessPermitNo')}>
            <input className={`${BIG_INPUT} font-mono`} value={p.businessPermitNo} onChange={(e) => onScalar('businessPermitNo', e.target.value)} placeholder="NCC-SBP-2026-33192" />
          </PF>
          <PF label="Business Permit Expiry" dirty={dirty.has('businessPermitExpiry')}>
            <input type="date" className={`${BIG_INPUT} tnum`} value={p.businessPermitExpiry} onChange={(e) => onScalar('businessPermitExpiry', e.target.value)} />
          </PF>
          <AnimatePresence>
            <div className="sm:col-span-2">
              <TrackedChip date={p.businessPermitExpiry} />
            </div>
          </AnimatePresence>

          <PF label="Tax Compliance Cert No" dirty={dirty.has('taxComplianceNo')}>
            <input className={`${BIG_INPUT} font-mono`} value={p.taxComplianceNo} onChange={(e) => onScalar('taxComplianceNo', e.target.value)} placeholder="KRA-TCC-2026-88214" />
          </PF>
          <PF label="Tax Compliance Expiry" dirty={dirty.has('taxComplianceExpiry')}>
            <input type="date" className={`${BIG_INPUT} tnum`} value={p.taxComplianceExpiry} onChange={(e) => onScalar('taxComplianceExpiry', e.target.value)} />
          </PF>
          <div className="sm:col-span-2">
            <TrackedChip date={p.taxComplianceExpiry} />
          </div>
        </div>
        <div className="mt-3 rounded-lg bg-gold-soft/60 px-3 py-2 text-[13px] text-app-ink">
          Keep the actual certificates in the vault so tenders can find them fast:{' '}
          <Link to="/dms?type=tax-compliance" className="inline-flex items-center gap-1 font-semibold text-navy-800 underline decoration-gold decoration-2 underline-offset-2 hover:text-action">
            Attach the certificate <Paperclip size={13} /> →
          </Link>
        </div>
      </SectionCard>

      <SectionCard title="AGPO & NCA" intro="Preferential procurement (AGPO) and construction works registration (NCA).">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <PF label="AGPO Category" dirty={dirty.has('agpoCategory')}>
            <select className={BIG_INPUT} value={p.agpoCategory} onChange={(e) => onScalar('agpoCategory', e.target.value)}>
              {AGPO_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </PF>
          <PF label="AGPO Certificate No" dirty={dirty.has('agpoCertNo')}>
            <input className={`${BIG_INPUT} font-mono`} value={p.agpoCertNo} onChange={(e) => onScalar('agpoCertNo', e.target.value)} placeholder="AGPO-2023-44710" disabled={p.agpoCategory === 'None'} />
          </PF>
          {p.agpoCategory !== 'None' && (
            <PF label="AGPO Expiry" dirty={dirty.has('agpoExpiry')}>
              <input type="date" className={`${BIG_INPUT} tnum`} value={p.agpoExpiry} onChange={(e) => onScalar('agpoExpiry', e.target.value)} />
            </PF>
          )}
          <PF label="NCA Registration Class" dirty={dirty.has('ncaClass')}>
            <select className={BIG_INPUT} value={p.ncaClass} onChange={(e) => onScalar('ncaClass', e.target.value)}>
              <option value="">Not registered</option>
              {NCA_CLASSES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </PF>
          {p.ncaClass && (
            <PF label="NCA Expiry" dirty={dirty.has('ncaExpiry')}>
              <input type="date" className={`${BIG_INPUT} tnum`} value={p.ncaExpiry} onChange={(e) => onScalar('ncaExpiry', e.target.value)} />
            </PF>
          )}
          <div className="sm:col-span-2 space-y-1">
            <TrackedChip date={p.agpoCategory !== 'None' ? p.agpoExpiry : ''} />
            <TrackedChip date={p.ncaClass ? p.ncaExpiry : ''} />
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
