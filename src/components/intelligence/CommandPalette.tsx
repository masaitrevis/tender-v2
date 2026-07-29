/**
 * ⌘K Command Palette — global search overlay (640px).
 * Wired by the shell agent (topbar search button / ⌘K / `/`); this component
 * only renders when `open` and navigates with react-router.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Search, FolderOpen, Building2, Truck, Package, FileText, Banknote,
  ShieldCheck, IdCard, Zap, Clock, CornerDownLeft, Loader2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useStore } from '@/lib/store';
import { Pill, ExpiryBadge } from '@/components/shared';
import { searchAll, type SearchGroup, type SearchGroupKey, type SearchResult } from './searchEngine';
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

const RECENT_KEY = 'fbv-recent-searches';

function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}
function pushRecent(q: string) {
  const next = [q, ...loadRecent().filter((x) => x !== q)].slice(0, 5);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
}

/** Highlight the matched substring with a gold underline. */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim().toLowerCase();
  if (!q) return <>{text}</>;
  const first = q.split(/\s+/).find((t) => text.toLowerCase().includes(t));
  if (!first) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(first);
  return (
    <>
      {text.slice(0, idx)}
      <span className="underline decoration-gold decoration-2 underline-offset-2">
        {text.slice(idx, idx + first.length)}
      </span>
      {text.slice(idx + first.length)}
    </>
  );
}

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const state = useStore();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);

  /* 150ms debounce with tiny spinner */
  useEffect(() => {
    if (query === debounced) return;
    setSearching(true);
    const t = setTimeout(() => {
      setDebounced(query);
      setSearching(false);
    }, 150);
    return () => clearTimeout(t);
  }, [query, debounced]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setDebounced('');
      setActive(0);
      setRecent(loadRecent());
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const groups = useMemo(
    () => (debounced.trim() ? searchAll(state, debounced, { maxPerGroup: 6 }) : []),
    [state, debounced],
  );
  const flat = useMemo(() => groups.flatMap((g) => g.results), [groups]);

  useEffect(() => setActive(0), [debounced]);

  const pick = (r: SearchResult) => {
    if (debounced.trim()) {
      pushRecent(debounced.trim());
      setRecent(loadRecent());
    }
    onClose();
    navigate(r.route);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = flat[active];
      if (r) pick(r);
      else if (debounced.trim()) {
        const q = debounced.trim();
        pushRecent(q);
        onClose();
        navigate(`/search?q=${encodeURIComponent(q)}`);
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      /* cycle to first row of next group */
      if (!groups.length) return;
      let acc = 0;
      for (const g of groups) {
        if (active < acc + g.results.length) {
          const next = acc + g.results.length;
          setActive(next >= flat.length ? 0 : next);
          return;
        }
        acc += g.results.length;
      }
      setActive(0);
    }
  };

  let rowIndex = -1;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-[rgba(15,36,56,.45)] backdrop-blur-[2px]"
          />
          <div className="pointer-events-none fixed inset-0 z-[60] flex items-start justify-center pt-[12vh]">
            <motion.div
              initial={{ scale: 0.97, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.97, opacity: 0, transition: { duration: 0.12 } }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className="pointer-events-auto w-[640px] max-w-[94vw] overflow-hidden rounded-2xl bg-white shadow-2xl"
            >
              {/* Input row */}
              <div className="flex items-center gap-3 border-b border-app-border px-5">
                {searching ? (
                  <Loader2 size={18} className="shrink-0 animate-spin text-action" />
                ) : (
                  <Search size={18} className="shrink-0 text-app-muted" />
                )}
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Search anything — tenders, clients, documents, invoices…"
                  className="h-14 w-full bg-transparent text-[15px] text-app-ink outline-none placeholder:text-app-muted"
                />
                <kbd className="shrink-0 rounded-md border border-app-border bg-app-bg px-1.5 py-0.5 text-[10px] font-semibold uppercase text-app-muted">
                  esc
                </kbd>
              </div>

              <div className="max-h-[54vh] overflow-y-auto p-2">
                {/* Recent searches when empty */}
                {!debounced.trim() && (
                  <div className="p-2">
                    {recent.length > 0 ? (
                      <>
                        <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-app-muted">
                          Recent searches
                        </div>
                        {recent.map((r) => (
                          <button
                            key={r}
                            onClick={() => setQuery(r)}
                            className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm text-app-ink hover:bg-app-bg"
                          >
                            <Clock size={15} className="text-app-muted" />
                            {r}
                          </button>
                        ))}
                      </>
                    ) : (
                      <div className="px-2 py-6 text-center text-sm text-app-muted">
                        Type to search across tenders, clients, documents, invoices and more.
                      </div>
                    )}
                  </div>
                )}

                {/* Grouped results */}
                {debounced.trim() && groups.length > 0 && (
                  <div>
                    {groups.map((g) => (
                      <PaletteGroup key={g.key} group={g} query={debounced}>
                        {g.results.map((r) => {
                          rowIndex += 1;
                          const idx = rowIndex;
                          const isActive = idx === active;
                          return (
                            <button
                              key={r.id}
                              onMouseEnter={() => setActive(idx)}
                              onClick={() => pick(r)}
                              className={cn(
                                'relative flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors',
                                isActive && 'bg-info-soft/60',
                              )}
                            >
                              {isActive && (
                                <motion.span
                                  layoutId="palette-active"
                                  className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r bg-action"
                                />
                              )}
                              <span
                                className={cn(
                                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                                  r.group === 'actions' ? 'bg-gold-soft text-gold' : 'bg-app-bg text-navy-800',
                                )}
                              >
                                {(() => {
                                  const Icon = GROUP_ICON[r.group];
                                  return <Icon size={15} />;
                                })()}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-app-ink">
                                  {r.ref && (
                                    <span className="mr-2 font-mono text-xs font-medium text-navy-800">{r.ref}</span>
                                  )}
                                  <Highlight text={r.title} query={debounced} />
                                </span>
                                <span className="block truncate text-xs text-app-muted">{r.caption}</span>
                              </span>
                              <span className="flex shrink-0 items-center gap-2">
                                {r.group === 'dms' && r.hint?.startsWith('exp ') ? (
                                  <ExpiryBadge date={r.hint.slice(4)} showDays={false} />
                                ) : r.hintTone ? (
                                  <Pill status={r.hintTone}>{r.hint}</Pill>
                                ) : r.hint ? (
                                  <span className="text-xs font-medium text-app-slate tnum">{r.hint}</span>
                                ) : null}
                                {isActive && <CornerDownLeft size={14} className="text-app-muted" />}
                              </span>
                            </button>
                          );
                        })}
                      </PaletteGroup>
                    ))}
                  </div>
                )}

                {/* No results */}
                {debounced.trim() && groups.length === 0 && (
                  <div className="flex flex-col items-center px-6 py-10 text-center">
                    <img src="/empty-box.svg" alt="" className="h-[120px] w-auto opacity-90" />
                    <p className="mt-4 text-sm font-medium text-app-ink">
                      No results for &lsquo;{debounced}&rsquo;
                    </p>
                    <p className="mt-1 text-xs text-app-muted">Try a different keyword, or jump to an action:</p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      {[
                        { label: 'New Tender', route: '/tenders' },
                        { label: 'Record Payment', route: '/payments' },
                        { label: 'Bulk Upload Centre', route: '/bulk-upload' },
                      ].map((a) => (
                        <button
                          key={a.label}
                          onClick={() => {
                            onClose();
                            navigate(a.route);
                          }}
                          className="rounded-lg border border-app-border bg-white px-3 py-1.5 text-xs font-semibold text-app-ink transition hover:-translate-y-px hover:shadow-card"
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer hints */}
              <div className="flex items-center gap-4 border-t border-app-border px-5 py-2.5 text-[11px] text-app-muted">
                <span className="flex items-center gap-1">
                  <kbd className="rounded border border-app-border bg-app-bg px-1">↑↓</kbd> navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="rounded border border-app-border bg-app-bg px-1">↵</kbd> open
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="rounded border border-app-border bg-app-bg px-1">Tab</kbd> next group
                </span>
                <span className="ml-auto">FBV Global Search</span>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function PaletteGroup({
  group,
  children,
}: {
  group: SearchGroup;
  query: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-1">
      <div
        className={cn(
          'px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.1em]',
          group.key === 'actions' ? 'text-gold' : 'text-app-muted',
        )}
      >
        {group.label}
      </div>
      <motion.div
        initial="initial"
        animate="animate"
        variants={{ animate: { transition: { staggerChildren: 0.02 } } }}
      >
        {children}
      </motion.div>
    </div>
  );
}
