/**
 * Audit Trail — /audit
 * Immutable record of every action in the system, rendered from the store's audit log.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { History, Users, FileSpreadsheet, Trash2, Download, ChevronDown } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useStore, TODAY, type AuditEntry } from '@/lib/store';
import {
  PageHeader, StatChip, Pill, EmptyState, DateInput, SelectInput,
} from '@/components/shared';
import type { Tone } from '@/components/shared';
import { Avatar, BTN_SECONDARY, Card, downloadCSV } from '@/components/trackers/ui';
import { cn } from '@/lib/utils';

const ACTION_TONE: Record<string, Tone> = {
  Created: 'grey', Updated: 'blue', Submitted: 'purple', Approved: 'green', Rejected: 'red',
  Deleted: 'red', Imported: 'gold', Exported: 'navy', Printed: 'grey', Completed: 'green',
  Scheduled: 'gold', Logged: 'blue', Released: 'green', Extended: 'blue', Uploaded: 'navy',
};

function tsFull(iso: string): string {
  try {
    return format(parseISO(iso), 'd MMM yyyy HH:mm:ss');
  } catch {
    return iso;
  }
}

/** Renders `Field: old → new` diffs as inline chips (old strikethrough muted, new bold). */
function DetailsText({ text }: { text: string }) {
  const parts = text.split(/(\S[^\s→]*\s→\s[^\s,;.]+)/g);
  if (parts.length === 1) return <span>{text}</span>;
  return (
    <span>
      {parts.map((p, i) => {
        const m = p.match(/^(.*?)\s→\s(.*)$/);
        if (!m) return <span key={i}>{p}</span>;
        return (
          <span key={i} className="inline-flex items-center gap-1 rounded-md bg-app-bg px-1.5 py-0.5">
            <span className="text-app-muted line-through">{m[1]}</span>
            <span className="font-bold text-app-ink">{m[2]}</span>
          </span>
        );
      })}
    </span>
  );
}

const PAGE_CAP = 200;

