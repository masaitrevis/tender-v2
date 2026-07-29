/** Tender Register — /tenders
 *  Colour-coded register of every tender: status filter tabs, stats, sorting,
 *  bulk selection, CSV export and the sectioned add/edit drawer. */
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlarmClock, Archive, Banknote, ChevronRight, ChevronUp, Download, FolderOpen,
  Gauge, MoreHorizontal, Plus, Search, Send, Trophy, UserPlus, XCircle,
} from 'lucide-react';
import {
  useStore, updateItem, removeItem, addItem, nextDocNumber, nowISO, uid, daysUntil,
  logActivity, TODAY,
} from '@/lib/store';
import type { AppState, Tender, TenderStatus } from '@/lib/store';
import { formatKES, formatKESCompact, formatDate } from '@/lib/format';
import {
  PageHeader, Pill, CountdownChip, StatChip, EmptyState, ConfirmDialog, Modal,
  Field, SelectInput,
} from '@/components/shared';
import {
  useExtras, setTenderExtras, winProbabilityOf, getExtras,
} from '@/components/tenders/extras';
import { TenderFormDrawer } from '@/components/tenders/TenderFormDrawer';
import {
  Avatar, Btn, CountUp, PageEnter, STATUS_DOT, STATUS_TAB_BG, categoryClass, CATEGORY_CHIP,
} from '@/components/tenders/ui';
import { cn } from '@/lib/utils';

const STATUS_ORDER: TenderStatus[] = ['Open', 'Submitted', 'Under Evaluation', 'Won', 'Lost', 'Cancelled'];
const PAGE_SIZE = 8;

type SortKey = 'deadline' | 'value' | 'winProb';

/** Seed-flavoured default officer assignment (editable via the drawer). */
const DEFAULT_OFFICER: Record<string, string> = {
  'tnd-005': 'emp-002', 'tnd-006': 'emp-002', 'tnd-007': 'emp-004',
  'tnd-008': 'emp-005', 'tnd-009': 'emp-002',
};

function officerIdOf(tenderId: string, extras: ReturnType<typeof getExtras>): string | undefined {
  return extras.tenders[tenderId]?.assignedOfficerId ?? DEFAULT_OFFICER[tenderId];
}

/* ---------------- CSV export ---------------- */

function exportCsv(rows: Tender[], state: AppState, filename: string) {
  const extras = getExtras();
  const clientName = (id: string) => state.clients.find((c) => c.id === id)?.name ?? '';
  const officerName = (id: string) => {
    const oid = officerIdOf(id, extras);
    return oid ? state.employees.find((e) => e.id === oid)?.name ?? '' : '';
  };
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [
    ['Tender No', 'Name', 'Client', 'Category', 'Closing Date', 'Value (KES)', 'Win Probability', 'Status', 'Assigned Officer'].join(','),
    ...rows.map((t) =>
      [
        esc(t.refNo), esc(t.title), esc(clientName(t.clientId)), esc(t.category),
        t.submissionDeadline, t.value, `${winProbabilityOf(t.id, t.status)}%`, esc(t.status), esc(officerName(t.id)),
      ].join(','),
    ),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  logActivity({
    action: 'Exported', entity: 'Tender Register', entityRef: filename,
    details: `Exported ${rows.length} tenders to CSV`,
    verb: 'Exported', verbColor: 'navy',
  });
}

/* ---------------- win-probability mini bar ---------------- */

function WinProbBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-[60px] overflow-hidden rounded-full bg-grey-soft">
        <motion.div
          className="h-full rounded-full bg-action"
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
      <span className="text-xs font-medium text-app-slate tnum">{value}%</span>
    </div>
  );
}

/* ---------------- closing date cell ---------------- */

function ClosingCell({ tender }: { tender: Tender }) {
  const days = daysUntil(tender.submissionDeadline);
  const open = tender.status === 'Open';
  const overdueOpen = open && days < 0;
  return (
    <div className="flex items-center gap-2">
      {overdueOpen && <AlarmClock size={14} className="shrink-0 text-danger" />}
      <span className={cn('tnum text-sm', overdueOpen ? 'font-bold text-danger' : 'text-app-ink')}>
        {formatDate(tender.submissionDeadline)}
      </span>
      {open ? (
        <CountdownChip date={tender.submissionDeadline} pulse={overdueOpen} />
      ) : (
        <span className="inline-flex items-center rounded-full bg-grey-soft px-2.5 py-1 text-[11px] font-semibold text-grey">
          Closed
        </span>
      )}
    </div>
  );
}

