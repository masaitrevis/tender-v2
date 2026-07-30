/**
 * Right rail — "How it works" accordion + tips, and the "Take your data out"
 * export card (per-entity .xlsx exports of the current store, round-trip safe).
 */
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Download, Lightbulb } from 'lucide-react';
import { useStore } from '@/lib/store';
import { downloadEntityData, ENTITIES, ENTITY_ORDER } from './entities';
import { cn } from '@/lib/utils';

const HOW_IT_WORKS = [
  { title: '1. Download the template', body: 'Pick what you want to import above, then download the Excel template. It already has the right column headers and two example rows.' },
  { title: '2. Fill it in Excel — one record per row', body: "Replace the example rows with your own data. Don't rename the column headers — that's how we match everything for you." },
  { title: '3. Upload and check the preview', body: 'Drop the file back here. We check every row, flag problems in plain language, and only then add the good rows to the system.' },
];

const TIPS = [
  "Don't rename column headers",
  'Dates like 27 Jul 2026 or 2026-07-27 both work',
  'KRA PINs look like P000111222A',
];

export function HowItWorks() {
  const [open, setOpen] = useState(0);
  return (
    <div className="rounded-xl border border-app-border bg-app-card p-5 shadow-card">
      <div className="mb-3 flex items-center gap-3">
        <img src="/upload-illustration.svg" alt="" className="h-10 w-auto" />
        <h3 className="text-[15px] font-semibold text-app-ink">How it works</h3>
      </div>
      <div className="divide-y divide-app-border">
        {HOW_IT_WORKS.map((item, i) => (
          <div key={item.title}>
            <button
              onClick={() => setOpen(open === i ? -1 : i)}
              className="flex w-full items-center justify-between py-3 text-left text-[13px] font-semibold text-app-ink"
            >
              {item.title}
              <motion.span animate={{ rotate: open === i ? 180 : 0 }} transition={{ duration: 0.2 }}>
                <ChevronDown size={15} className="text-app-muted" />
              </motion.span>
            </button>
            <AnimatePresence initial={false}>
              {open === i && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <p className="pb-3 text-sm leading-6 text-app-slate">{item.body}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-lg bg-gold-soft px-3 py-2.5">
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gold">
          <Lightbulb size={12} /> Tips
        </div>
        <ul className="space-y-1 text-xs leading-5 text-app-slate">
          {TIPS.map((t) => <li key={t}>· {t}</li>)}
        </ul>
      </div>
    </div>
  );
}

export function ExportCard() {
  const state = useStore();
  const [busy, setBusy] = useState<string | null>(null);

  const run = (key: string, fn: () => void) => {
    setBusy(key);
    window.setTimeout(() => {
      fn();
      setBusy(null);
    }, 600);
  };

  return (
    <div className="rounded-xl border border-app-border bg-app-card p-5 shadow-card">
      <h3 className="text-[15px] font-semibold text-app-ink">Take your data out</h3>
      <p className="mt-1 text-xs text-app-muted">Exports use the same headers as the templates, so you can edit and re-upload.</p>
      <div className="mt-4 space-y-2">
        {ENTITY_ORDER.map((k) => {
          const def = ENTITIES[k];
          const loading = busy === k;
          return (
            <button
              key={k}
              onClick={() => run(k, () => downloadEntityData(def, state))}
              disabled={busy != null}
              className={cn(
                'relative flex w-full items-center gap-2.5 overflow-hidden rounded-lg border border-app-border bg-white px-3 py-2.5 text-left text-[13px] font-semibold text-app-ink transition hover:brightness-105 disabled:opacity-60',
              )}
            >
              {loading && (
                <motion.span
                  initial={{ width: '0%' }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 0.6, ease: 'linear' }}
                  className="absolute inset-y-0 left-0 bg-info-soft"
                />
              )}
              <def.icon size={15} className="relative z-10 text-app-slate" />
              <span className="relative z-10 flex-1">{def.label}</span>
              <Download size={14} className="relative z-10 text-app-muted" />
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-app-muted">Exports respect current filters on list pages.</p>
    </div>
  );
}
