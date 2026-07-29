/**
 * CRM Communication Log — /crm
 * Calls, emails, meetings, site visits & WhatsApp with clients; follow-up tasks
 * feed the Deadline Tracker.
 */
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Phone, Mail, Users, MapPin, MessageSquare, Plus, Download, Search, CalendarClock, ChevronDown,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  useStore, addItem, updateItem, uid, daysUntil, TODAY,
  type CRMEntry,
} from '@/lib/store';
import { formatDate } from '@/lib/format';
import {
  PageHeader, StatChip, Pill, Modal, EmptyState,
  Field, TextInput, DateInput, SelectInput, TextareaInput, Toggle,
} from '@/components/shared';
import type { Tone } from '@/components/shared';
import { Avatar, BTN_PRIMARY, BTN_SECONDARY, Card, downloadCSV, useToasts } from '@/components/trackers/ui';
import { cn } from '@/lib/utils';

/* Extended fields carried in localStorage but missing from the base CRMEntry type. */
type Outcome = 'Positive' | 'Neutral' | 'Negative';
type CrmX = CRMEntry & { outcome?: Outcome; followUpDate?: string; followUpDone?: boolean; durationMin?: number };

const CHANNEL_META: Record<CRMEntry['channel'], { icon: LucideIcon; tile: string }> = {
  Call: { icon: Phone, tile: 'bg-info-soft text-info' },
  Email: { icon: Mail, tile: 'bg-purple-soft text-purple' },
  Meeting: { icon: Users, tile: 'bg-success-soft text-success' },
  'Site Visit': { icon: MapPin, tile: 'bg-[#E4EBF4] text-navy-800' },
  WhatsApp: { icon: MessageSquare, tile: 'bg-grey-soft text-grey' },
};
const OUTCOME_TONE: Record<Outcome, Tone> = { Positive: 'green', Neutral: 'grey', Negative: 'red' };

function relDate(date: string): string {
  const d = daysUntil(date);
  if (d === 0) return 'today';
  if (d < 0) return `${-d}d ago`;
  return `in ${d}d`;
}

