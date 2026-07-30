/**
 * Users & Roles — /users
 * User list (invite/edit drawer) + role permission matrix
 * (View/Edit/Approve/Print/Export/Delete-style capabilities per module).
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Users as UsersIcon, ShieldCheck, UserCheck, Clock, Plus, MoreHorizontal,
  Check, Minus, Star, Crown, Briefcase, PenLine, Eye, KeyRound, Ban, IdCard,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  useStore, addItem, updateItem, logActivity, uid, type User,
} from '@/lib/store';
import { PageHeader, StatChip, Pill, Drawer, TextInput, SelectInput, Toggle, Field, NewPill } from '@/components/shared';
import type { Tone } from '@/components/shared';
import { cn } from '@/lib/utils';

type RoleName = 'Admin' | 'Manager' | 'Officer' | 'Viewer';
const ROLE_ORDER: RoleName[] = ['Admin', 'Manager', 'Officer', 'Viewer'];

const ROLE_TONE: Record<string, Tone> = {
  Admin: 'navy',
  Manager: 'blue',
  Officer: 'gold',
  Finance: 'green',
  Viewer: 'grey',
};

const ROLE_META: Record<RoleName, { icon: LucideIcon; summary: string }> = {
  Admin: { icon: Crown, summary: 'full access incl. settings & users' },
  Manager: { icon: Briefcase, summary: 'approve, edit, import' },
  Officer: { icon: PenLine, summary: 'create & edit own records' },
  Viewer: { icon: Eye, summary: 'read only' },
};

/* Permission matrix (design settings.md §2) — gold-star rows are v2.0 */
interface Capability {
  key: string;
  label: string;
  isNew?: boolean;
  defaults: Record<RoleName, boolean>;
}
const CAPABILITIES: Capability[] = [
  { key: 'view-dashboards', label: 'View dashboards', defaults: { Admin: true, Manager: true, Officer: true, Viewer: true } },
  { key: 'manage-masters', label: 'Manage masters', defaults: { Admin: true, Manager: true, Officer: true, Viewer: false } },
  { key: 'bulk-import', label: 'Bulk Excel import', isNew: true, defaults: { Admin: true, Manager: true, Officer: false, Viewer: false } },
  { key: 'generate-documents', label: 'Generate documents', defaults: { Admin: true, Manager: true, Officer: true, Viewer: false } },
  { key: 'approve', label: 'Approve', defaults: { Admin: true, Manager: true, Officer: false, Viewer: false } },
  { key: 'record-payments', label: 'Record payments', defaults: { Admin: true, Manager: true, Officer: true, Viewer: false } },
  { key: 'manage-dms', label: 'Manage business documents', isNew: true, defaults: { Admin: true, Manager: true, Officer: true, Viewer: false } },
  { key: 'edit-profile', label: 'Edit company profile', defaults: { Admin: true, Manager: false, Officer: false, Viewer: false } },
  { key: 'manage-users', label: 'Manage users', defaults: { Admin: true, Manager: false, Officer: false, Viewer: false } },
  { key: 'view-audit', label: 'View audit trail', defaults: { Admin: true, Manager: true, Officer: false, Viewer: false } },
];

const PERMS_KEY = 'fbv-role-perms';
type PermOverrides = Record<string, boolean>; // `${cap}:${role}` -> allowed

function loadPermOverrides(): PermOverrides {
  try {
    return JSON.parse(localStorage.getItem(PERMS_KEY) ?? '{}') as PermOverrides;
  } catch {
    return {};
  }
}
function savePermOverrides(o: PermOverrides) {
  try {
    localStorage.setItem(PERMS_KEY, JSON.stringify(o));
  } catch { /* ignore */ }
}

