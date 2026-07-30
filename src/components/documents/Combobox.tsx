/**
 * Searchable combobox used by the documents feature (client / supplier /
 * tender / product / invoice pickers). Page-local per scope rules.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ComboOption {
  value: string;
  label: string;
  caption?: string;
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  disabled,
  allowClear,
  className,
}: {
  options: ComboOption[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.caption ?? '').toLowerCase().includes(q),
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setQuery('');
          setOpen((v) => !v);
        }}
        className={cn(
          'flex h-[38px] w-full items-center justify-between gap-2 rounded-lg border border-app-border bg-white px-3 text-left text-sm outline-none transition',
          'focus:border-action focus:ring-2 focus:ring-[rgba(37,99,235,.25)]',
          disabled && 'cursor-not-allowed bg-app-bg text-app-muted',
          !disabled && 'text-app-ink',
        )}
      >
        <span className={cn('min-w-0 flex-1 truncate', !selected && 'text-app-muted')}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={15} className="shrink-0 text-app-muted" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 right-0 top-[42px] z-30 origin-top overflow-hidden rounded-xl border border-app-border bg-white shadow-card-hover"
          >
            <div className="flex items-center gap-2 border-b border-app-border px-3 py-2">
              <Search size={14} className="shrink-0 text-app-muted" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-7 w-full bg-transparent text-sm text-app-ink outline-none placeholder:text-app-muted"
              />
            </div>
            <div className="max-h-56 overflow-y-auto p-1">
              {allowClear && value && (
                <button
                  type="button"
                  onClick={() => {
                    onChange('');
                    setOpen(false);
                  }}
                  className="w-full rounded-lg px-3 py-2 text-left text-[13px] font-medium text-app-slate hover:bg-app-bg"
                >
                  Clear selection
                </button>
              )}
              {filtered.length === 0 && (
                <div className="px-3 py-4 text-center text-[13px] text-app-muted">No matches found.</div>
              )}
              {filtered.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left hover:bg-app-bg',
                    o.value === value && 'bg-info-soft/60',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-app-ink">{o.label}</span>
                    {o.caption && <span className="block truncate text-xs text-app-muted">{o.caption}</span>}
                  </span>
                  {o.value === value && <Check size={15} className="mt-0.5 shrink-0 text-action" />}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