export default function Crm() {
  const s = useStore();
  const toasts = useToasts();
  const [clientId, setClientId] = useState('all');
  const [channel, setChannel] = useState<'all' | CRMEntry['channel']>('all');
  const [railQuery, setRailQuery] = useState('');
  const [logOpen, setLogOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const entries = useMemo(() => s.crm as CrmX[], [s.crm]);

  const clientStats = useMemo(() => {
    const m = new Map<string, { last: string; pendingFollowUp: boolean }>();
    entries.forEach((e) => {
      const cur = m.get(e.clientId);
      const overdue = e.followUpDate != null && !e.followUpDone && daysUntil(e.followUpDate) <= 0;
      if (!cur || e.date > cur.last) {
        m.set(e.clientId, { last: e.date, pendingFollowUp: overdue || (cur?.pendingFollowUp ?? false) });
      } else if (overdue) {
        m.set(e.clientId, { ...cur, pendingFollowUp: true });
      }
    });
    return m;
  }, [entries]);

  const railClients = useMemo(() => {
    return s.clients
      .filter((c) => c.name.toLowerCase().includes(railQuery.toLowerCase()))
      .sort((a, b) => (clientStats.get(b.id)?.last ?? '').localeCompare(clientStats.get(a.id)?.last ?? ''));
  }, [s.clients, railQuery, clientStats]);

  const filtered = useMemo(
    () =>
      entries
        .filter((e) => (clientId === 'all' || e.clientId === clientId) && (channel === 'all' || e.channel === channel))
        .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
    [entries, clientId, channel],
  );

  const groups = useMemo(() => {
    const m = new Map<string, CrmX[]>();
    filtered.forEach((e) => m.set(e.date, [...(m.get(e.date) ?? []), e]));
    return [...m.entries()];
  }, [filtered]);

  const stats = useMemo(() => {
    const month = TODAY.slice(0, 7);
    const thisMonth = entries.filter((e) => e.date.startsWith(month)).length;
    const followUps = entries.filter((e) => e.followUpDate && !e.followUpDone);
    const due = followUps.filter((e) => daysUntil(e.followUpDate!) >= 0).length;
    const overdue = followUps.filter((e) => daysUntil(e.followUpDate!) < 0).length;
    const activeClients = s.clients.filter((c) => c.status === 'Active').length;
    return { thisMonth, due, activeClients, overdue };
  }, [entries, s.clients]);

  const completeFollowUp = (e: CrmX) => {
    updateItem('crm', e.id, { followUpDone: true } as Partial<CRMEntry>, {
      action: 'Updated', entity: 'CRM Entry', entityRef: e.subject,
      details: `Follow-up completed — ${e.subject}`, verb: 'Completed', verbColor: 'green',
    });
    toasts.push('Follow-up marked done');
  };

  const exportCsv = () => {
    downloadCSV(
      'fbv-crm-log.csv',
      ['Date', 'Client', 'Channel', 'Subject', 'Notes', 'Outcome', 'Follow-up', 'Logged By'],
      filtered.map((e) => [
        e.date, s.clients.find((c) => c.id === e.clientId)?.name ?? '', e.channel, e.subject,
        e.notes, e.outcome ?? '', e.followUpDate ?? '', e.user,
      ]),
    );
    toasts.push(`Exported ${filtered.length} CRM entries to CSV`);
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="px-7 pb-8 pt-6">
      {toasts.node}
      <PageHeader
        title="CRM Communication Log"
        subtitle="Every call, email and meeting with clients."
        actions={
          <>
            <SelectInput
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              options={[{ value: 'all', label: 'All clients' }, ...s.clients.map((c) => ({ value: c.id, label: c.name }))]}
              className="w-[200px]"
              aria-label="Client filter"
            />
            <button onClick={exportCsv} className={BTN_SECONDARY}><Download size={15} /> Export CSV</button>
            <button onClick={() => setLogOpen(true)} className={BTN_PRIMARY}><Plus size={15} /> Log Entry</button>
          </>
        }
      />

      {/* Stats */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { icon: <MessageSquare size={17} />, value: stats.thisMonth, label: 'Entries This Month', variant: 'blue' as const },
          { icon: <CalendarClock size={17} />, value: stats.due, label: 'Follow-ups Due', variant: 'amber' as const },
          { icon: <Users size={17} />, value: stats.activeClients, label: 'Active Clients', variant: 'green' as const },
          { icon: <CalendarClock size={17} />, value: stats.overdue, label: 'Overdue Follow-ups', variant: 'red' as const },
        ].map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: i * 0.05, ease: 'easeOut' }}>
            <StatChip icon={c.icon} value={c.value} label={c.label} variant={c.variant} />
          </motion.div>
        ))}
      </div>

      {/* Type filter chips */}
      <div className="mb-5 flex flex-wrap gap-2">
        {(['all', 'Call', 'Email', 'Meeting', 'Site Visit', 'WhatsApp'] as const).map((ch) => {
          const active = channel === ch;
          const meta = ch === 'all' ? null : CHANNEL_META[ch];
          const Icon = meta?.icon ?? MessageSquare;
          return (
            <button
              key={ch}
              onClick={() => setChannel(ch)}
              className={cn(
                'flex h-9 items-center gap-2 rounded-full border px-3 text-[13px] font-medium transition',
                active ? 'border-action bg-info-soft text-info' : 'border-app-border bg-white text-app-slate hover:bg-app-bg',
              )}
            >
              <span className={cn('flex h-5 w-5 items-center justify-center rounded-md', meta?.tile ?? 'bg-[#E4EBF4] text-navy-800')}>
                <Icon size={12} />
              </span>
              {ch === 'all' ? 'All' : ch}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
        {/* Client rail */}
        <Card className="self-start overflow-hidden lg:sticky lg:top-4">
          <div className="border-b border-app-border p-3">
            <div className="flex h-[34px] items-center gap-2 rounded-lg border border-app-border bg-white px-2.5">
              <Search size={14} className="text-app-muted" />
              <input
                value={railQuery}
                onChange={(e) => setRailQuery(e.target.value)}
                placeholder="Search clients…"
                className="w-full bg-transparent text-[13px] text-app-ink outline-none placeholder:text-app-muted"
              />
            </div>
          </div>
          <div className="max-h-[520px] overflow-y-auto p-1.5">
            <button
              onClick={() => setClientId('all')}
              className={cn(
                'mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition',
                clientId === 'all' ? 'bg-info-soft' : 'hover:bg-app-bg',
              )}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-800 text-[11px] font-semibold text-white">ALL</span>
              <span className="text-[13px] font-semibold text-app-ink">All clients</span>
            </button>
            {railClients.map((c) => {
              const st = clientStats.get(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => setClientId(clientId === c.id ? 'all' : c.id)}
                  className={cn(
                    'mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition',
                    clientId === c.id ? 'bg-info-soft' : 'hover:bg-app-bg',
                  )}
                >
                  <span className="relative shrink-0">
                    <Avatar name={c.name} size={32} />
                    {st?.pendingFollowUp && (
                      <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-warning ring-2 ring-white" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-app-ink">{c.name}</span>
                    <span className="block text-[11px] text-app-muted tnum">{st ? `last contact ${relDate(st.last)}` : 'no contact yet'}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Timeline */}
        <div>
          {groups.length === 0 ? (
            <Card>
              <EmptyState
                title="No communication logged"
                hint="Log calls, emails and meetings to build the client relationship record."
                action={<button onClick={() => setLogOpen(true)} className={BTN_PRIMARY}><Plus size={15} /> Log Entry</button>}
              />
            </Card>
          ) : (
            groups.map(([date, items], gi) => (
              <motion.div
                key={date}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: Math.min(gi * 0.05, 0.3), ease: 'easeOut' }}
                className="mb-4"
              >
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-app-muted tnum">
                  {formatDate(date)} · {relDate(date)}
                </div>
                <div className="space-y-2">
                  {items.map((e) => {
                    const meta = CHANNEL_META[e.channel] ?? CHANNEL_META.WhatsApp;
                    const Icon = meta.icon;
                    const client = s.clients.find((c) => c.id === e.clientId);
                    const isOpen = expanded.has(e.id);
                    const fuOverdue = e.followUpDate && !e.followUpDone && daysUntil(e.followUpDate) < 0;
                    return (
                      <div key={e.id} className="rounded-xl border border-app-border bg-app-card p-4 shadow-card">
                        <div className="flex items-start gap-3">
                          <span className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', meta.tile)}>
                            <Icon size={16} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-app-ink">{e.subject}</span>
                              <span className="rounded-full bg-app-bg px-2 py-0.5 text-[11px] font-medium text-app-slate">{client?.name ?? 'Unknown client'}</span>
                              {e.outcome && <Pill tone={OUTCOME_TONE[e.outcome]}>{e.outcome}</Pill>}
                            </div>
                            <p className={cn('mt-1 text-sm text-app-slate', !isOpen && 'line-clamp-2')}>{e.notes}</p>
                            {e.notes.length > 120 && (
                              <button onClick={() => toggleExpand(e.id)} className="mt-0.5 flex items-center gap-0.5 text-xs font-semibold text-action">
                                {isOpen ? 'Show less' : 'Read more'}
                                <ChevronDown size={12} className={cn('transition-transform', isOpen && 'rotate-180')} />
                              </button>
                            )}
                            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-app-muted">
                              <span className="flex items-center gap-1.5">
                                <Avatar name={e.user} size={18} /> {e.user}
                              </span>
                              <span>{e.channel}</span>
                              {e.durationMin != null && <span className="tnum">{e.durationMin} min</span>}
                              {e.followUpDate && !e.followUpDone && (
                                <button
                                  onClick={() => completeFollowUp(e)}
                                  title="Click to mark follow-up done"
                                  className={cn(
                                    'flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold tnum transition',
                                    fuOverdue ? 'bg-danger-soft text-danger animate-pulse-soft' : 'bg-warning-soft text-warning',
                                  )}
                                >
                                  <CalendarClock size={11} />
                                  Follow up {formatDate(e.followUpDate)}{fuOverdue ? ' — overdue' : ''}
                                </button>
                              )}
                              {e.followUpDate && e.followUpDone && (
                                <span className="flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-1 text-[11px] font-semibold text-success">
                                  Follow-up done
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>

      <LogEntryModal open={logOpen} onClose={() => setLogOpen(false)} onSaved={(subj) => toasts.push(`"${subj}" logged`)} defaultClientId={clientId !== 'all' ? clientId : ''} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Log Entry modal                                                      */
/* ------------------------------------------------------------------ */

function LogEntryModal({ open, onClose, onSaved, defaultClientId }: {
  open: boolean; onClose: () => void; onSaved: (subject: string) => void; defaultClientId: string;
}) {
  const s = useStore();
  const [clientId, setClientId] = useState(defaultClientId);
  const [channel, setChannel] = useState<CRMEntry['channel']>('Call');
  const [subject, setSubject] = useState('');
  const [notes, setNotes] = useState('');
  const [outcome, setOutcome] = useState<Outcome>('Neutral');
  const [duration, setDuration] = useState('');
  const [hasFollowUp, setHasFollowUp] = useState(false);
  const [followUpDate, setFollowUpDate] = useState('');
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  if (open !== loaded) {
    setLoaded(open);
    if (open) {
      setClientId(defaultClientId); setChannel('Call'); setSubject(''); setNotes('');
      setOutcome('Neutral'); setDuration(''); setHasFollowUp(false); setFollowUpDate(''); setError('');
    }
  }

  const save = () => {
    if (!clientId) return setError('Client is required');
    if (!subject.trim()) return setError('Subject is required');
    if (hasFollowUp && !followUpDate) return setError('Pick a follow-up date (or switch the toggle off)');
    const entry = {
      id: uid('crm'),
      clientId,
      date: TODAY,
      channel,
      subject: subject.trim(),
      notes: notes.trim(),
      user: 'Admin User',
      outcome,
      ...(channel === 'Call' && duration ? { durationMin: Number(duration) } : {}),
      ...(hasFollowUp ? { followUpDate, followUpDone: false } : {}),
    } as CRMEntry;
    addItem('crm', entry, {
      action: 'Created', entity: 'CRM Entry', entityRef: entry.subject,
      details: `${channel} logged — ${entry.subject}`, verb: 'Logged', verbColor: 'blue',
    });
    if (hasFollowUp) {
      const client = s.clients.find((c) => c.id === clientId);
      addItem('deadlines', {
        id: uid('ddl'),
        title: `Follow up — ${entry.subject} (${client?.name ?? 'client'})`,
        clientId,
        clientName: client?.name,
        date: followUpDate,
        type: 'other',
        status: 'open',
        sourceRef: entry.id,
      }, {
        action: 'Created', entity: 'Deadline', entityRef: entry.subject,
        details: `CRM follow-up scheduled — ${entry.subject} (${formatDate(followUpDate)})`, verb: 'Scheduled', verbColor: 'gold',
      });
    }
    onSaved(entry.subject);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Log Communication"
      width="max-w-[620px]"
      footer={
        <>
          <button onClick={onClose} className={BTN_SECONDARY}>Cancel</button>
          <button onClick={save} className={BTN_PRIMARY}>Save Entry</button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Client" required error={error === 'Client is required' ? error : undefined}>
          <SelectInput
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            options={[{ value: '', label: '— Select client —' }, ...s.clients.map((c) => ({ value: c.id, label: c.name }))]}
          />
        </Field>
        <Field label="Type" required>
          <div className="grid grid-cols-5 gap-2">
            {(Object.keys(CHANNEL_META) as CRMEntry['channel'][]).map((ch) => {
              const Icon = CHANNEL_META[ch].icon;
              const active = channel === ch;
              return (
                <button
                  key={ch}
                  type="button"
                  onClick={() => setChannel(ch)}
                  className={cn(
                    'flex h-14 flex-col items-center justify-center gap-1 rounded-lg border text-[11px] font-semibold transition',
                    active ? 'border-action bg-info-soft text-info' : 'border-app-border bg-white text-app-slate hover:bg-app-bg',
                  )}
                >
                  <Icon size={16} />
                  {ch}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="Subject" required error={error === 'Subject is required' ? error : undefined}>
          <TextInput value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Overdue invoice follow-up" />
        </Field>
        <Field label="Notes">
          <TextareaInput value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="What was discussed, commitments made…" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Outcome" required>
            <SelectInput value={outcome} onChange={(e) => setOutcome(e.target.value as Outcome)} options={(['Positive', 'Neutral', 'Negative'] as Outcome[]).map((o) => ({ value: o, label: o }))} />
          </Field>
          {channel === 'Call' ? (
            <Field label="Duration (min)">
              <TextInput type="number" min={0} value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="15" />
            </Field>
          ) : (
            <div />
          )}
        </div>
        <div className="rounded-lg border border-app-border px-3 py-2.5">
          <Toggle checked={hasFollowUp} onChange={setHasFollowUp} label="Schedule a follow-up" />
          {hasFollowUp && (
            <div className="mt-3">
              <Field label="Follow-up date" required error={error.startsWith('Pick a follow-up') ? error : undefined} hint="Also creates an entry in the Deadline Tracker.">
                <DateInput value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
              </Field>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
