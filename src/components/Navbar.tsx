import { useMemo, useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Bell, ChevronRight, Search, Settings, User, LogOut } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { getNeedsAttention, useStore, type AttentionItem } from '@/lib/store';
import CommandPalette from '@/components/intelligence/CommandPalette';
import { Pill, type Tone } from '@/components/shared';
import { useAuth } from '@/hooks/useAuth';
import { LOGIN_PATH } from '@/const';

const CRUMB_LABEL: Record<string, string> = {
  '': 'Dashboard',
  analytics: 'Analytics',
  clients: 'Clients',
  suppliers: 'Suppliers',
  products: 'Products',
  employees: 'Employees',
  'bulk-upload': 'Bulk Upload Centre',
  tenders: 'Tender Register',
  eligibility: 'Eligibility Checker',
  'bid-decision': 'Bid / No-Bid',
  estimation: 'Cost Estimation & BOQ',
  documents: 'Document Center',
  dms: 'Business Documents',
  'doc-tracker': 'Document Tracker',
  payments: 'Payments',
  deadlines: 'Deadlines',
  bonds: 'Bid Bonds',
  contracts: 'Contracts & Milestones',
  risks: 'Risks',
  approvals: 'Approvals',
  crm: 'CRM Log',
  reports: 'Reports',
  search: 'Search',
  audit: 'Audit Trail',
  profile: 'Company Profile',
  users: 'Users & Roles',
  settings: 'Settings',
  new: 'New',
};

const LEVEL_TONE: Record<AttentionItem['level'], Tone> = {
  expired: 'red',
  critical: 'red',
  warning: 'amber',
  pending: 'amber',
};
const LEVEL_LABEL: Record<AttentionItem['level'], string> = {
  expired: 'Expired',
  critical: 'Critical',
  warning: 'Warning',
  pending: 'Pending',
};

function useClickOutside(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [onOutside]);
  return ref;
}

/** Topbar: breadcrumb left; global search (⌘K), bell + user chip right. */
export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = useStore();
  const [bellOpen, setBellOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const bellRef = useClickOutside(() => setBellOpen(false));
  const userRef = useClickOutside(() => setUserOpen(false));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const attention = useMemo(() => getNeedsAttention(state), [state]);
  const { user: authUser, isAuthenticated, isLoading: authLoading, logout } = useAuth();

  const initials = (authUser?.name ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || 'U';

  const segments = location.pathname.split('/').filter(Boolean);
  const crumbs = ['Home', ...segments.map((s, i) => CRUMB_LABEL[s] ?? (i > 0 ? s : s))];

  return (
    <header className="sticky top-0 z-40 flex h-[60px] items-center justify-between border-b border-app-border bg-white px-7">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[13px]">
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight size={13} className="text-app-muted" />}
            {i < crumbs.length - 1 ? (
              <Link to={i === 0 ? '/' : `/${segments.slice(0, i).join('/')}`} className="text-app-slate hover:text-action">
                {c}
              </Link>
            ) : (
              <span className="font-semibold text-app-ink">{c}</span>
            )}
          </span>
        ))}
      </nav>

      {/* Right cluster */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setPaletteOpen(true)}
          className="flex h-9 items-center gap-2 rounded-lg border border-app-border bg-app-bg px-3 text-[13px] text-app-muted transition hover:border-action hover:text-app-slate"
        >
          <Search size={15} />
          <span>Search…</span>
          <kbd className="rounded border border-app-border bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-app-slate">⌘K</kbd>
        </button>

        {/* Bell */}
        <div className="relative" ref={bellRef}>
          <button
            onClick={() => setBellOpen((v) => !v)}
            className="relative flex h-9 w-9 items-center justify-center rounded-lg text-app-slate transition hover:bg-app-bg"
            aria-label="Notifications"
          >
            <Bell size={17} />
            {attention.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white tnum">
                {attention.length}
              </span>
            )}
          </button>
          <AnimatePresence>
            {bellOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-11 w-[380px] origin-top rounded-xl border border-app-border bg-white shadow-card-hover"
              >
                <div className="border-b border-app-border px-4 py-3 text-[13px] font-semibold text-app-ink">
                  Needs Attention <span className="ml-1 text-app-muted tnum">({attention.length})</span>
                </div>
                <div className="max-h-[320px] overflow-y-auto p-2">
                  {attention.slice(0, 8).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setBellOpen(false);
                        navigate(item.route);
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-app-bg"
                    >
                      <div className="min-w-0">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-app-muted">{item.kind}</div>
                        <div className="truncate text-[13px] text-app-ink">{item.label}</div>
                      </div>
                      <Pill tone={LEVEL_TONE[item.level]}>{LEVEL_LABEL[item.level]}</Pill>
                    </button>
                  ))}
                  {attention.length === 0 && (
                    <div className="px-3 py-6 text-center text-sm text-app-muted">All clear — nothing needs attention.</div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="mx-1 h-6 w-px bg-app-border" />

        {/* User chip */}
        {authLoading ? (
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5" aria-hidden>
            <span className="h-8 w-8 animate-pulse rounded-full bg-app-bg ring-1 ring-app-border" />
            <span className="hidden sm:block">
              <span className="block h-3 w-16 animate-pulse rounded bg-app-bg" />
              <span className="mt-1 block h-2.5 w-10 animate-pulse rounded bg-app-bg" />
            </span>
          </div>
        ) : !isAuthenticated ? (
          <Link
            to={LOGIN_PATH}
            className="flex h-9 items-center gap-2 rounded-lg bg-action px-4 text-[13px] font-semibold text-white transition hover:bg-action-hover"
          >
            <User size={15} />
            Sign in
          </Link>
        ) : (
        <div className="relative" ref={userRef}>
          <button
            onClick={() => setUserOpen((v) => !v)}
            className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-app-bg"
          >
            {authUser?.avatar ? (
              <img
                src={authUser.avatar}
                alt={authUser.name ?? 'User'}
                className="h-8 w-8 rounded-full object-cover ring-2 ring-gold"
              />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-800 text-[12px] font-bold text-white ring-2 ring-gold">
                {initials}
              </span>
            )}
            <span className="hidden text-left sm:block">
              <span className="block text-[13px] font-semibold leading-4 text-app-ink">{authUser?.name?.split(' ')[0] ?? 'User'}</span>
              <span className="block text-[11px] leading-4 text-app-muted">FBV</span>
            </span>
          </button>
          <AnimatePresence>
            {userOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-12 w-[200px] origin-top rounded-xl border border-app-border bg-white p-1.5 shadow-card-hover"
              >
                {[
                  { icon: <User size={15} />, label: 'Profile', onClick: () => navigate('/profile') },
                  { icon: <Settings size={15} />, label: 'Settings', onClick: () => navigate('/settings') },
                  { icon: <LogOut size={15} />, label: 'Sign out', onClick: () => logout() },
                ].map((it) => (
                  <button
                    key={it.label}
                    onClick={() => {
                      setUserOpen(false);
                      it.onClick();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-app-ink transition hover:bg-app-bg"
                  >
                    <span className="text-app-slate">{it.icon}</span>
                    {it.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        )}
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </header>
  );
}
