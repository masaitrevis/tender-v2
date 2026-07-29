/** Shared tender context bar for the three engine pages (eligibility / bid-decision / estimation).
 *  Sticky card: tender combobox + selected tender chip (client, closing date, value).
 *  Selection is synced to the `?tender=` query param so deep links work. */
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FolderOpen } from 'lucide-react';
import { useStore, daysUntil } from '@/lib/store';
import { formatKESCompact, formatDate } from '@/lib/format';
import { CountdownChip, Pill, SelectInput } from '@/components/shared';
import { STATUS_HEX } from './ui';

export function useTenderParam(): [string, (id: string) => void] {
  const [params, setParams] = useSearchParams();
  const tenderId = params.get('tender') ?? '';
  const setTenderId = (id: string) => {
    const next = new URLSearchParams(params);
    if (id) next.set('tender', id);
    else next.delete('tender');
    setParams(next, { replace: true });
  };
  return [tenderId, setTenderId];
}

export function TenderContextBar({ tenderId, onChange }: { tenderId: string; onChange: (id: string) => void }) {
  const state = useStore();
  const tender = state.tenders.find((t) => t.id === tenderId);
  const client = tender ? state.clients.find((c) => c.id === tender.clientId) : undefined;

  const options = useMemo(() => {
    const active = state.tenders.filter((t) => t.status === 'Open' || t.status === 'Submitted' || t.status === 'Under Evaluation');
    const rest = state.tenders.filter((t) => !active.includes(t));
    const toOpt = (t: (typeof state.tenders)[number]) => ({ value: t.id, label: `${t.refNo} — ${t.title}` });
    return [
      { value: '', label: 'Select a tender…' },
      ...active.map(toOpt),
      ...rest.map(toOpt),
    ];
  }, [state.tenders]);

  return (
    <div className="sticky top-0 z-20 -mx-7 mb-5 border-b border-app-border bg-app-bg/95 px-7 py-3 backdrop-blur">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-app-slate">
          <FolderOpen size={16} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em]">Tender</span>
        </div>
        <div className="w-[min(460px,100%)]">
          <SelectInput options={options} value={tenderId} onChange={(e) => onChange(e.target.value)} />
        </div>
        {tender ? (
          <motion.div
            key={tender.id}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
            className="flex flex-wrap items-center gap-2 rounded-xl border border-app-border bg-app-card px-3 py-2 shadow-card"
            style={{ borderLeft: `3px solid ${STATUS_HEX[tender.status]}` }}
          >
            <span className="font-mono text-xs font-medium text-navy-800">{tender.refNo}</span>
            <Pill status={tender.status} />
            {client && <span className="text-[13px] text-app-slate">{client.name}</span>}
            <span className="text-xs text-app-muted tnum">closes {formatDate(tender.submissionDeadline)}</span>
            {daysUntil(tender.submissionDeadline) >= 0 && (tender.status === 'Open') && (
              <CountdownChip date={tender.submissionDeadline} />
            )}
            <span className="text-[13px] font-semibold text-app-ink tnum">{formatKESCompact(tender.value)}</span>
          </motion.div>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-app-border bg-app-card px-4 py-2">
            <img src="/empty-box.svg" alt="" className="h-[52px] w-auto opacity-80" />
            <div>
              <div className="text-[13px] font-semibold text-app-ink">Pick a tender to begin</div>
              <div className="text-xs text-app-muted">Results are saved against the selected tender and appear in its workflow.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