/* ================================================================== */

export default function Tenders() {
  const state = useStore();
  const extras = useExtras();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'All' | TenderStatus>('All');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'deadline', dir: 1 });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editTender, setEditTender] = useState<Tender | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignOfficer, setAssignOfficer] = useState('');
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteTender, setDeleteTender] = useState<Tender | null>(null);

  const clientName = useMemo(() => {
    const m = new Map(state.clients.map((c) => [c.id, c.name]));
    return (id: string) => m.get(id) ?? '—';
  }, [state.clients]);

  const employeeById = useMemo(() => {
    const m = new Map(state.employees.map((e) => [e.id, e]));
    return (id?: string) => (id ? m.get(id) : undefined);
  }, [state.employees]);

  /* counts + pipeline */
  const counts = useMemo(() => {
    const c: Record<TenderStatus, number> = { Open: 0, Submitted: 0, 'Under Evaluation': 0, Won: 0, Lost: 0, Cancelled: 0 };
    state.tenders.forEach((t) => { c[t.status] += 1; });
    return c;
  }, [state.tenders]);
  const pipeline = useMemo(
    () => state.tenders.filter((t) => t.status === 'Open').reduce((s, t) => s + t.value, 0),
    [state.tenders],
  );

  /* filter + sort */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = state.tenders.filter((t) => (tab === 'All' ? true : t.status === tab));
    if (q) {
      rows = rows.filter((t) =>
        [t.refNo, t.title, t.category, clientName(t.clientId)].join(' ').toLowerCase().includes(q),
      );
    }
    const val = (t: Tender): number => {
      if (sort.key === 'value') return t.value;
      if (sort.key === 'winProb') return winProbabilityOf(t.id, t.status);
      return new Date(t.submissionDeadline).getTime();
    };
    return [...rows].sort((a, b) => (val(a) - val(b)) * sort.dir);
  }, [state.tenders, tab, search, sort, clientName, extras]); // eslint-disable-line react-hooks/exhaustive-deps

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: 1 }));

  const toggleSelect = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allOnPageSelected = pageRows.length > 0 && pageRows.every((t) => selected.has(t.id));
  const toggleSelectPage = () =>
    setSelected((s) => {
      const next = new Set(s);
      if (allOnPageSelected) pageRows.forEach((t) => next.delete(t.id));
      else pageRows.forEach((t) => next.add(t.id));
      return next;
    });

  const openEdit = (t: Tender) => {
    setEditTender(t);
    setDrawerOpen(true);
    setMenuFor(null);
  };

  const duplicateTender = (t: Tender) => {
    const id = uid('tnd');
    const refNo = nextDocNumber('FBV-TND');
    addItem(
      'tenders',
      { ...t, id, refNo, title: `${t.title} (Copy)`, status: 'Open', createdAt: nowISO() },
      { entityRef: refNo, details: `Duplicated tender ${t.refNo} → ${refNo}`, verb: 'Created', verbColor: 'grey' },
    );
    const ex = getExtras().tenders[t.id];
    if (ex) setTenderExtras(id, ex);
    setMenuFor(null);
  };

  const applyAssign = () => {
    const emp = employeeById(assignOfficer);
    if (!emp) return;
    selected.forEach((id) => {
      const t = state.tenders.find((x) => x.id === id);
      if (t) setTenderExtras(id, { assignedOfficerId: emp.id });
    });
    logActivity({
      action: 'Updated', entity: 'Tender', entityRef: `${selected.size} tenders`,
      details: `Assigned ${emp.name} to ${selected.size} tender(s)`,
      verb: 'Assigned', verbColor: 'blue',
    });
    setAssignOpen(false);
    setSelected(new Set());
  };

  const applyArchive = () => {
    selected.forEach((id) => {
      const t = state.tenders.find((x) => x.id === id);
      if (t && t.status !== 'Cancelled') {
        updateItem('tenders', id, { status: 'Cancelled' }, {
          entityRef: t.refNo, details: `Archived (cancelled) tender — ${t.refNo}`,
          verb: 'Archived', verbColor: 'grey',
        });
      }
    });
    setSelected(new Set());
  };

  const chips: Array<{ label: string; value: number | string; variant: 'amber' | 'purple' | 'blue' | 'green' | 'red' | 'navy'; icon: ReactNode; money?: boolean }> = [
    { label: 'Open', value: counts.Open, variant: 'amber', icon: <FolderOpen size={18} /> },
    { label: 'Submitted', value: counts.Submitted, variant: 'purple', icon: <Send size={18} /> },
    { label: 'Under Evaluation', value: counts['Under Evaluation'], variant: 'blue', icon: <Gauge size={18} /> },
    { label: 'Won', value: counts.Won, variant: 'green', icon: <Trophy size={18} /> },
    { label: 'Lost', value: counts.Lost, variant: 'red', icon: <XCircle size={18} /> },
    { label: 'Pipeline', value: pipeline, variant: 'navy', icon: <Banknote size={18} />, money: true },
  ];

  return (
    <PageEnter>
      <PageHeader
        title="Tender Register"
        subtitle={`${state.tenders.length} tenders · pipeline ${formatKESCompact(pipeline)}`}
        actions={
          <>
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-app-muted" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search tenders…"
                className="h-9 w-[220px] rounded-lg border border-app-border bg-white pl-9 pr-3 text-sm text-app-ink outline-none transition placeholder:text-app-muted focus:border-action focus:ring-2 focus:ring-[rgba(37,99,235,.25)]"
              />
            </div>
            <SelectInput
              options={[{ value: 'All', label: 'All statuses' }, ...STATUS_ORDER.map((s) => ({ value: s, label: s }))]}
              value={tab}
              onChange={(e) => { setTab(e.target.value as 'All' | TenderStatus); setPage(1); }}
              className="h-9 w-[170px]"
            />
            <Btn variant="secondary" onClick={() => exportCsv(filtered, state, `tender-register-${TODAY}.csv`)}>
              <Download size={15} /> Export CSV
            </Btn>
            <Btn onClick={() => { setEditTender(null); setDrawerOpen(true); }}>
              <Plus size={15} /> New Tender
            </Btn>
          </>
        }
      />

      {/* Stat chips */}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {chips.map((c, i) => (
          <motion.div
            key={c.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.05, ease: 'easeOut' }}
            whileHover={{ y: -2 }}
          >
            <StatChip
              icon={c.icon}
              label={c.label}
              variant={c.variant}
              value={
                typeof c.value === 'number' ? (
                  <CountUp value={c.value} format={(n) => (c.money ? formatKESCompact(n) : String(Math.round(n)))} />
                ) : (
                  c.value
                )
              }
            />
          </motion.div>
        ))}
      </div>

      {/* Status filter tabs */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {(['All', ...STATUS_ORDER] as Array<'All' | TenderStatus>).map((s) => {
          const active = tab === s;
          const count = s === 'All' ? state.tenders.length : counts[s];
          return (
            <button
              key={s}
              onClick={() => { setTab(s); setPage(1); }}
              className={cn(
                'relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors',
                active ? (s === 'All' ? 'bg-[#E4EBF4] text-navy-800' : STATUS_TAB_BG[s]) : 'text-app-slate hover:bg-white',
              )}
            >
              {active && (
                <motion.span
                  layoutId="tender-tab-pill"
                  className="absolute inset-0 rounded-full ring-1 ring-inset ring-current opacity-20"
                  transition={{ type: 'spring', duration: 0.22 }}
                />
              )}
              {s !== 'All' && <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[s])} />}
              {s}
              <span className="rounded-full bg-white/70 px-1.5 text-[11px] font-semibold tnum">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-app-border bg-app-card shadow-card">
        {pageRows.length === 0 ? (
          <EmptyState
            title={tab === 'All' ? 'No tenders match your search' : `No ${tab.toLowerCase()} tenders`}
            hint={tab === 'All' ? 'Try a different search term or status filter.' : 'Tenders move here as their status changes.'}
            action={
              <Btn onClick={() => { setEditTender(null); setDrawerOpen(true); }}>
                <Plus size={15} /> New Tender
              </Btn>
            }
          />
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-[#F8FAFC] text-left">
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={toggleSelectPage}
                    className="h-4 w-4 cursor-pointer accent-action"
                    aria-label="Select page"
                  />
                </th>
                <Th label="Tender No" />
                <Th label="Name" />
                <Th label="Client" />
                <Th label="Category" />
                <Th label="Closing Date" sortable active={sort.key === 'deadline'} dir={sort.dir} onClick={() => toggleSort('deadline')} />
                <Th label="Value" sortable active={sort.key === 'value'} dir={sort.dir} onClick={() => toggleSort('value')} className="text-right" />
                <Th label="Win Prob." sortable active={sort.key === 'winProb'} dir={sort.dir} onClick={() => toggleSort('winProb')} />
                <Th label="Status" />
                <Th label="Officer" />
                <th className="w-12 px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {pageRows.map((t, i) => {
                const officer = employeeById(officerIdOf(t.id, extras));
                const cat = categoryClass(t.category);
                return (
                  <motion.tr
                    key={t.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, delay: i * 0.02 }}
                    onClick={() => navigate(`/tenders/${t.id}`)}
                    className={cn(
                      'group cursor-pointer border-t border-[#EEF1F5] transition-colors hover:bg-[#F8FAFC]',
                      t.status === 'Won' && 'hover:bg-success-soft/40',
                      t.status === 'Lost' && 'opacity-75',
                    )}
                  >
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(t.id)}
                        onChange={() => toggleSelect(t.id)}
                        className="h-4 w-4 cursor-pointer accent-action"
                        aria-label={`Select ${t.refNo}`}
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-xs font-medium text-navy-800">{t.refNo}</td>
                    <td className="max-w-[280px] px-3 py-3">
                      <div className="truncate text-sm font-semibold text-app-ink">{t.title}</div>
                      <div className="truncate text-xs text-app-muted">{clientName(t.clientId)}</div>
                    </td>
                    <td className="max-w-[180px] truncate px-3 py-3 text-sm text-app-slate">{clientName(t.clientId)}</td>
                    <td className="px-3 py-3">
                      <span
                        title={t.category}
                        className={cn('inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold', CATEGORY_CHIP[cat])}
                      >
                        {cat}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3"><ClosingCell tender={t} /></td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-sm font-medium text-app-ink tnum">
                      {formatKES(t.value)}
                    </td>
                    <td className="px-3 py-3"><WinProbBar value={winProbabilityOf(t.id, t.status)} /></td>
                    <td className="px-3 py-3"><Pill status={t.status} /></td>
                    <td className="px-3 py-3">
                      {officer ? (
                        <div className="flex items-center gap-2">
                          <Avatar name={officer.name} size={26} />
                          <span className="whitespace-nowrap text-[13px] text-app-slate">{officer.name}</span>
                        </div>
                      ) : (
                        <span className="text-[13px] text-app-muted">Unassigned</span>
                      )}
                    </td>
                    <td className="relative px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => navigate(`/tenders/${t.id}`)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-app-muted opacity-0 transition hover:bg-app-bg hover:text-action group-hover:opacity-100"
                          title="Open full page"
                        >
                          <ChevronRight size={15} />
                        </button>
                        <button
                          onClick={() => setMenuFor(menuFor === t.id ? null : t.id)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-app-muted hover:bg-app-bg hover:text-app-ink"
                          aria-label="Row actions"
                        >
                          <MoreHorizontal size={15} />
                        </button>
                      </div>
                      {menuFor === t.id && (
                        <div
                          className="absolute right-3 top-11 z-20 w-44 rounded-xl border border-app-border bg-white p-1 shadow-card-hover"
                          onMouseLeave={() => setMenuFor(null)}
                        >
                          <MenuItem label="Open detail" onClick={() => navigate(`/tenders/${t.id}`)} />
                          <MenuItem label="Edit" onClick={() => openEdit(t)} />
                          <MenuItem label="Duplicate" onClick={() => duplicateTender(t)} />
                          <MenuItem label="Delete" danger onClick={() => { setDeleteTender(t); setMenuFor(null); }} />
                        </div>
                      )}
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* footer / pagination */}
        {pageRows.length > 0 && (
          <div className="flex items-center justify-between border-t border-app-border px-4 py-3">
            <span className="text-xs text-app-muted tnum">{filtered.length} results</span>
            <div className="flex items-center gap-2">
              <Btn variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Btn>
              <span className="text-xs text-app-slate tnum">Page {page} of {pageCount}</span>
              <Btn variant="secondary" size="sm" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>Next</Btn>
            </div>
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-app-border bg-white px-4 py-2.5 shadow-card-hover"
          >
            <span className="mr-1 text-[13px] font-semibold text-app-ink tnum">{selected.size} selected</span>
            <Btn variant="secondary" size="sm" onClick={() => { setAssignOfficer(''); setAssignOpen(true); }}>
              <UserPlus size={14} /> Assign officer
            </Btn>
            <Btn
              variant="secondary" size="sm"
              onClick={() => exportCsv(state.tenders.filter((t) => selected.has(t.id)), state, `tenders-selected-${TODAY}.csv`)}
            >
              <Download size={14} /> Export
            </Btn>
            <Btn variant="danger-ghost" size="sm" onClick={() => setArchiveOpen(true)}>
              <Archive size={14} /> Archive
            </Btn>
            <button
              onClick={() => setSelected(new Set())}
              className="ml-1 text-xs font-medium text-app-muted hover:text-app-ink"
            >
              Clear
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* drawer + dialogs */}
      <TenderFormDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        tender={editTender}
        onSaved={(id, runEligibility) => {
          if (runEligibility) navigate(`/eligibility?tender=${id}`);
        }}
      />

      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title="Assign officer"
        footer={
          <>
            <Btn variant="secondary" onClick={() => setAssignOpen(false)}>Cancel</Btn>
            <Btn onClick={applyAssign} disabled={!assignOfficer}>Assign</Btn>
          </>
        }
      >
        <Field label={`Officer for ${selected.size} selected tender(s)`}>
          <SelectInput
            options={[
              { value: '', label: 'Select an employee…' },
              ...state.employees.map((e) => ({ value: e.id, label: `${e.name} — ${e.role}` })),
            ]}
            value={assignOfficer}
            onChange={(e) => setAssignOfficer(e.target.value)}
          />
        </Field>
      </Modal>

      <ConfirmDialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onConfirm={applyArchive}
        title="Archive selected tenders?"
        message={`${selected.size} tender(s) will be marked Cancelled and leave the active pipeline. You can restore them later from the register.`}
        confirmLabel="Archive"
        destructive
      />

      <ConfirmDialog
        open={deleteTender != null}
        onClose={() => setDeleteTender(null)}
        onConfirm={() => {
          if (deleteTender) {
            removeItem('tenders', deleteTender.id, {
              entityRef: deleteTender.refNo,
              details: `Deleted tender — ${deleteTender.refNo} (${deleteTender.title})`,
              verb: 'Deleted', verbColor: 'red',
            });
          }
        }}
        title="Delete tender?"
        message={deleteTender ? `${deleteTender.refNo} — ${deleteTender.title} will be permanently removed from the register.` : ''}
        confirmLabel="Delete"
        destructive
      />
    </PageEnter>
  );
}

/* ---------------- small bits ---------------- */

function Th({
  label, sortable, active, dir, onClick, className,
}: {
  label: string;
  sortable?: boolean;
  active?: boolean;
  dir?: 1 | -1;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <th className={cn('whitespace-nowrap px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-app-muted', className)}>
      {sortable ? (
        <button onClick={onClick} className="inline-flex items-center gap-1 hover:text-app-ink">
          {label}
          <ChevronUp
            size={12}
            className={cn('transition-transform duration-200', active ? 'text-action' : 'text-app-border', active && dir === -1 && 'rotate-180')}
          />
        </button>
      ) : (
        label
      )}
    </th>
  );
}

function MenuItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full rounded-lg px-3 py-2 text-left text-[13px] transition hover:bg-app-bg',
        danger ? 'text-danger' : 'text-app-ink',
      )}
    >
      {label}
    </button>
  );
}
