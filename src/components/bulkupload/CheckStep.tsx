/**
 * Step 3 — Check data: live summary chips, filter tabs, options row
 * (skip-problems toggle + duplicate strategy radio cards) and the validation
 * preview table with per-cell problem highlighting.
 */
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, CircleCheck, CircleX, Copy, Rows3 } from 'lucide-react';
import type { ColumnMap, EntityDef, ValidatedRow } from './entities';
import { rowStatus } from './entities';
import { Pill, StatChip, Toggle } from '@/components/shared';
import { CountUp, TabStrip } from '@/components/masterdata/shared';
import { cn } from '@/lib/utils';

export type DupStrategy = 'skip' | 'update';

const PREVIEW_CAP = 300;

function cellText(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

export function CheckStep({
  def,
  rows,
  mapping,
  skipProblems,
  onSkipProblems,
  dupStrategy,
  onDupStrategy,
  updateFilledOnly,
  onUpdateFilledOnly,
}: {
  def: EntityDef;
  rows: ValidatedRow[];
  mapping: ColumnMap[];
  skipProblems: boolean;
  onSkipProblems: (v: boolean) => void;
  dupStrategy: DupStrategy;
  onDupStrategy: (v: DupStrategy) => void;
  updateFilledOnly: boolean;
  onUpdateFilledOnly: (v: boolean) => void;
}) {
  const [tab, setTab] = useState('all');
  const [checksOpen, setChecksOpen] = useState(false);

  const counts = useMemo(() => ({
    total: rows.length,
    ready: rows.filter((r) => rowStatus(r) === 'ready').length,
    problems: rows.filter((r) => rowStatus(r) === 'problem').length,
    dups: rows.filter((r) => rowStatus(r) === 'duplicate').length,
  }), [rows]);

  const filtered = useMemo(() => {
    const list = rows.filter((r) => {
      const s = rowStatus(r);
      if (tab === 'ready') return s === 'ready';
      if (tab === 'problems') return s === 'problem';
      if (tab === 'duplicates') return s === 'duplicate';
      return true;
    });
    return list.slice(0, PREVIEW_CAP);
  }, [rows, tab]);

  const mapped = mapping.filter((m) => m.fieldKey);
  const issueFields = (r: ValidatedRow) => new Set(r.issues.map((i) => i.field));
  const issueText = (r: ValidatedRow, field: string) => r.issues.find((i) => i.field === field)?.message;

  const statusChip = (r: ValidatedRow) => {
    const s = rowStatus(r);
    if (s === 'ready') return <Pill tone="green">Ready</Pill>;
    if (s === 'problem') return <Pill tone="red">Problem</Pill>;
    return <Pill tone="amber">Duplicate</Pill>;
  };

  return (
    <div>
      {/* summary strip */}
      <div className="mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatChip icon={<Rows3 size={18} />} label="Total rows" variant="blue" value={<CountUp value={counts.total} />} />
        <StatChip icon={<CircleCheck size={18} />} label="Ready to import" variant="green" value={<CountUp value={counts.ready} />} />
        <StatChip icon={<CircleX size={18} />} label="Rows with problems" variant="red" value={<CountUp value={counts.problems} />} />
        <StatChip icon={<Copy size={18} />} label="Duplicates found" variant="amber" value={<CountUp value={counts.dups} />} />
      </div>

      {/* options row */}
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-app-border bg-white px-4 py-3 shadow-card">
        <Toggle checked={skipProblems} onChange={onSkipProblems} label="Skip rows with problems" />
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-medium text-app-ink">Duplicates:</span>
          <div className="flex gap-2">
            {([
              { id: 'skip' as DupStrategy, title: 'Skip duplicates', desc: 'keep existing records' },
              { id: 'update' as DupStrategy, title: 'Update existing', desc: 'overwrite with the Excel data' },
            ]).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => onDupStrategy(opt.id)}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-left transition',
                  dupStrategy === opt.id
                    ? 'border-action bg-info-soft ring-1 ring-action'
                    : 'border-app-border bg-white hover:border-app-slate',
                )}
              >
                <span className="block text-xs font-semibold text-app-ink">{opt.title}</span>
                <span className="block text-[11px] text-app-muted">{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>
        {dupStrategy === 'update' && (
          <Toggle checked={updateFilledOnly} onChange={onUpdateFilledOnly} label="Update only filled cells" />
        )}
      </div>

      {/* filter tabs */}
      <div className="mb-3">
        <TabStrip
          id="check-filter-tabs"
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'all', label: <>All <Pill tone="grey" className="ml-1">{counts.total}</Pill></> },
            { id: 'ready', label: <>Ready <Pill tone="green" className="ml-1">{counts.ready}</Pill></> },
            { id: 'problems', label: <>Problems <Pill tone="red" className="ml-1">{counts.problems}</Pill></> },
            { id: 'duplicates', label: <>Duplicates <Pill tone="amber" className="ml-1">{counts.dups}</Pill></> },
          ]}
        />
      </div>

      {/* preview table */}
      <div className="max-h-[480px] overflow-auto rounded-xl border border-app-border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#F8FAFC] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-app-muted shadow-[0_1px_0_#E4E9F0]">
              <th className="w-14 px-3 py-3">Row</th>
              <th className="w-28 px-3 py-3">Status</th>
              {mapped.map((m) => {
                const f = def.fields.find((x) => x.key === m.fieldKey);
                return (
                  <th key={m.fileColumn} className="whitespace-nowrap px-3 py-3">
                    {f?.header ?? m.header}{f?.required ? ' *' : ''}
                  </th>
                );
              })}
              <th className="min-w-[220px] px-3 py-3">Issues</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => {
              const s = rowStatus(r);
              const bad = issueFields(r);
              return (
                <motion.tr
                  key={r.index}
                  layout="position"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.18, delay: i < 40 ? i * 0.015 : 0 }}
                  className={cn(
                    'border-t border-[#EEF1F5]',
                    s === 'duplicate' && 'bg-warning-soft/50',
                  )}
                >
                  <td className="px-3 py-2 text-xs text-app-muted tnum">{r.index}</td>
                  <td className="px-3 py-2">
                    <motion.span initial={{ scale: 0.8 }} animate={{ scale: 1 }} transition={{ duration: 0.2 }}>
                      {statusChip(r)}
                    </motion.span>
                  </td>
                  {mapped.map((m) => {
                    const msg = issueText(r, m.fieldKey);
                    const isBad = bad.has(m.fieldKey);
                    return (
                      <td
                        key={m.fileColumn}
                        title={msg ?? undefined}
                        className={cn(
                          'whitespace-nowrap px-3 py-2 text-[13px]',
                          isBad
                            ? 'border border-danger/60 bg-danger-soft text-danger'
                            : 'text-app-ink',
                        )}
                      >
                        {cellText(r.raw[m.fieldKey]) || <span className="text-app-muted">—</span>}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2">
                    {r.issues.length > 0 && (
                      <ul className="space-y-0.5 text-xs text-danger">
                        {r.issues.map((is, j) => <li key={j}>{is.message}</li>)}
                      </ul>
                    )}
                    {r.issues.length === 0 && r.dup && (
                      <span className="text-xs text-warning">
                        Matches existing <span className="font-mono">{r.dup.code}</span> ({r.dup.name})
                      </span>
                    )}
                    {r.issues.length === 0 && !r.dup && <span className="text-xs text-success">Looks good</span>}
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
        {rows.length > PREVIEW_CAP && (
          <div className="border-t border-app-border bg-app-bg px-4 py-2.5 text-center text-xs text-app-muted">
            Showing the first {PREVIEW_CAP} rows — the rest import with the same rules.
          </div>
        )}
      </div>

      {/* what we check */}
      <div className="mt-4 rounded-xl border border-app-border bg-white shadow-card">
        <button
          onClick={() => setChecksOpen((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-[13px] font-semibold text-app-ink"
        >
          What we check
          <motion.span animate={{ rotate: checksOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown size={15} className="text-app-muted" />
          </motion.span>
        </button>
        <motion.div
          initial={false}
          animate={{ height: checksOpen ? 'auto' : 0, opacity: checksOpen ? 1 : 0 }}
          transition={{ duration: 0.25 }}
          className="overflow-hidden"
        >
          <ul className="space-y-1.5 px-4 pb-4 text-sm text-app-slate">
            {def.checks.map((c) => (
              <li key={c} className="flex items-start gap-2">
                <CircleCheck size={14} className="mt-1 shrink-0 text-success" /> {c}
              </li>
            ))}
          </ul>
        </motion.div>
      </div>
    </div>
  );
}
