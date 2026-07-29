/**
 * Live A4 letterhead preview — re-renders on every profile change.
 * Rendered at a fixed 794×1123px canvas (A4 @96dpi) and scaled down with a
 * CSS transform so the same markup serves the 300px rail and the full modal.
 */
import { motion } from 'framer-motion';
import type { FullProfile } from './profileExtras';

const A4_W = 794;
const A4_H = 1123;

function imgSrc(data?: string): string | undefined {
  return data ? `data:image/png;base64,${data}` : undefined;
}

export default function LetterheadPreview({
  profile,
  width,
  className,
}: {
  profile: FullProfile;
  /** Rendered (scaled) width in px. */
  width: number;
  className?: string;
}) {
  const scale = width / A4_W;
  const p = profile;
  const primaryBank = p.bankAccounts.find((b) => b.primary) ?? p.bankAccounts[0];
  const signatory = p.directors.find((d) => d.canSign && d.signatureData);

  return (
    <div
      className={className}
      style={{ width, height: A4_H * scale }}
      aria-label="Letterhead preview"
    >
      <motion.div
        layout
        className="origin-top-left overflow-hidden rounded-md bg-white shadow-card ring-1 ring-app-border"
        style={{ width: A4_W, height: A4_H, transform: `scale(${scale})` }}
      >
        {/* Accent header band */}
        <motion.div
          animate={{ backgroundColor: p.accentColor }}
          transition={{ duration: 0.3 }}
          className="flex items-start justify-between px-12 pb-6 pt-10 text-white"
        >
          <div className="flex items-center gap-5">
            <motion.img
              key={p.logoData ? 'custom-logo' : 'fallback-logo'}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              src={imgSrc(p.logoData) ?? '/logo.svg'}
              alt="Company logo"
              className="h-20 w-20 rounded-xl bg-white object-contain p-1"
            />
            <div>
              <div className="text-[30px] font-bold leading-tight">{p.name || 'Your Company Name'}</div>
              <div className="mt-1 text-[15px] italic text-white/80">{p.tagline}</div>
              {p.tradingName && <div className="mt-0.5 text-[12px] text-white/70">t/a {p.tradingName}</div>}
            </div>
          </div>
          <div className="pt-1 text-right text-[12.5px] leading-5 text-white/85">
            <div>{p.address}</div>
            <div>
              {p.city}
              {p.county && p.county !== p.city ? `, ${p.county}` : ''}, {p.country}
            </div>
            <div>{p.poBox}</div>
            <div className="mt-1">
              {p.phone}
              {p.altPhone ? ` / ${p.altPhone}` : ''}
            </div>
            <div>{p.email}</div>
            <div>{p.website}</div>
          </div>
        </motion.div>

        {/* Gold rule */}
        {p.goldRule && <div className="h-[5px] bg-gold" />}

        {/* Reference row */}
        <div className="flex items-center justify-between px-12 pt-8 text-[13px] text-app-slate">
          <span>
            KRA PIN: <span className="font-mono font-medium text-app-ink">{p.kraPin || '—'}</span>
          </span>
          <span>
            Reg No: <span className="font-mono font-medium text-app-ink">{p.regNo || '—'}</span>
          </span>
          <span>
            VAT: <span className="font-mono font-medium text-app-ink">{p.vatNo || '—'}</span>
          </span>
        </div>

        {/* Body placeholder — where the generated document content goes */}
        <div className="px-12 pt-8">
          <div className="rounded-lg border border-dashed border-app-border bg-app-bg/60 px-6 py-10 text-center text-[13px] text-app-muted">
            Your quotation, invoice or contract content appears here
          </div>

          {/* Payment box */}
          <div className="mt-8 rounded-lg border border-app-border">
            <div className="border-b border-app-border bg-[#F8FAFC] px-5 py-2.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-app-slate">
              Payment Details
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 px-5 py-4 text-[13px] text-app-ink">
              <div>
                <span className="text-app-muted">Bank: </span>
                {primaryBank?.bankName || p.bankName || '—'}
              </div>
              <div>
                <span className="text-app-muted">Branch: </span>
                {primaryBank?.branch || p.bankBranch || '—'}
              </div>
              <div>
                <span className="text-app-muted">Account Name: </span>
                {primaryBank?.accountName || p.name}
              </div>
              <div>
                <span className="text-app-muted">Account No: </span>
                <span className="font-mono">{primaryBank?.accountNumber || p.bankAccount || '—'}</span>
              </div>
              {(primaryBank?.swift || p.bankSwift) && (
                <div>
                  <span className="text-app-muted">SWIFT: </span>
                  <span className="font-mono">{primaryBank?.swift || p.bankSwift}</span>
                </div>
              )}
              {p.mpesa.number && (
                <div>
                  <span className="text-app-muted">
                    M-Pesa {p.mpesa.type === 'paybill' ? 'Paybill' : p.mpesa.type === 'till' ? 'Till' : 'Send Money'}:{' '}
                  </span>
                  <span className="font-mono">{p.mpesa.number}</span>
                </div>
              )}
            </div>
          </div>

          {/* Signature / stamp */}
          <div className="mt-10 flex items-end justify-between">
            <div>
              {(signatory?.signatureData || p.signatureData) && (
                <motion.img
                  key={signatory?.signatureData ?? p.signatureData}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  src={imgSrc(signatory?.signatureData ?? p.signatureData)}
                  alt="Signature"
                  className="h-16 object-contain"
                />
              )}
              <div className="mt-1 w-56 border-t border-app-ink/40 pt-1.5 text-[12px] text-app-slate">
                {signatory ? `${signatory.name} — ${signatory.role}` : 'Authorised Signatory'}
              </div>
            </div>
            {p.stampData && (
              <motion.img
                key={p.stampData}
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 0.9, scale: 1 }}
                transition={{ duration: 0.3 }}
                src={imgSrc(p.stampData)}
                alt="Company stamp"
                className="h-28 w-28 object-contain"
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="absolute inset-x-0 bottom-0">
          <motion.div animate={{ backgroundColor: p.accentColor }} transition={{ duration: 0.3 }} className="h-[3px] opacity-70" />
          <div className="px-12 py-4 text-center text-[12px] italic text-app-muted">{p.footerText}</div>
        </div>
      </motion.div>
    </div>
  );
}
