/**
 * Section D — Import history: file name (mono + entity icon), entity, rows,
 * added/updated/skipped/failed chips, by, date, status pill, row menu.
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Download, History, MoreHorizontal, RotateCcw } from 'lucide-react';
import { formatDateTime } from '@/lib/format';
import { Pill } from '@/components/shared';
import { ENTITIES } from './entities';
import type { ImportRecord } from './history';
import { cn } from '@/lib/utils';

function statusOf(r: ImportRecord): { tone: 'green' | 'amber' | 'red'; label: string } {
  if (r.failed > 0 && r.added + r.updated === 0) return { tone: 'red', label: 'Failed' };
  if (r.skipped > 0 || r.failed > 0) return { tone: 'amber', label: 'Completed with skips' };
  return { tone: 'green', label: 'Completed' };
}

export function HistoryTable({
  records,
  flashId,
  onDownloadReport,
  onRerun,
}: {
  records: ImportRecord[];
  flashId?: string | null;
  onDownloadReport: (r: ImportRecord) => void;
  onRerun: (r: ImportRecord) => void;
}) {
  const [menuFor, setMenuFor] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-app-border bg-app-card shadow-card">
      <div className="flex items-center gap-2 border-b border-app-border px-5 py-4">
        <History size={16} className="text-app-slate" />
        <h3 className="text-[15px] font-semibold text-app-ink">Import history</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#F8FAFC] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-app-muted">
              <th className="px-4 py-3">File name</th>
              <th className="px-4 py-3">Entity</th>
              <th className="px-4 py-3 text-right">Rows</th>
              <th className="px-4 py-3">Outcome</th>
              <th className="px-4 py-3">By</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Status</th>
              <th className="w-12 px-2" />
            </tr>
          </thead>
          <tbody>
            {records.map((r, i) => {
              const def = ENTITIES[r.entity];
              const st = statusOf(r);
              const flash = flashId === r.id;
              return (
                <motion.tr
                  key={r.id}
                  initial={{ opacity: 0, backgroundColor: flash ? '#F7F0DA' : 'rgba(247,240,218,0)' }}
                  animate={{ opacity: 1, backgroundColor: 'rgba(247,240,218,0)' }}
                  transition={{ duration: 0.25, delay: flash ? 0 : Math.min(i * 0.03, 0.5), backgroundColor: { duration: 1.2 } }}
                  className="border-t border-[#EEF1F5] hover:bg-[#F8FAFC]"
                >
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-grey-soft text-grey">
                        <def.icon size={15} />
                      </span>
                      <span className="max-w-[220px] truncate font-mono text-[13px] font-medium text-navy-800">{r.fileName}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-app-slate">{def.label}</td>
                  <td className="px-4 py-3 text-right tnum">{r.rows}</td>
                  <td className="px-4 py-3">
                    <span className="flex flex-wrap gap-1">
                      {r.added > 0 && <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success tnum">+{r.added}</span>}
                      {r.updated > 0 && <span className="rounded-full bg-info-soft px-2 py-0.5 text-[11px] font-semibold text-info tnum">↻{r.updated}</span>}
                      {r.skipped > 0 && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning tnum">»{r.skipped}</span>}
                      {r.failed > 0 && <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-semibold text-danger tnum">×{r.failed}</span>}
                      {r.added + r.updated + r.skipped + r.failed === 0 && <span className="text-app-muted">—</span>}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-navy-800 text-[9px] font-bold text-white">
                        {r.by.split(' ').map((w) => w[0]).slice(0, 2).join('')}
                      </span>
                      <span className="text-app-ink">{r.by}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-app-slate tnum">{formatDateTime(r.date)}</td>
                  <td className="px-4 py-3"><Pill tone={st.tone}>{st.label}</Pill></td>
                  <td className="px-2 py-3">
                    <div className="relative">
                      <button
                        onClick={() => setMenuFor(menuFor === r.id ? null : r.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-app-muted hover:bg-app-bg hover:text-app-ink"
                        aria-label="History row actions"
                      >
                        <MoreHorizontal size={16} />
                      </button>
                      {menuFor === r.id && (
                        <div
                          className="absolute right-0 top-9 z-20 w-44 rounded-xl border border-app-border bg-white p-1 shadow-card-hover"
                          onMouseLeave={() => setMenuFor(null)}
                        >
                          <button
                            onClick={() => { setMenuFor(null); onDownloadReport(r); }}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-medium text-app-ink hover:bg-app-bg"
                          >
                            <Download size={14} className="text-app-slate" /> Download report
                          </button>
                          <button
                            onClick={() => { setMenuFor(null); onRerun(r); }}
                            className={cn('flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-medium text-app-ink hover:bg-app-bg')}
                          >
                            <RotateCcw size={14} className="text-app-slate" /> Re-run
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
