/**
 * Global Search page — /search?q=
 * Big live input, left filter rail (entity checkboxes with counts + date
 * filter) and grouped result sections with rich cards.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Search, FolderOpen, Building2, Truck, Package, FileText, Banknote,
  ShieldCheck, IdCard, Zap, CornerDownLeft,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useStore } from '@/lib/store';
import { PageHeader, Pill, ExpiryBadge, EmptyState } from '@/components/shared';
import { searchAll, groupCounts, GROUP_META, type SearchGroupKey, type SearchResult } from '@/components/intelligence/searchEngine';
import { cn } from '@/lib/utils';

const GROUP_ICON: Record<SearchGroupKey, LucideIcon> = {
  tenders: FolderOpen,
  clients: Building2,
  suppliers: Truck,
  products: Package,
  documents: FileText,
  invoices: Banknote,
  dms: ShieldCheck,
  employees: IdCard,
  actions: Zap,
};

const ALL_GROUPS = Object.keys(GROUP_META) as SearchGroupKey[];

/** Highlight matched substring with gold underline. */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim().toLowerCase();
  if (!q) return <>{text}</>;
  const first = q.split(/\s+/).find((t) => text.toLowerCase().includes(t));
  if (!first) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(first);
  return (
    <>
      {text.slice(0, idx)}
      <span className="underline decoration-gold decoration-2 underline-offset-2">{text.slice(idx, idx + first.length)}</span>
      {text.slice(idx + first.length)}
    </>
  );
}