export default function Audit() {
  const s = useStore();
  const [userFilter, setUserFilter] = useState('all');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const seenRef = useRef<Set<string> | null>(null);

  /* Live-poll flash: entries that arrive after first render flash gold-soft */
  useEffect(() => {
    const ids = new Set(s.audit.map((a) => a.id));
    if (seenRef.current == null) {
      seenRef.current = ids;
      return;
    }
    const fresh = [...ids].filter((id) => !seenRef.current!.has(id));
    seenRef.current = ids;
    if (fresh.length > 0) {
      setFlashIds(new Set(fresh));
      const t = window.setTimeout(() => setFlashIds(new Set()), 1600);
      return () => window.clearTimeout(t);
    }
  }, [s.audit]);

  const users = useMemo(() => [...new Set(s.audit.map((a) => a.user))].sort(), [s.audit]);
  const modules = useMemo(() => [...new Set(s.audit.map((a) => a.entity))].sort(), [s.audit]);
  const actions = useMemo(() => [...new Set(s.audit.map((a) => a.action))].sort(), [s.audit]);

  const filtered = useMemo(
    () =>
      s.audit.filter(
        (a) =>
          (userFilter === 'all' || a.user === userFilter) &&
          (moduleFilter === 'all' || a.entity === moduleFilter) &&
          (actionFilter === 'all' || a.action === actionFilter) &&
          (!from || a.timestamp.slice(0, 10) >= from) &&
          (!to || a.timestamp.slice(0, 10) <= to),
      ),
    [s.audit, userFilter, moduleFilter, actionFilter, from, to],
  );
  const shown = filtered.slice(0, PAGE_CAP);

  const stats = useMemo(() => ({
    today: s.audit.filter((a) => a.timestamp.startsWith(TODAY)).length,
    users: new Set(s.audit.map((a) => a.user)).size,
    imports: s.audit.filter((a) => a.action === 'Imported').length,
    deletions: s.audit.filter((a) => a.action === 'Deleted').length,
  }), [s.audit]);

  const exportCsv = () => {
    downloadCSV(
      'fbv-audit-trail.csv',
      ['Timestamp', 'User', 'Action', 'Module', 'Reference', 'Details'],
      filtered.map((a) => [a.timestamp, a.user, a.action, a.entity, a.entityRef, a.details]),
    );
  };

  return (
    <div className="px-7 pb-8 pt-6">
      <PageHeader
        title="Audit Trail"
        subtitle="Immutable record of every action in the system."
        actions={
          <button onClick={exportCsv} className={BTN_SECONDARY}><Download size={15} /> Export CSV</button>
        }
      />

      {/* Stats */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { icon: <History size={17} />, value: stats.today, label: 'Events Today', variant: 'blue' as const },
          { icon: <Users size={17} />, value: stats.users, label: 'Active Users', variant: 'navy' as const },
          { icon: <FileSpreadsheet size={17} />, value: stats.imports, label: 'Imports', variant: 'gold' as const },
          { icon: <Trash2 size={17} />, value: stats.deletions, label: 'Deletions', variant: 'red' as const },
        ].map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: i * 0.05, ease: 'easeOut' }}>
            <StatChip icon={c.icon} value={c.value} label={c.label} variant={c.variant} />
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <Card className="mb-4 flex flex-wrap items-center gap-3 p-3">
        <SelectInput value={userFilter} onChange={(e) => setUserFilter(e.target.value)} options={[{ value: 'all', label: 'All users' }, ...users.map((u) => ({ value: u, label: u }))]} className="w-[170px]" aria-label="User filter" />
        <SelectInput value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)} options={[{ value: 'all', label: 'All modules' }, ...modules.map((m) => ({ value: m, label: m }))]} className="w-[170px]" aria-label="Module filter" />
        <SelectInput value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} options={[{ value: 'all', label: 'All actions' }, ...actions.map((a) => ({ value: a, label: a }))]} className="w-[150px]" aria-label="Action filter" />
        <div className="flex items-center gap-2">
          <DateInput value={from} onChange={(e) => setFrom(e.target.value)} className="w-[150px]" aria-label="From date" />
          <span className="text-xs text-app-muted">to</span>
          <DateInput value={to} onChange={(e) => setTo(e.target.value)} className="w-[150px]" aria-label="To date" />
        </div>
        {(userFilter !== 'all' || moduleFilter !== 'all' || actionFilter !== 'all' || from || to) && (
          <button
            onClick={() => { setUserFilter('all'); setModuleFilter('all'); setActionFilter('all'); setFrom(''); setTo(''); }}
            className="text-xs font-semibold text-action hover:underline"
          >
            Clear filters
          </button>
        )}
        <span className="ml-auto text-xs text-app-muted tnum">{filtered.length} events</span>
      </Card>

      <Card className="overflow-hidden">
        {shown.length === 0 ? (
          <EmptyState title="No audit events" hint="Every create, update, delete and approval in the system is recorded here." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app-border bg-[#F8FAFC] text-left">
                {['Timestamp', 'User', 'Action', 'Module', 'Reference', 'Details', ''].map((h) => (
                  <th key={h} className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-app-muted">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {shown.map((a, i) => (
                  <AuditRow
                    key={a.id}
                    entry={a}
                    index={i}
                    flash={flashIds.has(a.id)}
                    expanded={expanded === a.id}
                    onToggle={() => setExpanded(expanded === a.id ? null : a.id)}
                  />
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        )}
        {filtered.length > PAGE_CAP && (
          <div className="border-t border-app-border px-4 py-2.5 text-center text-xs text-app-muted tnum">
            Showing {PAGE_CAP} of {filtered.length} events — narrow the filters to see older entries
          </div>
        )}
      </Card>
    </div>
  );
}

function AuditRow({ entry, index, flash, expanded, onToggle }: {
  entry: AuditEntry; index: number; flash: boolean; expanded: boolean; onToggle: () => void;
}) {
  const kv: [string, string][] = [
    ['id', entry.id],
    ['timestamp', entry.timestamp],
    ['user', entry.user],
    ['action', entry.action],
    ['entity', entry.entity],
    ['entityRef', entry.entityRef],
    ['details', entry.details],
  ];
  return (
    <>
      <motion.tr
        layout="position"
        initial={{ opacity: 0, x: -6 }}
        animate={{ opacity: 1, x: 0, backgroundColor: flash ? '#F7F0DA' : 'rgba(255,255,255,0)' }}
        transition={{ duration: 0.2, delay: Math.min(index * 0.015, 0.75), backgroundColor: { duration: flash ? 0.3 : 1.2 } }}
        onClick={onToggle}
        className="h-12 cursor-pointer border-b border-[#EEF1F5] last:border-0 hover:bg-[#F8FAFC]"
      >
        <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-app-slate tnum">{tsFull(entry.timestamp)}</td>
        <td className="px-3 py-2">
          <span className="flex items-center gap-2">
            <Avatar name={entry.user} size={22} />
            <span className="whitespace-nowrap text-[13px] text-app-ink">{entry.user}</span>
          </span>
        </td>
        <td className="px-3 py-2"><Pill tone={ACTION_TONE[entry.action] ?? 'grey'}>{entry.action}</Pill></td>
        <td className="px-3 py-2">
          <span className="rounded-full bg-grey-soft px-2.5 py-1 text-[11px] font-semibold text-grey">{entry.entity}</span>
        </td>
        <td className="max-w-[160px] truncate px-3 py-2 font-mono text-xs font-medium text-navy-800" title={entry.entityRef}>{entry.entityRef}</td>
        <td className="max-w-[320px] truncate px-3 py-2 text-[13px] text-app-slate" title={entry.details}>
          <DetailsText text={entry.details} />
        </td>
        <td className="px-3 py-2">
          <ChevronDown size={14} className={cn('text-app-muted transition-transform', expanded && 'rotate-180')} />
        </td>
      </motion.tr>
      {expanded && (
        <tr className="border-b border-[#EEF1F5] bg-[#F8FAFC]">
          <td colSpan={7} className="px-6 py-3">
            <div className="grid max-w-[640px] grid-cols-[120px_1fr] gap-y-1 rounded-lg border border-app-border bg-white p-3 font-mono text-xs">
              {kv.map(([k, v]) => (
                <div key={k} className="contents">
                  <span className="font-semibold text-app-muted">{k}</span>
                  <span className="break-all text-app-ink">{v}</span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
