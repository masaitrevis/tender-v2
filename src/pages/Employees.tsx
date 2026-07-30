/**
 * Employees — /employees. Employee master per master-data.md §4 with initials
 * avatars, system-role pills and radio-card role picker.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Eye, Pencil, Trash2, IdCard, UserCheck, Layers, KeyRound, Ban, FolderKanban,
} from 'lucide-react';
import { useStore, addItem, updateItem, removeItem, uid, TODAY } from '@/lib/store';
import type { Employee } from '@/lib/store';
import { formatDate } from '@/lib/format';
import {
  PageHeader, StatChip, Pill, Drawer, ConfirmDialog, Field, TextInput,
  PhoneInput, SelectInput, Toggle, TimelineItem,
} from '@/components/shared';
import type { Tone } from '@/components/shared';
import {
  DataTable, ExportCsvButton, PrimaryButton, SearchBox, UploadExcelButton,
  CountUp, ToastStack, useToasts, downloadCSV, nextCode, useFlashIds,
  FormSection, KV, TabStrip,
} from '@/components/masterdata/shared';
import type { Col } from '@/components/masterdata/shared';
import type { EmployeeX, SystemRole } from '@/components/masterdata/types';
import { cn } from '@/lib/utils';

const DEPARTMENTS = ['Tendering', 'Finance', 'Procurement', 'Sales', 'Administration', 'Management', 'Tenders & Bids', 'Compliance'];

const ROLE_TONE: Record<SystemRole, Tone> = { Admin: 'navy', Manager: 'blue', Officer: 'gold', Viewer: 'grey' };
const ROLE_DESC: Record<SystemRole, string> = {
  Admin: 'Full access to every module, users and settings.',
  Manager: 'Approve bids, manage tenders, documents and reports.',
  Officer: 'Create and edit records; no approvals or settings.',
  Viewer: 'Read-only access across the system.',
};

/* Seed-name fallbacks (master-data.md §4) for records without an explicit role. */
const ROLE_FALLBACK: Record<string, SystemRole> = {
  'Admin User': 'Admin',
  'Caroline Wanjiru': 'Manager',
  'Daniel Mutiso': 'Officer',
};
function systemRoleOf(e: EmployeeX): SystemRole {
  return e.systemRole ?? ROLE_FALLBACK[e.name] ?? 'Officer';
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

interface Draft {
  code: string; name: string; department: string; designation: string;
  phone: string; email: string; kraPin: string; hiredAt: string;
  systemRole: SystemRole; status: 'Active' | 'Inactive';
}

const emptyDraft = (code: string): Draft => ({
  code, name: '', department: 'Tendering', designation: '', phone: '', email: '',
  kraPin: '', hiredAt: TODAY, systemRole: 'Viewer', status: 'Active',
});

function draftOf(e: EmployeeX): Draft {
  return {
    code: e.code, name: e.name, department: e.department, designation: e.role,
    phone: e.phone.replace(/^\+254\s?/, ''), email: e.email, kraPin: e.kraPin,
    hiredAt: e.hiredAt?.slice(0, 10) || TODAY, systemRole: systemRoleOf(e), status: e.status,
  };
}

export default function Employees() {
  const state = useStore();
  const { toasts, push, dismiss } = useToasts();
  const flashIds = useFlashIds('employees');

  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<Employee | null>(null);
  const [detailTab, setDetailTab] = useState('overview');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft(''));
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const [confirm, setConfirm] = useState<{ kind: 'delete' | 'deactivate'; employee: Employee } | null>(null);

  const employees = state.employees as EmployeeX[];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) =>
      [e.code, e.name, e.department, e.role, e.email, e.phone, systemRoleOf(e)]
        .join(' ').toLowerCase().includes(q));
  }, [employees, search]);

  const stats = useMemo(() => ({
    total: employees.length,
    active: employees.filter((e) => e.status === 'Active').length,
    departments: new Set(employees.map((e) => e.department)).size,
    systemUsers: employees.filter((e) =>
      e.systemRole != null || state.users.some((u) => u.email === e.email)).length,
  }), [employees, state.users]);

  /* ---------------- form ---------------- */
  const openAdd = () => {
    setEditing(null);
    setDraft(emptyDraft(nextCode('FBV-EMP', state.employees)));
    setErrors({});
    setFormOpen(true);
  };
  const openEdit = (e: Employee) => {
    setEditing(e);
    setDraft(draftOf(e));
    setErrors({});
    setFormOpen(true);
  };

  const validate = (): boolean => {
    const errs: Partial<Record<keyof Draft, string>> = {};
    if (!draft.name.trim()) errs.name = 'Full Name is required';
    if (!draft.code.trim()) errs.code = 'Employee Code is required';
    if (draft.email && !/^\S+@\S+\.\S+$/.test(draft.email.trim())) errs.email = "That email doesn't look right";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const save = () => {
    if (!validate()) return;
    const record = {
      code: draft.code.trim(),
      name: draft.name.trim(),
      role: draft.designation.trim(),
      department: draft.department,
      email: draft.email.trim(),
      phone: draft.phone.trim() ? `+254 ${draft.phone.trim()}` : '',
      kraPin: draft.kraPin.trim().toUpperCase(),
      status: draft.status,
      hiredAt: draft.hiredAt,
      systemRole: draft.systemRole,
    };
    if (editing) {
      updateItem('employees', editing.id, record as Partial<Employee>, { details: `Updated Employee — ${record.code} (${record.name})` });
      push('success', 'Employee updated');
    } else {
      addItem('employees', { id: uid('emp'), ...record } as Employee, { details: `Created Employee — ${record.code} (${record.name})` });
      push('success', 'Employee added');
    }
    setFormOpen(false);
  };

  const doDelete = (e: Employee) => {
    removeItem('employees', e.id, { details: `Deleted Employee — ${e.code} (${e.name})` });
    push('success', 'Employee deleted', () => {
      addItem('employees', e, { action: 'Restored', verb: 'Restored', details: `Restored Employee — ${e.code} (${e.name})` });
    });
  };

  const doDeactivate = (e: Employee) => {
    updateItem('employees', e.id, { status: e.status === 'Active' ? 'Inactive' : 'Active' }, {
      details: `${e.status === 'Active' ? 'Deactivated' : 'Reactivated'} Employee — ${e.code} (${e.name})`,
    });
    push('success', e.status === 'Active' ? 'Employee deactivated' : 'Employee reactivated');
  };

  /* ---------------- export ---------------- */
  const exportCsv = () => {
    downloadCSV(
      `fbv-employees-${TODAY}.csv`,
      ['Employee Code', 'Full Name', 'Department', 'Designation', 'Phone', 'Email', 'System Role', 'Status'],
      filtered.map((e) => [e.code, e.name, e.department, e.role, e.phone, e.email, systemRoleOf(e), e.status]),
    );
    push('success', 'Employees exported to CSV');
  };

  /* ---------------- columns ---------------- */
  const columns: Col<EmployeeX>[] = [
    {
      id: 'code', header: 'Code', sortKey: (e) => e.code,
      cell: (e) => <span className="font-mono text-[13px] font-medium text-navy-800">{e.code}</span>,
    },
    {
      id: 'name', header: 'Full Name', sortKey: (e) => e.name,
      cell: (e) => (
        <span className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-800 text-[11px] font-bold text-white ring-2 ring-gold/60">
            {initialsOf(e.name)}
          </span>
          <span className="font-semibold text-app-ink">{e.name}</span>
        </span>
      ),
    },
    { id: 'dept', header: 'Department', sortKey: (e) => e.department, cell: (e) => e.department },
    { id: 'role', header: 'Designation', sortKey: (e) => e.role, cell: (e) => <span className="text-app-slate">{e.role || '—'}</span> },
    { id: 'phone', header: 'Phone', cell: (e) => <span className="tnum">{e.phone || '—'}</span> },
    { id: 'email', header: 'Email', cell: (e) => <span className="text-app-slate">{e.email || '—'}</span> },
    {
      id: 'sysrole', header: 'System Role', sortKey: (e) => systemRoleOf(e),
      cell: (e) => <Pill tone={ROLE_TONE[systemRoleOf(e)]}>{systemRoleOf(e)}</Pill>,
    },
    { id: 'status', header: 'Status', sortKey: (e) => e.status, cell: (e) => <Pill status={e.status} /> },
  ];

  const detailActivity = detail
    ? state.activity.filter((a) => a.user === detail.name)
    : [];

  return (
    <div className="px-7 pt-6 pb-10">
      <PageHeader
        title="Employees"
        subtitle={`${employees.length} records · ${stats.departments} departments`}
        actions={
          <>
            <SearchBox value={search} onChange={setSearch} placeholder="Search employees…" />
            <ExportCsvButton onClick={exportCsv} />
            <UploadExcelButton entity="employees" />
            <PrimaryButton onClick={openAdd}>Add Employee</PrimaryButton>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[
          { icon: <IdCard size={18} />, label: 'Total Staff', value: stats.total, variant: 'blue' as const },
          { icon: <UserCheck size={18} />, label: 'Active', value: stats.active, variant: 'green' as const },
          { icon: <Layers size={18} />, label: 'Departments', value: stats.departments, variant: 'amber' as const },
          { icon: <KeyRound size={18} />, label: 'System Users', value: stats.systemUsers, variant: 'gold' as const },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: i * 0.05 }}>
            <StatChip icon={s.icon} label={s.label} variant={s.variant} value={<CountUp value={s.value} />} />
          </motion.div>
        ))}
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        rowId={(e) => e.id}
        onRowClick={(e) => { setDetail(e); setDetailTab('overview'); }}
        flashIds={flashIds}
        menu={(e) => [
          { label: 'View', icon: Eye, onClick: () => { setDetail(e); setDetailTab('overview'); } },
          { label: 'Edit', icon: Pencil, onClick: () => openEdit(e) },
          {
            label: e.status === 'Active' ? 'Deactivate' : 'Reactivate', icon: Ban,
            onClick: () => (e.status === 'Active' ? setConfirm({ kind: 'deactivate', employee: e }) : doDeactivate(e)),
          },
          { label: 'Delete', icon: Trash2, danger: true, onClick: () => setConfirm({ kind: 'delete', employee: e }) },
        ]}
        empty={{
          title: 'No employees yet',
          hint: 'Add your first team member to assign tenders and track workload.',
          action: (
            <div className="flex items-center gap-3">
              <PrimaryButton onClick={openAdd}>Add your first employee</PrimaryButton>
              <Link to="/bulk-upload?entity=employees" className="text-sm font-semibold text-gold hover:underline">
                or upload an Excel file
              </Link>
            </div>
          ),
        }}
      />

      {/* ------------------------- Add / Edit drawer ------------------------- */}
      <Drawer
        open={formOpen}
        onClose={() => setFormOpen(false)}
        width="w-[480px]"
        title={editing ? `Edit Employee — ${editing.code}` : 'Add Employee'}
        footer={
          <>
            <button onClick={() => setFormOpen(false)}
              className="h-9 rounded-lg border border-app-border bg-white px-4 text-[13px] font-semibold text-app-ink transition hover:brightness-105">
              Cancel
            </button>
            <PrimaryButton onClick={save}>Save Employee</PrimaryButton>
          </>
        }
      >
        <FormSection title="Basic details">
          <Field label="Employee Code" required error={errors.code} hint="Auto-generated, editable">
            <TextInput value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} className="font-mono" />
          </Field>
          <Field label="Full Name" required error={errors.name}>
            <TextInput value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Brian Kipchoge" />
          </Field>
          <Field label="Department">
            <SelectInput value={draft.department} onChange={(e) => setDraft({ ...draft, department: e.target.value })}
              options={Array.from(new Set([...DEPARTMENTS, draft.department])).map((d) => ({ value: d, label: d }))} />
          </Field>
          <Field label="Designation">
            <TextInput value={draft.designation} onChange={(e) => setDraft({ ...draft, designation: e.target.value })} placeholder="Procurement Assistant" />
          </Field>
        </FormSection>

        <FormSection title="Contact">
          <Field label="Phone">
            <PhoneInput value={draft.phone} onChange={(v) => setDraft({ ...draft, phone: v })} />
          </Field>
          <Field label="Email" error={errors.email}>
            <TextInput type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="b.kipchoge@fbv.co.ke" />
          </Field>
          <Field label="KRA PIN" hint="Format: A001234567X">
            <TextInput value={draft.kraPin} onChange={(e) => setDraft({ ...draft, kraPin: e.target.value.toUpperCase() })} className="font-mono" />
          </Field>
          <Field label="Hire Date">
            <TextInput type="date" value={draft.hiredAt} onChange={(e) => setDraft({ ...draft, hiredAt: e.target.value })} className="tnum" />
          </Field>
        </FormSection>

        <FormSection title="System access">
          <div className="col-span-2 grid grid-cols-2 gap-3">
            {(Object.keys(ROLE_DESC) as SystemRole[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setDraft({ ...draft, systemRole: r })}
                className={cn(
                  'rounded-xl border p-3 text-left transition',
                  draft.systemRole === r
                    ? 'border-action bg-info-soft ring-1 ring-action'
                    : 'border-app-border bg-white hover:border-app-slate',
                )}
              >
                <div className="mb-1 flex items-center justify-between">
                  <Pill tone={ROLE_TONE[r]}>{r}</Pill>
                  <span className={cn('h-3.5 w-3.5 rounded-full border-2', draft.systemRole === r ? 'border-action bg-action' : 'border-app-border')} />
                </div>
                <p className="text-xs leading-5 text-app-slate">{ROLE_DESC[r]}</p>
              </button>
            ))}
          </div>
        </FormSection>

        <FormSection title="Status">
          <Field label="Status" className="col-span-2">
            <div className="flex h-[38px] items-center">
              <Toggle checked={draft.status === 'Active'} onChange={(v) => setDraft({ ...draft, status: v ? 'Active' : 'Inactive' })} label={draft.status} />
            </div>
          </Field>
        </FormSection>
      </Drawer>

      {/* ------------------------- Detail drawer ------------------------- */}
      <Drawer
        open={detail != null}
        onClose={() => setDetail(null)}
        width="w-[560px]"
        title={
          detail && (
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-800 text-[11px] font-bold text-white ring-2 ring-gold/60">
                {initialsOf(detail.name)}
              </span>
              <span className="text-[15px] font-semibold text-app-ink">{detail.name}</span>
              <Pill tone={ROLE_TONE[systemRoleOf(detail)]}>{systemRoleOf(detail)}</Pill>
              <Pill status={detail.status} />
            </div>
          )
        }
      >
        {detail && (
          <div>
            <TabStrip
              id="employee-detail-tabs"
              active={detailTab}
              onChange={setDetailTab}
              tabs={[
                { id: 'overview', label: 'Overview' },
                { id: 'tenders', label: 'Assigned Tenders' },
                { id: 'activity', label: 'Activity' },
              ]}
            />

            {detailTab === 'overview' && (
              <div className="py-5">
                <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                  <KV label="Employee Code"><span className="font-mono text-[13px]">{detail.code}</span></KV>
                  <KV label="Department">{detail.department}</KV>
                  <KV label="Designation">{detail.role || '—'}</KV>
                  <KV label="Phone"><span className="tnum">{detail.phone || '—'}</span></KV>
                  <KV label="Email">{detail.email || '—'}</KV>
                  <KV label="KRA PIN"><span className="font-mono text-[13px]">{detail.kraPin || '—'}</span></KV>
                  <KV label="Hired">{formatDate(detail.hiredAt)}</KV>
                  <KV label="System Role"><Pill tone={ROLE_TONE[systemRoleOf(detail)]}>{systemRoleOf(detail)}</Pill></KV>
                </div>
                <p className="mt-5 rounded-lg bg-app-bg px-3 py-2.5 text-sm text-app-slate">
                  {ROLE_DESC[systemRoleOf(detail)]}
                </p>
              </div>
            )}

            {detailTab === 'tenders' && (
              <div className="py-5">
                <p className="flex items-center gap-2 text-sm text-app-muted">
                  <FolderKanban size={15} />
                  No tenders assigned yet — officer assignment arrives with the Tender Register workload view.
                </p>
              </div>
            )}

            {detailTab === 'activity' && (
              <div className="py-5">
                {detailActivity.length === 0 ? (
                  <p className="text-sm text-app-muted">No recent activity by this employee.</p>
                ) : (
                  detailActivity.slice(0, 12).map((a, i) => <TimelineItem key={a.id} entry={a} index={i} />)
                )}
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* ------------------------- Confirm dialogs ------------------------- */}
      <ConfirmDialog
        open={confirm?.kind === 'delete'}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && doDelete(confirm.employee)}
        title="Delete employee?"
        destructive
        confirmLabel="Delete"
        message={
          confirm && (
            <span>
              <b>{confirm.employee.name}</b> ({confirm.employee.code}) will be permanently removed. Activity history stays in the audit trail.
            </span>
          )
        }
      />
      <ConfirmDialog
        open={confirm?.kind === 'deactivate'}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && doDeactivate(confirm.employee)}
        title="Deactivate employee?"
        confirmLabel="Deactivate"
        message={
          confirm && (
            <span>
              <b>{confirm.employee.name}</b> will lose system access and disappear from assignment pickers.
            </span>
          )
        }
      />

      <ToastStack toasts={toasts} dismiss={dismiss} />
    </div>
  );
}