export default function SearchPage() {
  const state = useStore();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const urlQ = params.get('q') ?? '';
  const [query, setQuery] = useState(urlQ);
  const [enabled, setEnabled] = useState<SearchGroupKey[]>(ALL_GROUPS);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  /* keep URL in sync (live search) */
  useEffect(() => {
    const t = setTimeout(() => {
      setParams(query ? { q: query } : {}, { replace: true });
    }, 200);
    return () => clearTimeout(t);
  }, [query, setParams]);

  /* external ?q= changes (e.g. from palette) */
  useEffect(() => {
    if (urlQ !== query) setQuery(urlQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQ]);

  const counts = useMemo(() => groupCounts(state, query), [state, query]);
  const groups = useMemo(
    () => (query.trim() ? searchAll(state, query, { groups: enabled, maxPerGroup: 50, from: from || undefined, to: to || undefined }) : []),
    [state, query, enabled, from, to],
  );
  const total = groups.reduce((a, g) => a + g.results.length, 0);

  const toggleGroup = (k: SearchGroupKey) =>
    setEnabled((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));

  return (
    <div className="px-7 pb-8 pt-6">
      <PageHeader title="Search" subtitle="Instant search across every record in the system." />

      {/* Big live input */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="mb-6 flex items-center gap-3 rounded-xl border border-app-border bg-white px-5 shadow-card focus-within:border-action focus-within:ring-2 focus-within:ring-[rgba(37,99,235,.25)]"
      >
        <Search size={20} className="shrink-0 text-app-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search anything — tenders, clients, documents, invoices…"
          autoFocus
          className="h-14 w-full bg-transparent text-[16px] text-app-ink outline-none placeholder:text-app-muted"
        />
        {query.trim() && (
          <span className="shrink-0 rounded-full bg-grey-soft px-2.5 py-1 text-[11px] font-semibold text-grey tnum">
            {total} result{total === 1 ? '' : 's'}
          </span>
        )}
      </motion.div>

      <div className="flex items-start gap-6">
        {/* Filter rail */}
        <motion.aside
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut', delay: 0.05 }}
          className="w-[220px] shrink-0 rounded-xl border border-app-border bg-app-card p-4 shadow-card"
        >
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-app-slate">Entity</div>
          <div className="space-y-1">
            {ALL_GROUPS.map((k) => {
              const Icon = GROUP_ICON[k];
              const on = enabled.includes(k);
              return (
                <label key={k} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-app-ink hover:bg-app-bg">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleGroup(k)}
                    className="h-4 w-4 rounded border-app-border accent-[#2563EB]"
                  />
                  <Icon size={15} className={cn(k === 'actions' ? 'text-gold' : 'text-app-muted')} />
                  <span className="flex-1 truncate text-[13px]">{GROUP_META[k].label}</span>
                  <span className="text-xs text-app-muted tnum">{counts[k]}</span>
                </label>
              );
            })}
          </div>
          <div className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-[0.06em] text-app-slate">Date</div>
          <div className="space-y-2 px-2">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-full rounded-lg border border-app-border bg-white px-2 text-xs text-app-ink outline-none tnum focus:border-action" aria-label="From date" />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-full rounded-lg border border-app-border bg-white px-2 text-xs text-app-ink outline-none tnum focus:border-action" aria-label="To date" />
            {(from || to) && (
              <button onClick={() => { setFrom(''); setTo(''); }} className="text-xs font-semibold text-action hover:text-action-hover">
                Clear dates
              </button>
            )}
          </div>
        </motion.aside>

        {/* Results */}
        <div className="min-w-0 flex-1">
          {!query.trim() ? (
            <EmptyState
              title="Start typing to search"
              hint="Results appear instantly across tenders, clients, suppliers, products, documents, invoices, business documents and employees."
            />
          ) : groups.length === 0 ? (
            <EmptyState
              title={`No results for ‘${query}’`}
              hint="Try a different keyword, widen the entity filters or clear the date range."
              action={
                <div className="flex gap-2">
                  {[
                    { label: 'New Tender', route: '/tenders' },
                    { label: 'Record Payment', route: '/payments' },
                    { label: 'Bulk Upload Centre', route: '/bulk-upload' },
                  ].map((a) => (
                    <button
                      key={a.label}
                      onClick={() => navigate(a.route)}
                      className="rounded-lg border border-app-border bg-white px-3 py-1.5 text-xs font-semibold text-app-ink transition hover:-translate-y-px hover:shadow-card"
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              }
            />
          ) : (
            groups.map((g, gi) => {
              const Icon = GROUP_ICON[g.key];
              return (
                <motion.section
                  key={g.key}
                  layout="position"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, ease: 'easeOut', delay: gi * 0.05 }}
                  className="mb-5"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <Icon size={15} className={cn(g.key === 'actions' ? 'text-gold' : 'text-app-muted')} />
                    <h2 className={cn('text-[10px] font-semibold uppercase tracking-[0.1em]', g.key === 'actions' ? 'text-gold' : 'text-app-muted')}>
                      {g.label}
                    </h2>
                    <span className="text-xs text-app-muted tnum">{g.results.length}</span>
                  </div>
                  <div className="space-y-2">
                    {g.results.map((r) => (
                      <ResultCard key={r.id} result={r} query={query} onOpen={() => navigate(r.route)} />
                    ))}
                  </div>
                </motion.section>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function ResultCard({ result: r, query, onOpen }: { result: SearchResult; query: string; onOpen: () => void }) {
  const Icon = GROUP_ICON[r.group];
  return (
    <motion.button
      layout="position"
      transition={{ duration: 0.2 }}
      onClick={onOpen}
      className="group flex w-full items-start gap-3 rounded-xl border border-app-border bg-app-card p-4 text-left shadow-card transition-all duration-150 hover:-translate-y-0.5 hover:shadow-card-hover"
    >
      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', r.group === 'actions' ? 'bg-gold-soft text-gold' : 'bg-app-bg text-navy-800')}>
        <Icon size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-app-ink">
          {r.ref && <span className="mr-2 font-mono text-xs font-medium text-navy-800">{r.ref}</span>}
          <Highlight text={r.title} query={query} />
        </span>
        <span className="mt-0.5 block truncate text-[13px] text-app-slate">{r.caption}</span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {r.hintTone && <Pill status={r.hintTone}>{r.hint}</Pill>}
          {!r.hintTone && r.hint && r.group === 'dms' && r.hint.startsWith('exp ') && <ExpiryBadge date={r.hint.slice(4)} showDays={false} />}
          {!r.hintTone && r.hint && !(r.group === 'dms' && r.hint.startsWith('exp ')) && (
            <span className="rounded-full bg-grey-soft px-2.5 py-1 text-[11px] font-semibold text-grey tnum">{r.hint}</span>
          )}
          {r.date && (
            <span className="rounded-full bg-app-bg px-2.5 py-1 text-[11px] font-medium text-app-muted tnum">{r.date.slice(0, 10)}</span>
          )}
        </span>
        <span className="mt-1.5 block text-[11px] text-app-muted">{r.breadcrumb}</span>
      </span>
      <CornerDownLeft size={15} className="mt-1 shrink-0 text-app-muted opacity-0 transition-opacity group-hover:opacity-100" />
    </motion.button>
  );
}
