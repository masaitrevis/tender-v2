/**
 * Step 2 — Match columns: automatic header matching with manual fallback.
 * "Your column" (mono + samples) → arrow → system field dropdown, with
 * Matched / Check / Not matched confidence chips and required-chips on top.
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, CircleCheck, CircleAlert, CircleX } from 'lucide-react';
import type { ColumnMap, EntityDef } from './entities';
import { unmappedRequired } from './entities';
import { Pill } from '@/components/shared';
import { cn } from '@/lib/utils';

const CONF = {
  matched: { chip: <Pill tone="green">Matched</Pill>, icon: <CircleCheck size={14} className="text-success" /> },
  check: { chip: <Pill tone="amber">Check</Pill>, icon: <CircleAlert size={14} className="text-warning" /> },
  none: { chip: <Pill tone="red">Not matched</Pill>, icon: <CircleX size={14} className="text-danger" /> },
} as const;

export function MapStep({
  def,
  mapping,
  onChange,
  sheetNames,
  sheet,
  onSheetChange,
  firstRowHeaders,
  onToggleHeaders,
}: {
  def: EntityDef;
  mapping: ColumnMap[];
  onChange: (m: ColumnMap[]) => void;
  sheetNames: string[];
  sheet: string;
  onSheetChange: (s: string) => void;
  firstRowHeaders: boolean;
  onToggleHeaders: (v: boolean) => void;
}) {
  const [flash, setFlash] = useState<number | null>(null);
  const matchedCount = mapping.filter((m) => m.fieldKey).length;
  const allMatched = matchedCount === mapping.length;
  const missing = unmappedRequired(mapping, def);

  const setField = (fileColumn: number, fieldKey: string) => {
    onChange(mapping.map((m) => (m.fileColumn === fileColumn ? { ...m, fieldKey, confidence: 'matched' as const } : m)));
    setFlash(fileColumn);
    window.setTimeout(() => setFlash(null), 400);
  };

  return (
    <div>
      {/* banner */}
      <div className={cn(
        'mb-4 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium',
        allMatched ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning',
      )}>
        {allMatched ? <CircleCheck size={16} /> : <CircleAlert size={16} />}
        <span>
          We matched <b>{matchedCount} of {mapping.length}</b> columns automatically.
          {!allMatched && ' Check the rest below.'}
        </span>
      </div>

      {/* still-needed required chips */}
      {missing.length > 0 && (
        <motion.div
          key={missing.map((m) => m.key).join(',')}
          initial={{ x: 0 }}
          animate={{ x: [0, -4, 4, -3, 3, 0] }}
          transition={{ duration: 0.4 }}
          className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3"
        >
          <span className="text-sm font-semibold text-danger">Still needed:</span>
          {missing.map((f) => <Pill key={f.key} tone="red">{f.header}</Pill>)}
        </motion.div>
      )}

      {/* toggles */}
      <div className="mb-4 flex flex-wrap items-center gap-5">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-app-ink">
          <button
            type="button"
            role="switch"
            aria-checked={firstRowHeaders}
            onClick={() => onToggleHeaders(!firstRowHeaders)}
            className={cn('relative h-5 w-9 rounded-full transition-colors', firstRowHeaders ? 'bg-action' : 'bg-grey-soft')}
          >
            <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', firstRowHeaders ? 'left-[18px]' : 'left-0.5')} />
          </button>
          Use first row as headers
        </label>
        {sheetNames.length > 1 && (
          <label className="flex items-center gap-2 text-sm text-app-ink">
            Sheet:
            <select
              value={sheet}
              onChange={(e) => onSheetChange(e.target.value)}
              className="h-8 rounded-lg border border-app-border bg-white px-2 text-sm outline-none focus:border-action"
            >
              {sheetNames.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}
      </div>

      {/* mapping table */}
      <div className="overflow-hidden rounded-xl border border-app-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#F8FAFC] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-app-muted">
              <th className="px-4 py-3">Your column</th>
              <th className="w-10 px-2" />
              <th className="px-4 py-3">System field</th>
              <th className="w-32 px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {mapping.map((m, i) => {
              const conf = m.fieldKey ? (m.confidence === 'none' ? 'matched' : m.confidence) : 'none';
              return (
                <motion.tr
                  key={m.fileColumn}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(i * 0.02, 0.4) }}
                  className={cn(
                    'border-t border-[#EEF1F5] transition-colors',
                    flash === m.fileColumn && 'bg-info-soft',
                  )}
                >
                  <td className="px-4 py-2.5">
                    <div className="font-mono text-[13px] font-medium text-navy-800">{m.header}</div>
                    {m.samples.length > 0 && (
                      <div className="mt-0.5 text-xs text-app-muted">
                        e.g. {m.samples.map((s) => `"${s}"`).join(', ')}
                      </div>
                    )}
                  </td>
                  <td className="px-2 text-app-muted"><ArrowRight size={15} /></td>
                  <td className="px-4 py-2.5">
                    <select
                      value={m.fieldKey}
                      onChange={(e) => setField(m.fileColumn, e.target.value)}
                      className="h-9 w-full max-w-[260px] rounded-lg border border-app-border bg-white px-2.5 text-sm text-app-ink outline-none transition focus:border-action focus:ring-2 focus:ring-[rgba(37,99,235,.25)]"
                    >
                      <option value="">— Skip this column —</option>
                      {def.fields.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.header}{f.required ? ' *' : ''}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2.5">{CONF[conf].chip}</td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
