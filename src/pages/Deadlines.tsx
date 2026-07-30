/**
 * Deadline Tracker — /deadlines
 * Alert board aggregating manual deadlines + auto-derived expiries
 * (tender closings, invoice due dates, active bid bonds, DMS business documents).
 * Alert law: OK green · WARNING ≤30d amber · CRITICAL ≤7d red · EXPIRED grey/red.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Timer, ScrollText, FileWarning, ShieldCheck, Ticket, IdCard, Award, CalendarDays,
  Plus, Download, Check, ChevronLeft, ChevronRight, LayoutList, ArrowRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  useStore, addItem, updateItem, uid, daysUntil, alertLevel, TODAY,
  type AlertLevel, type Deadline, type DeadlineType,
} from '@/lib/store';
import { formatDate } from '@/lib/format';
import {
  PageHeader, CountdownChip, Modal, EmptyState,
  Field, TextInput, DateInput, SelectInput, TextareaInput,
} from '@/components/shared';
import { Avatar, BTN_PRIMARY, BTN_SECONDARY, Card, downloadCSV, ownerOptions, useToasts } from '@/components/trackers/ui';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/* Unified deadline item model                                          */
/* ------------------------------------------------------------------ */

type DlType = 'tender' | 'contract' | 'invoice' | 'insurance' | 'bond' | 'license' | 'certification' | 'other';

interface DlItem {
  key: string;
  type: DlType;
  title: string;
  ref?: string;
  owner?: string;
  clientName?: string;
  date: string;
  route?: string;
  manualId?: string;
  level: AlertLevel;
  days: number;
}

const TYPE_META: Record<Exclude<DlType, 'other'>, { label: string; icon: LucideIcon; tile: string }> = {
  tender: { label: 'Tender Closing', icon: Timer, tile: 'bg-info-soft text-info' },
  contract: { label: 'Contract Expiry', icon: ScrollText, tile: 'bg-[#E4EBF4] text-navy-800' },
  invoice: { label: 'Invoice Due', icon: FileWarning, tile: 'bg-warning-soft text-warning' },
  insurance: { label: 'Insurance Expiry', icon: ShieldCheck, tile: 'bg-success-soft text-success' },
  bond: { label: 'Bid Bond Expiry', icon: Ticket, tile: 'bg-gold-soft text-gold' },
  license: { label: 'License Renewal', icon: IdCard, tile: 'bg-purple-soft text-purple' },
  certification: { label: 'Certification Expiry', icon: Award, tile: 'bg-grey-soft text-grey' },
};
const OTHER_META = { label: 'Other', icon: CalendarDays, tile: 'bg-grey-soft text-grey' };
const metaOf = (t: DlType) => (t === 'other' ? OTHER_META : TYPE_META[t]);

const MANUAL_TYPE_MAP: Record<DeadlineType, DlType> = {
  submission: 'tender',
  clarification: 'tender',
  invoice: 'invoice',
  milestone: 'contract',
  bond: 'bond',
  license: 'license',
  certification: 'certification',
  other: 'other',
};

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */

