import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard, BarChart3, Building2, Truck, Package, IdCard, FileSpreadsheet,
  FolderKanban, ClipboardCheck, Scale, Calculator, FileText, ShieldCheck, FileSearch,
  Banknote, CalendarClock, Landmark, FileSignature, AlertTriangle, CheckSquare,
  MessageSquare, FileBarChart, Search, ScrollText, Building, Users, Settings,
  ChevronsLeft, ChevronsRight, LogOut,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Navbar from './Navbar';
import Footer from './Footer';
import { NewPill } from '@/components/shared';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { LOGIN_PATH } from '@/const';
import { syncStore } from '@/lib/store';

interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  isNew?: boolean;
}
interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard', to: '/', icon: LayoutDashboard },
      { label: 'Analytics', to: '/analytics', icon: BarChart3 },
    ],
  },
  {
    label: 'Master Data',
    items: [
      { label: 'Clients', to: '/clients', icon: Building2 },
      { label: 'Suppliers', to: '/suppliers', icon: Truck },
      { label: 'Products', to: '/products', icon: Package },
      { label: 'Employees', to: '/employees', icon: IdCard },
      { label: 'Bulk Upload Centre', to: '/bulk-upload', icon: FileSpreadsheet, isNew: true },
    ],
  },
  {
    label: 'Tenders',
    items: [
      { label: 'Tender Register', to: '/tenders', icon: FolderKanban },
      { label: 'Eligibility Checker', to: '/eligibility', icon: ClipboardCheck },
      { label: 'Bid / No-Bid', to: '/bid-decision', icon: Scale },
      { label: 'Cost Estimation & BOQ', to: '/estimation', icon: Calculator },
    ],
  },
  {
    label: 'Documents',
    items: [
      { label: 'Document Center', to: '/documents', icon: FileText },
      { label: 'Business Documents', to: '/dms', icon: ShieldCheck, isNew: true },
      { label: 'Document Tracker', to: '/doc-tracker', icon: FileSearch },
    ],
  },
  {
    label: 'Trackers',
    items: [
      { label: 'Payments', to: '/payments', icon: Banknote },
      { label: 'Deadlines', to: '/deadlines', icon: CalendarClock },
      { label: 'Bid Bonds', to: '/bonds', icon: Landmark },
      { label: 'Contracts & Milestones', to: '/contracts', icon: FileSignature },
      { label: 'Risks', to: '/risks', icon: AlertTriangle },
      { label: 'Approvals', to: '/approvals', icon: CheckSquare },
      { label: 'CRM Log', to: '/crm', icon: MessageSquare },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { label: 'Reports', to: '/reports', icon: FileBarChart },
      { label: 'Search', to: '/search', icon: Search },
      { label: 'Audit Trail', to: '/audit', icon: ScrollText },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Company Profile', to: '/profile', icon: Building },
      { label: 'Users & Roles', to: '/users', icon: Users },
      { label: 'Settings', to: '/settings', icon: Settings },
    ],
  },
];

/** AppShell: dark navy sidebar (sticky, in normal flow) + topbar + outlet scroll region + footer. */
export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const { isAuthenticated, isLoading, logout } = useAuth({
    redirectOnUnauthenticated: true,
    redirectPath: LOGIN_PATH,
  });

  // Hydrate the server-synced store only once authenticated (avoids
  // UNAUTHORIZED noise on the login screen).
  useEffect(() => {
    if (isAuthenticated) syncStore();
  }, [isAuthenticated]);

  if (isLoading || !isAuthenticated) return null; // redirect handled by useAuth

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-app-bg">
      {/* Sidebar */}
      <aside
        className={cn(
          'sticky top-0 flex h-full shrink-0 flex-col bg-navy-950 transition-[width] duration-200',
          collapsed ? 'w-[68px]' : 'w-[248px]',
        )}
      >
        {/* Brand block */}
        <div className="flex h-[68px] items-center gap-3 border-b border-white/10 px-4">
          <img src="/logo.svg" alt="FBV" className="h-9 w-9 shrink-0 rounded-lg" />
          {!collapsed && (
            <div className="leading-tight">
              <div className="text-[13px] font-semibold text-white">Future Bright</div>
              <div className="text-[10px] font-bold tracking-[0.18em] text-gold">VENTURES LTD</div>
            </div>
          )}
        </div>

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {NAV.map((group) => (
            <div key={group.label} className="mb-4">
              {!collapsed && (
                <div className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">
                  {group.label}
                </div>
              )}
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    cn(
                      'relative mb-0.5 flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-white/75 transition-colors hover:bg-white/[.06] hover:text-white',
                      isActive && 'bg-[rgba(37,99,235,.18)] text-white',
                      collapsed && 'justify-center px-0',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-action" />}
                      <item.icon size={18} className="shrink-0" />
                      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                      {!collapsed && item.isNew && <NewPill />}
                      {collapsed && item.isNew && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-gold" />}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* Bottom: collapse + sign out */}
        <div className="border-t border-white/10 p-3">
          <button
            onClick={() => logout()}
            className={cn(
              'mb-1 flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-white/75 transition-colors hover:bg-white/[.06] hover:text-white',
              collapsed && 'justify-center px-0',
            )}
            title="Sign out"
          >
            <LogOut size={18} />
            {!collapsed && <span>Sign out</span>}
          </button>
          <button
            onClick={() => setCollapsed((v) => !v)}
            className={cn(
              'flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-white/45 transition-colors hover:bg-white/[.06] hover:text-white',
              collapsed && 'justify-center px-0',
            )}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* Main column: topbar + scrollable outlet + footer */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar />
        <main className="flex-1 overflow-y-auto">
          <div className="min-h-full">
            <Outlet />
          </div>
          <Footer />
        </main>
      </div>
    </div>
  );
}