/** Deterministic demo "last active" caption per user. */
function lastActiveCaption(u: User): string {
  const presets = ['Today 20:04', 'Today 17:31', 'Yesterday 16:42', '27 Jul 09:15', '26 Jul 14:08'];
  const st = u.status as string;
  if (u.status !== 'Active') return st === 'Invited' ? 'Invite sent 28 Jul 10:02' : '—';
  let h = 0;
  for (const ch of u.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return presets[h % presets.length];
}

/** 'Invited' is a UI-level status; store type is EntityStatus so we cast. */
type UiStatus = 'Active' | 'Invited' | 'Inactive';
const uiStatus = (u: User): UiStatus => u.status as UiStatus;

export default function UsersPage() {
  const state = useStore();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [permOverrides, setPermOverrides] = useState<PermOverrides>(loadPermOverrides);

  const users = state.users;
  const admins = users.filter((u) => u.role === 'Admin').length;
  const active = users.filter((u) => u.status === 'Active').length;
  const invited = users.filter((u) => uiStatus(u) === 'Invited').length;

  const allowed = (cap: Capability, role: RoleName): boolean =>
    permOverrides[`${cap.key}:${role}`] ?? cap.defaults[role];

  const togglePerm = (cap: Capability, role: RoleName) => {
    const key = `${cap.key}:${role}`;
    const next = { ...permOverrides, [key]: !allowed(cap, role) };
    setPermOverrides(next);
    savePermOverrides(next);
    logActivity({
      user: state.users[0]?.name ?? 'Admin User',
      action: 'Updated', entity: 'Role Permissions', entityRef: role,
      details: `${cap.label} ${next[key] ? 'granted to' : 'revoked from'} ${role}`,
      verb: 'Updated', verbColor: 'blue',
    });
  };

  const chips = [
    { label: 'Total Users', value: users.length, icon: <UsersIcon size={18} />, variant: 'navy' as const },
    { label: 'Admins', value: admins, icon: <ShieldCheck size={18} />, variant: 'red' as const },
    { label: 'Active', value: active, icon: <UserCheck size={18} />, variant: 'green' as const },
    { label: 'Pending Invites', value: invited, icon: <Clock size={18} />, variant: 'amber' as const },
  ];

  return (
    <div className="px-7 pb-8 pt-6">
      <PageHeader
        title="Users & Roles"
        subtitle="Who can access the system and what they can do."
        actions={
          <button
            onClick={() => {
              setEditing(null);
              setDrawerOpen(true);
            }}
            className="flex h-9 items-center gap-2 rounded-lg bg-action px-4 text-[13px] font-semibold text-white transition hover:-translate-y-px hover:bg-action-hover active:scale-[.98]"
          >
            <Plus size={15} /> Invite User
          </button>
        }
      />

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {chips.map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut', delay: i * 0.05 }}>
            <StatChip icon={c.icon} label={c.label} value={c.value} variant={c.variant} />
          </motion.div>
        ))}
      </div>

      {/* Users table */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut', delay: 0.1 }}
        className="mb-6 overflow-visible rounded-xl border border-app-border bg-app-card shadow-card"
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#F8FAFC] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-app-muted">
              <th className="rounded-tl-xl px-5 py-3">User</th>
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Last Active</th>
              <th className="px-4 py-3">Status</th>
              <th className="rounded-tr-xl px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => {
              const emp = state.employees.find((e) => e.name === u.name || e.email === u.email);
              const st = uiStatus(u);
              return (
                <motion.tr
                  key={u.id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, delay: i * 0.02 }}
                  className="h-14 border-t border-[#EEF1F5] hover:bg-[#F8FAFC]"
                >
                  <td className="px-5 py-2">
                    <div className="flex items-center gap-3">
                      <span
                        className={cn('flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white', u.role === 'Admin' && 'ring-2 ring-gold ring-offset-1')}
                        style={{ backgroundColor: u.avatarColor }}
                      >
                        {u.initials}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-medium text-app-ink">{u.name}</div>
                        <div className="truncate text-xs text-app-muted">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    {emp ? (
                      <Link to="/employees" className="inline-flex items-center gap-1.5 rounded-full bg-grey-soft px-2.5 py-1 text-[11px] font-semibold text-grey transition hover:bg-[#E2E8F0]">
                        <IdCard size={11} /> {emp.code}
                      </Link>
                    ) : (
                      <span className="text-xs text-app-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <Pill tone={ROLE_TONE[u.role] ?? 'grey'}>{u.role}</Pill>
                  </td>
                  <td className="px-4 py-2 text-xs text-app-muted tnum">{lastActiveCaption(u)}</td>
                  <td className="px-4 py-2">
                    {st === 'Active' && <Pill tone="green">Active</Pill>}
                    {st === 'Invited' && <Pill tone="amber">Invited</Pill>}
                    {st === 'Inactive' && <Pill tone="grey">Disabled</Pill>}
                  </td>
                  <td className="relative px-4 py-2 text-right">
                    <button
                      onClick={() => setMenuFor(menuFor === u.id ? null : u.id)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-app-muted hover:bg-app-bg"
                      aria-label={`Actions for ${u.name}`}
                    >
                      <MoreHorizontal size={16} />
                    </button>
                    {menuFor === u.id && (
                      <div
                        className="absolute right-4 top-11 z-20 w-44 rounded-xl border border-app-border bg-white p-1 text-left shadow-card-hover"
                        onMouseLeave={() => setMenuFor(null)}
                      >
                        <button
                          onClick={() => {
                            setEditing(u);
                            setDrawerOpen(true);
                            setMenuFor(null);
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-app-ink hover:bg-app-bg"
                        >
                          <PenLine size={14} className="text-app-muted" /> Edit role
                        </button>
                        <button
                          onClick={() => {
                            logActivity({
                              user: state.users[0]?.name ?? 'Admin User',
                              action: 'Updated', entity: 'User', entityRef: u.email,
                              details: `Password reset link sent to ${u.email}`,
                              verb: 'Reset password', verbColor: 'blue',
                            });
                            setMenuFor(null);
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-app-ink hover:bg-app-bg"
                        >
                          <KeyRound size={14} className="text-app-muted" /> Reset password
                        </button>
                        <button
                          onClick={() => {
                            updateItem(
                              'users',
                              u.id,
                              { status: u.status === 'Inactive' ? 'Active' : 'Inactive' },
                              { user: state.users[0]?.name, details: `${u.status === 'Inactive' ? 'Re-enabled' : 'Disabled'} user ${u.name}` },
                            );
                            setMenuFor(null);
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-danger hover:bg-danger-soft"
                        >
                          <Ban size={14} /> {u.status === 'Inactive' ? 'Re-enable' : 'Disable'}
                        </button>
                      </div>
                    )}
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
        <div className="border-t border-[#EEF1F5] px-5 py-2.5 text-xs text-app-muted tnum">{users.length} users</div>
      </motion.div>

      {/* Role permission matrix */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut', delay: 0.15 }}
        className="rounded-xl border border-app-border bg-app-card p-5 shadow-card"
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-[15px] font-semibold text-app-ink">Role permission matrix</h3>
            <p className="mt-0.5 text-xs text-app-muted">Admins can toggle any cell — changes apply immediately.</p>
          </div>
          <ShieldCheck size={18} className="text-navy-800" />
        </div>
        <div className="overflow-x-auto rounded-lg border border-app-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#F8FAFC] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-app-muted">
                <th className="px-4 py-2.5">Capability</th>
                {ROLE_ORDER.map((r) => (
                  <th key={r} className="px-4 py-2.5 text-center">
                    <Pill tone={ROLE_TONE[r]}>{r}</Pill>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CAPABILITIES.map((cap, ri) => (
                <tr key={cap.key} className={cn('border-t border-[#EEF1F5]', cap.isNew && 'bg-gold-soft/60')}>
                  <td className="px-4 py-2.5 font-medium text-app-ink">
                    <span className="flex items-center gap-2">
                      {cap.label}
                      {cap.isNew && (
                        <span className="flex items-center gap-1">
                          <Star size={11} className="fill-gold text-gold" />
                          <NewPill />
                        </span>
                      )}
                    </span>
                  </td>
                  {ROLE_ORDER.map((role, ci) => {
                    const on = allowed(cap, role);
                    return (
                      <td key={role} className="px-4 py-2.5 text-center">
                        <motion.button
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: ri * 0.01 + ci * 0.01 }}
                          onClick={() => togglePerm(cap, role)}
                          aria-label={`${cap.label} — ${role}: ${on ? 'allowed' : 'denied'}`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg transition hover:bg-app-bg"
                        >
                          <motion.span key={String(on)} initial={{ scale: 0.7 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 20 }}>
                            {on ? <Check size={17} className="text-success" /> : <Minus size={15} className="text-app-muted" />}
                          </motion.span>
                        </motion.button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      <UserDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} editing={editing} />
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Invite / Edit drawer                                               */
/* ---------------------------------------------------------------- */

function UserDrawer({ open, onClose, editing }: { open: boolean; onClose: () => void; editing: User | null }) {
  const state = useStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [role, setRole] = useState<RoleName>('Officer');
  const [statusActive, setStatusActive] = useState(true);
  const [error, setError] = useState('');
  const wasOpen = useRef(false);

  /* populate when opened */
  useEffect(() => {
    if (open && !wasOpen.current) {
      setName(editing?.name ?? '');
      setEmail(editing?.email ?? '');
      setEmployeeId(state.employees.find((e) => e.name === editing?.name)?.id ?? '');
      setRole((editing && editing.role !== 'Finance' ? editing.role : 'Officer') as RoleName);
      setStatusActive(editing ? editing.status === 'Active' : true);
      setError('');
    }
    wasOpen.current = open;
  }, [open, editing, state.employees]);

  const submit = () => {
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError('Enter a valid email address.');
      return;
    }
    const me = state.users[0]?.name ?? 'Admin User';
    if (editing) {
      updateItem(
        'users',
        editing.id,
        { name: name.trim(), email: email.trim(), role, status: statusActive ? 'Active' : 'Inactive' },
        { user: me, details: `Updated user ${name.trim()} — role ${role}` },
      );
    } else {
      const initials = name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
      const colors = ['#2563EB', '#16A34A', '#7C3AED', '#D97706', '#1F3B57'];
      addItem(
        'users',
        {
          id: uid('usr'),
          name: name.trim(),
          initials,
          email: email.trim(),
          role,
          /* Invited is a UI-level status — cast into EntityStatus */
          status: (statusActive ? 'Invited' : 'Inactive') as User['status'],
          avatarColor: colors[state.users.length % colors.length],
        },
        { user: me, details: `Invited ${name.trim()} (${email.trim()}) as ${role}`, verb: 'Invited user', verbColor: 'gold' },
      );
    }
    onClose();
  };

  const empOptions = [{ value: '', label: 'Not linked to an employee' }, ...state.employees.map((e) => ({ value: e.id, label: `${e.name} — ${e.role}` }))];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={editing ? `Edit — ${editing.name}` : 'Invite User'}
      footer={
        <>
          <button onClick={onClose} className="h-9 rounded-lg border border-app-border bg-white px-4 text-[13px] font-semibold text-app-ink transition hover:brightness-105">
            Cancel
          </button>
          <button onClick={submit} className="h-9 rounded-lg bg-action px-4 text-[13px] font-semibold text-white transition hover:-translate-y-px hover:bg-action-hover active:scale-[.98]">
            {editing ? 'Save changes' : 'Send invite'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Full name" required>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Brian Kipchoge" />
        </Field>
        <Field label="Email" required error={error && error.includes('email') ? error : undefined}>
          <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@fbv.co.ke" />
        </Field>
        <Field label="Link to employee" hint="Connects this login to the Employee Master">
          <SelectInput value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} options={empOptions} />
        </Field>

        <div>
          <div className="mb-2 text-[13px] font-medium text-app-ink">Role</div>
          <div className="grid grid-cols-2 gap-2">
            {ROLE_ORDER.map((r) => {
              const Icon = ROLE_META[r].icon;
              const selected = role === r;
              return (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={cn(
                    'rounded-xl border-2 p-3 text-left transition',
                    selected ? 'border-action bg-info-soft/40' : 'border-app-border bg-white hover:border-app-muted',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Icon size={16} className={selected ? 'text-action' : 'text-app-muted'} />
                    <span className="text-sm font-semibold text-app-ink">{r}</span>
                    {selected && <Check size={14} className="ml-auto text-action" />}
                  </div>
                  <div className="mt-1 text-[11px] leading-4 text-app-muted">{ROLE_META[r].summary}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-app-border bg-app-bg px-4 py-3">
          <div>
            <div className="text-sm font-medium text-app-ink">{editing ? 'Active' : 'Send email invite'}</div>
            <div className="text-xs text-app-muted">
              {editing ? 'Disabled users cannot sign in' : 'User appears as “Invited” until they accept'}
            </div>
          </div>
          <Toggle checked={statusActive} onChange={setStatusActive} />
        </div>

        {error && !error.includes('email') && <p className="text-xs text-danger">{error}</p>}
      </div>
    </Drawer>
  );
}
