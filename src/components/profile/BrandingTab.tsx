/** Tab 5 — Branding & Logo: logo, signature, stamp, accent color, footer text. */
import { motion } from 'framer-motion';
import { ImagePlus, PenLine, Stamp } from 'lucide-react';
import { SectionCard, PF, BIG_INPUT } from './tabShared';
import type { ScalarTabProps } from './CompanyTab';
import { ACCENT_PRESETS } from './profileExtras';
import { Toggle } from '@/components/shared';
import ImageUpload from './ImageUpload';
import { cn } from '@/lib/utils';

export default function BrandingTab({ profile: p, dirty, onScalar }: ScalarTabProps) {
  const customHex = /^#[0-9A-Fa-f]{6}$/.test(p.accentColor) && !ACCENT_PRESETS.some((s) => s.hex.toLowerCase() === p.accentColor.toLowerCase());

  return (
    <div className="space-y-4">
      <SectionCard title="Company logo" intro="Shows on the sidebar, login screen and every document header. PNG, JPG or SVG, max 2 MB.">
        <ImageUpload
          label="Logo"
          hint={p.logoData ? 'Looking good — documents update instantly' : 'No logo yet — the gold FB monogram is used as a fallback'}
          icon={<ImagePlus size={26} />}
          previewClass="h-[88px]"
          value={p.logoData}
          onChange={(data) => onScalar('logoData', data)}
        />
      </SectionCard>

      <SectionCard title="Signature & company stamp" intro="Placed at the bottom of contracts and official letters. Transparent PNG recommended.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ImageUpload
            label="Digital signature"
            hint="The default signatory signature"
            icon={<PenLine size={22} />}
            previewClass="h-16"
            value={p.signatureData}
            onChange={(data) => onScalar('signatureData', data)}
          />
          <ImageUpload
            label="Company stamp / round seal"
            hint="Stamped beside the signature block"
            icon={<Stamp size={22} />}
            previewClass="h-16"
            value={p.stampData}
            onChange={(data) => onScalar('stampData', data)}
          />
        </div>
      </SectionCard>

      <SectionCard title="Document accent color" intro="The header band and footer rule on your letterhead — previewed live on the right.">
        <div className="flex flex-wrap items-center gap-2.5">
          {ACCENT_PRESETS.map((s, i) => {
            const selected = p.accentColor.toLowerCase() === s.hex.toLowerCase();
            return (
              <motion.button
                key={s.hex}
                type="button"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.03, duration: 0.2 }}
                onClick={() => onScalar('accentColor', s.hex)}
                title={s.name}
                className={cn(
                  'relative h-10 w-10 rounded-full transition hover:-translate-y-0.5',
                  selected && 'ring-2 ring-offset-2 ring-action',
                )}
                style={{ backgroundColor: s.hex }}
              >
                {selected && (
                  <motion.svg viewBox="0 0 24 24" className="absolute inset-0 m-auto h-5 w-5 text-white">
                    <motion.path
                      d="M5 12.5 L10 17.5 L19 7"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.4 }}
                    />
                  </motion.svg>
                )}
              </motion.button>
            );
          })}
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={/^#[0-9A-Fa-f]{6}$/.test(p.accentColor) ? p.accentColor : '#1F3B57'}
              onChange={(e) => onScalar('accentColor', e.target.value)}
              className="h-10 w-10 cursor-pointer rounded-full border border-app-border bg-white p-1"
              title="Custom color"
            />
            <input
              className={cn(BIG_INPUT, 'h-10 w-28 font-mono text-[13px] uppercase', customHex && 'border-action')}
              value={p.accentColor}
              onChange={(e) => onScalar('accentColor', e.target.value)}
              placeholder="#1F3B57"
              maxLength={7}
            />
          </div>
        </div>
        <div className="mt-4">
          <Toggle
            checked={p.goldRule}
            onChange={(v) => onScalar('goldRule', v)}
            label="Use gold rule on letterhead"
          />
        </div>
      </SectionCard>

      <SectionCard title="Letterhead footer text" intro="Printed at the bottom of every page.">
        <PF label="Footer text" dirty={dirty.has('footerText')}>
          <textarea
            rows={2}
            className="w-full rounded-lg border border-app-border bg-white px-3.5 py-2.5 text-[15px] text-app-ink outline-none transition placeholder:text-app-muted focus:border-action focus:ring-2 focus:ring-[rgba(37,99,235,.25)]"
            value={p.footerText}
            onChange={(e) => onScalar('footerText', e.target.value)}
            placeholder="Thank you for doing business with us."
          />
        </PF>
      </SectionCard>
    </div>
  );
}