export default function Deadlines() {
  const s = useStore();
  const toasts = useToasts();
  const [typeFilter, setTypeFilter] = useState<'all' | DlType>('all');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [addOpen, setAddOpen] = useState(false);
  const [calMonth, setCalMonth] = useState(TODAY.slice(0, 7)); // yyyy-MM

  /* Aggregate manual + auto-derived deadlines */
  const items = useMemo<DlItem[]>(() => {
    const out: DlItem[] = [];
    const manualRefs = new Set(s.deadlines.map((d) => d.sourceRef).filter(Boolean));
    const lvl = (date: string): AlertLevel => alertLevel(date, s.settings);

    // Manual deadlines (open only)
    s.deadlines
      .filter((d) => d.status === 'open')
      .forEach((d) => {
        const owner = (d as Deadline & { owner?: string }).owner;
        out.push({
          key: `m-${d.id}`,
          type: MANUAL_TYPE_MAP[d.type] ?? 'other',
          title: d.title,
          ref: d.sourceRef,
          owner,
          clientName: d.clientName,
          date: d.date,
          route: d.sourceRef?.startsWith('FBV-TND') ? '/tenders' : d.sourceRef?.startsWith('FBV-INV') ? '/payments' : d.sourceRef?.startsWith('FBV-CON') ? '/contracts' : undefined,
          manualId: d.id,
          level: lvl(d.date),
          days: daysUntil(d.date),
        });
      });

    // Auto: tender closings (skip if a manual deadline already tracks the ref)
    s.tenders
      .filter((t) => (t.status === 'Open' || t.status === 'Submitted') && !manualRefs.has(t.refNo))
      .forEach((t) => {
        const client = s.clients.find((c) => c.id === t.clientId);
        out.push({
          key: `t-${t.id}`, type: 'tender', title: `Tender closing — ${t.title}`,
          ref: t.refNo, clientName: client?.name, date: t.submissionDeadline, route: '/tenders',
          level: lvl(t.submissionDeadline), days: daysUntil(t.submissionDeadline),
        });
      });

    // Auto: invoice due dates
    s.documents
      .filter((d) => d.type === 'invoice' && d.status !== 'Paid' && d.status !== 'Cancelled' && d.dueDate && !manualRefs.has(d.docNo))
      .forEach((d) => {
        const client = s.clients.find((c) => c.id === d.clientId);
        out.push({
          key: `i-${d.id}`, type: 'invoice', title: `Invoice due — ${client?.name ?? 'client'}`,
          ref: d.docNo, clientName: client?.name, date: d.dueDate!, route: '/payments',
          level: lvl(d.dueDate!), days: daysUntil(d.dueDate!),
        });
      });

    // Auto: active bid bond expiries
    s.bonds
      .filter((b) => b.status === 'Active' && !manualRefs.has(b.refNo))
      .forEach((b) => {
        out.push({
          key: `b-${b.id}`, type: 'bond', title: `${b.kind} expires — ${b.tenderTitle}`,
          ref: b.refNo, date: b.expiryDate, route: '/bonds',
          level: lvl(b.expiryDate), days: daysUntil(b.expiryDate),
        });
      });

    // Auto: DMS business documents (v2.0 wiring — licenses / certifications / insurance)
    s.dms
      .filter((d) => d.expiryDate && !manualRefs.has(d.refNo))
      .forEach((d) => {
        const type: DlType =
          d.docType === 'certification' ? 'certification' : d.docType === 'insurance' ? 'insurance' : 'license';
        out.push({
          key: `d-${d.id}`, type, title: `${d.title} — renewal`,
          ref: d.refNo, date: d.expiryDate!, route: '/dms',
          level: lvl(d.expiryDate!), days: daysUntil(d.expiryDate!),
        });
      });

    return out.sort((a, b) => a.date.localeCompare(b.date));
  }, [s]);

  const owners = useMemo(() => [...new Set(items.map((i) => i.owner).filter((x): x is string => Boolean(x)))].sort(), [items]);

  const filtered = useMemo(
    () =>
      items.filter(
        (i) => (typeFilter === 'all' || i.type === typeFilter) && (ownerFilter === 'all' || i.owner === ownerFilter),
      ),
    [items, typeFilter, ownerFilter],
  );

  const counts = useMemo(() => {
    const c: Record<AlertLevel, number> = { OK: 0, WARNING: 0, CRITICAL: 0, EXPIRED: 0 };
    filtered.forEach((i) => {
      c[i.level] += 1;
    });
    return c;
  }, [filtered]);

  const typeCounts = useMemo(() => {
    const m = new Map<DlType, number>();
    items.forEach((i) => m.set(i.type, (m.get(i.type) ?? 0) + 1));
    return m;
  }, [items]);

  const groups = useMemo(() => {
    const g: { label: string; band: string; rows: DlItem[] }[] = [
      { label: 'Overdue', band: 'text-grey', rows: [] },
      { label: 'Next 7 days', band: 'text-danger', rows: [] },
      { label: 'Next 30 days', band: 'text-warning', rows: [] },
      { label: 'Later', band: 'text-success', rows: [] },
    ];
    filtered.forEach((i) => {
      if (i.days < 0) g[0].rows.push(i);
      else if (i.days <= 7) g[1].rows.push(i);
      else if (i.days <= 30) g[2].rows.push(i);
      else g[3].rows.push(i);
    });
    return g.filter((x) => x.rows.length > 0);
  }, [filtered]);

  const markDone = (item: DlItem) => {
    if (!item.manualId) return;
    const id = item.manualId;
    updateItem('deadlines', id, { status: 'done' }, {
      action: 'Updated', entity: 'Deadline', entityRef: item.title,
      details: `Deadline marked done — ${item.title}`, verb: 'Completed', verbColor: 'green',
    });
    toasts.push(`"${item.title}" marked done`, {
      undo: () =>
        updateItem('deadlines', id, { status: 'open' }, {
          action: 'Updated', entity: 'Deadline', entityRef: item.title,
          details: `Deadline re-opened — ${item.title}`, verb: 'Re-opened', verbColor: 'blue',
        }),
    });
  };

  const exportCsv = () => {
    downloadCSV(
      'fbv-deadlines.csv',
      ['Title', 'Type', 'Reference', 'Owner', 'Client', 'Date', 'Days Left', 'Alert Level'],
      filtered.map((i) => [i.title, metaOf(i.type).label, i.ref ?? '', i.owner ?? '', i.clientName ?? '', i.date, i.days, i.level]),
    );
    toasts.push(`Exported ${filtered.length} deadlines to CSV`);
  };

  return (
    <div className="px-7 pb-8 pt-6">
      {toasts.node}
      <PageHeader
        title="Deadline Tracker"
        subtitle="Never miss a closing date, expiry or renewal."
        actions={
          <>
            <SelectInput
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
              options={[{ value: 'all', label: 'All owners' }, ...owners.map((o) => ({ value: o, label: o }))]}
              className="w-[160px]"
              aria-label="Owner filter"
            />
            <button onClick={exportCsv} className={BTN_SECONDARY}>
              <Download size={15} /> Export CSV
            </button>
            <button onClick={() => setAddOpen(true)} className={BTN_PRIMARY}>
              <Plus size={15} /> Add Deadline
            </button>
          </>
        }
      />

      {/* Alert summary cards */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(
          [
            { level: 'CRITICAL' as AlertLevel, label: 'Critical', border: 'border-l-danger', text: 'text-danger', pulse: true },
            { level: 'WARNING' as AlertLevel, label: 'Warning · ≤30d', border: 'border-l-warning', text: 'text-warning', pulse: false },
            { level: 'OK' as AlertLevel, label: 'OK', border: 'border-l-success', text: 'text-success', pulse: false },
            { level: 'EXPIRED' as AlertLevel, label: 'Expired', border: 'border-l-grey', text: 'text-grey', pulse: false },
          ]
        ).map((c, i) => (
          <motion.div
            key={c.level}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.05, ease: 'easeOut' }}
            className={cn('rounded-xl border border-app-border border-l-[3px] bg-app-card p-4 shadow-card', c.border)}
          >
            <div className="flex items-center gap-2">
              <span className={cn('h-2 w-2 rounded-full bg-current', c.text, c.pulse && counts.CRITICAL > 0 && 'animate-pulse-soft')} />
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-app-slate">{c.label}</span>
            </div>
            <div className={cn('mt-1.5 text-[28px] font-bold leading-8 tnum', c.text)}>{counts[c.level]}</div>
          </motion.div>
        ))}
      </div>

      {/* Type filter chips */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <TypeChip
          active={typeFilter === 'all'}
          onClick={() => setTypeFilter('all')}
          icon={LayoutList}
          tile="bg-[#E4EBF4] text-navy-800"
          label="All"
          count={items.length}
        />
        {(Object.keys(TYPE_META) as (keyof typeof TYPE_META)[]).map((t) => (
          <TypeChip
            key={t}
            active={typeFilter === t}
            onClick={() => setTypeFilter(typeFilter === t ? 'all' : t)}
            icon={TYPE_META[t].icon}
            tile={TYPE_META[t].tile}
            label={TYPE_META[t].label}
            count={typeCounts.get(t) ?? 0}
          />
        ))}
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-app-border bg-white p-0.5">
          {(['list', 'calendar'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                'flex h-7 items-center gap-1 rounded-md px-2.5 text-xs font-semibold capitalize transition',
                view === v ? 'bg-action text-white' : 'text-app-slate hover:bg-app-bg',
              )}
            >
              {v === 'list' ? <LayoutList size={13} /> : <CalendarDays size={13} />}
              {v}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing due — enjoy the calm"
            hint="No deadlines match the current filters. Business document expiries are tracked automatically."
            action={
              <button onClick={() => setAddOpen(true)} className={BTN_PRIMARY}>
                <Plus size={15} /> Add Deadline
              </button>
            }
          />
        </Card>
      ) : view === 'list' ? (
        <Card className="overflow-hidden">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="sticky top-0 z-10 border-b border-app-border bg-[#F8FAFC] px-4 py-2">
                <span className={cn('text-[11px] font-semibold uppercase tracking-[0.06em]', g.band)}>
                  {g.label} · {g.rows.length}
                </span>
              </div>
              <AnimatePresence initial={false}>
                {g.rows.map((item, idx) => {
                  const meta = metaOf(item.type);
                  const Icon = meta.icon;
                  return (
                    <motion.div
                      key={item.key}
                      layout="position"
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0.5, height: 0, transition: { duration: 0.3 } }}
                      transition={{ duration: 0.2, delay: Math.min(idx * 0.02, 0.2) }}
                      className="flex h-14 items-center gap-3 border-b border-[#EEF1F5] px-4 last:border-0 hover:bg-[#F8FAFC]"
                    >
                      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', meta.tile)}>
                        <Icon size={15} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-app-ink">{item.title}</div>
                        {item.ref && <div className="font-mono text-xs text-app-muted">{item.ref}</div>}
                      </div>
                      <div className="hidden w-40 items-center gap-2 md:flex">
                        {item.owner ? (
                          <>
                            <Avatar name={item.owner} size={22} />
                            <span className="truncate text-xs text-app-slate">{item.owner}</span>
                          </>
                        ) : (
                          <span className="truncate text-xs text-app-muted">{item.clientName ?? '—'}</span>
                        )}
                      </div>
                      <div className="w-24 text-right text-sm text-app-slate tnum">{formatDate(item.date)}</div>
                      <div className="w-24 text-right">
                        <CountdownChip date={item.date} pulse={item.level === 'CRITICAL'} />
                      </div>
                      <div className="flex w-28 shrink-0 items-center justify-end gap-1.5">
                        {item.route && (
                          <Link
                            to={item.route}
                            title="Open source record"
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-app-muted hover:bg-app-bg hover:text-action"
                          >
                            <ArrowRight size={14} />
                          </Link>
                        )}
                        {item.manualId && (
                          <button
                            onClick={() => markDone(item)}
                            title="Mark done"
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-app-border text-app-slate transition hover:border-success hover:bg-success-soft hover:text-success"
                          >
                            <Check size={14} />
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          ))}
        </Card>
      ) : (
        <CalendarView items={filtered} month={calMonth} onMonthChange={setCalMonth} />
      )}

      <AddDeadlineModal open={addOpen} onClose={() => setAddOpen(false)} onSaved={(t) => toasts.push(`Deadline "${t}" added`)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Type chip                                                            */
/* ------------------------------------------------------------------ */

function TypeChip({ active, onClick, icon: Icon, tile, label, count }: {
  active: boolean; onClick: () => void; icon: LucideIcon; tile: string; label: string; count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex h-9 items-center gap-2 rounded-full border px-3 text-[13px] font-medium transition',
        active ? 'border-action bg-info-soft text-info' : 'border-app-border bg-white text-app-slate hover:bg-app-bg',
      )}
    >
      <span className={cn('flex h-5 w-5 items-center justify-center rounded-md', tile)}>
        <Icon size={12} />
      </span>
      {label}
      <span className={cn('rounded-full px-1.5 text-[11px] font-semibold tnum', active ? 'bg-white/70' : 'bg-app-bg')}>{count}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Calendar view                                                        */
/* ------------------------------------------------------------------ */

const LEVEL_DOT: Record<AlertLevel, string> = {
  OK: 'bg-success', WARNING: 'bg-warning', CRITICAL: 'bg-danger', EXPIRED: 'bg-grey',
};

function CalendarView({ items, month, onMonthChange }: { items: DlItem[]; month: string; onMonthChange: (m: string) => void }) {
  const [y, mo] = month.split('-').map(Number);
  const first = new Date(y, mo - 1, 1);
  const startOffset = (first.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(y, mo, 0).getDate();
  const monthLabel = first.toLocaleDateString('en-KE', { month: 'long', year: 'numeric' });

  const shift = (n: number) => {
    const d = new Date(y, mo - 1 + n, 1);
    onMonthChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const byDay = new Map<number, DlItem[]>();
  items.forEach((i) => {
    if (i.date.startsWith(month)) {
      const d = Number(i.date.slice(8, 10));
      byDay.set(d, [...(byDay.get(d) ?? []), i]);
    }
  });

  const cells: (number | null)[] = [...Array<null>(startOffset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <motion.div key={month} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }}>
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-app-border px-4 py-3">
          <button onClick={() => shift(-1)} className="flex h-8 w-8 items-center justify-center rounded-lg text-app-slate hover:bg-app-bg" aria-label="Previous month">
            <ChevronLeft size={16} />
          </button>
          <h3 className="text-[15px] font-semibold text-app-ink">{monthLabel}</h3>
          <button onClick={() => shift(1)} className="flex h-8 w-8 items-center justify-center rounded-lg text-app-slate hover:bg-app-bg" aria-label="Next month">
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="grid grid-cols-7 border-b border-app-border bg-[#F8FAFC]">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d} className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.06em] text-app-muted">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            const dateIso = day ? `${month}-${String(day).padStart(2, '0')}` : '';
            const isToday = dateIso === TODAY;
            const dayItems = day ? (byDay.get(day) ?? []) : [];
            return (
              <div key={i} className={cn('min-h-[96px] border-b border-r border-[#EEF1F5] p-1.5 [&:nth-child(7n)]:border-r-0', !day && 'bg-[#F8FAFC]/50')}>
                {day && (
                  <>
                    <span
                      className={cn(
                        'mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold tnum',
                        isToday ? 'bg-gold text-navy-950 ring-2 ring-gold/40' : 'text-app-slate',
                      )}
                    >
                      {day}
                    </span>
                    <div className="space-y-1">
                      {dayItems.slice(0, 3).map((it) => (
                        <div
                          key={it.key}
                          title={it.title}
                          className="flex items-center gap-1.5 truncate rounded-md bg-app-bg px-1.5 py-0.5 text-[11px] font-medium text-app-ink"
                        >
                          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', LEVEL_DOT[it.level], it.level === 'CRITICAL' && 'animate-pulse-soft')} />
                          <span className="truncate">{it.title}</span>
                        </div>
                      ))}
                      {dayItems.length > 3 && (
                        <div className="px-1 text-[10px] font-semibold text-app-muted" title={dayItems.slice(3).map((x) => x.title).join('\n')}>
                          +{dayItems.length - 3} more
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Add Deadline modal                                                   */
/* ------------------------------------------------------------------ */

const ADD_TYPES: { value: DeadlineType; label: string }[] = [
  { value: 'submission', label: 'Tender Closing / Submission' },
  { value: 'clarification', label: 'Clarification Deadline' },
  { value: 'invoice', label: 'Invoice Due' },
  { value: 'milestone', label: 'Contract Milestone' },
  { value: 'bond', label: 'Bid Bond Expiry' },
  { value: 'other', label: 'Other' },
];

function AddDeadlineModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (title: string) => void }) {
  const s = useStore();
  const [type, setType] = useState<DeadlineType>('submission');
  const [title, setTitle] = useState('');
  const [linkedId, setLinkedId] = useState('');
  const [date, setDate] = useState('');
  const [owner, setOwner] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const linkedOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [{ value: '', label: '— Not linked —' }];
    if (type === 'submission' || type === 'clarification') {
      s.tenders.forEach((t) => opts.push({ value: t.id, label: `${t.refNo} — ${t.title}` }));
    } else if (type === 'invoice') {
      s.documents.filter((d) => d.type === 'invoice').forEach((d) => opts.push({ value: d.id, label: d.docNo }));
    } else if (type === 'milestone') {
      s.documents.filter((d) => d.type === 'contract').forEach((d) => opts.push({ value: d.id, label: d.docNo }));
    } else if (type === 'bond') {
      s.bonds.forEach((b) => opts.push({ value: b.id, label: `${b.refNo} — ${b.tenderTitle}` }));
    }
    return opts;
  }, [s, type]);

  const save = () => {
    if (!title.trim()) return setError('Title is required');
    if (!date) return setError('Deadline date is required');
    let sourceRef: string | undefined;
    let clientId: string | undefined;
    let clientName: string | undefined;
    if (linkedId) {
      const tender = s.tenders.find((t) => t.id === linkedId);
      const doc = s.documents.find((d) => d.id === linkedId);
      const bond = s.bonds.find((b) => b.id === linkedId);
      const cid = tender?.clientId ?? doc?.clientId;
      sourceRef = tender?.refNo ?? doc?.docNo ?? bond?.refNo;
      clientId = cid;
      clientName = s.clients.find((c) => c.id === cid)?.name;
    }
    const item = {
      id: uid('ddl'),
      title: title.trim(),
      clientId,
      clientName,
      date,
      type,
      status: 'open',
      sourceRef,
      ...(owner ? { owner } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    } as Deadline;
    addItem('deadlines', item, {
      action: 'Created', entity: 'Deadline', entityRef: item.title,
      details: `Deadline added — ${item.title} (${formatDate(date)})`, verb: 'Created', verbColor: 'grey',
    });
    onSaved(item.title);
    setTitle(''); setLinkedId(''); setDate(''); setOwner(''); setNotes(''); setError('');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Deadline"
      footer={
        <>
          <button onClick={onClose} className={BTN_SECONDARY}>Cancel</button>
          <button onClick={save} className={BTN_PRIMARY}>Save Deadline</button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Type" required>
          <SelectInput value={type} onChange={(e) => { setType(e.target.value as DeadlineType); setLinkedId(''); }} options={ADD_TYPES} />
        </Field>
        <Field label="Title" required error={error === 'Title is required' ? error : undefined}>
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Mombasa catering bid — submission" />
        </Field>
        <Field label="Linked record" hint="Optional — links to the source tender, invoice, contract or bond.">
          <SelectInput value={linkedId} onChange={(e) => setLinkedId(e.target.value)} options={linkedOptions} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Deadline date" required error={error === 'Deadline date is required' ? error : undefined}>
            <DateInput value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Owner">
            <SelectInput value={owner} onChange={(e) => setOwner(e.target.value)} options={[{ value: '', label: '— Unassigned —' }, ...ownerOptions().map((o) => ({ value: o, label: o }))]} />
          </Field>
        </div>
        <Field label="Notes">
          <TextareaInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Context, reminders, requirements…" />
        </Field>
        <p className="rounded-lg bg-gold-soft px-3 py-2 text-xs text-app-slate">
          Business document expiries (licenses &amp; certifications) are tracked automatically from the DMS vault — no need to add those here.
        </p>
      </div>
    </Modal>
  );
}
