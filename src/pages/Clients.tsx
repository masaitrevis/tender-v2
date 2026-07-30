/**
 * Clients — /clients. ERP list + drawer pattern per master-data.md §1.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Eye, Landmark, MapPin, Pencil, Scale, FilePlus2,
  Trash2, UserCheck, Users, Wallet, Ban, Banknote,
} from 'lucide-react';
import { useStore, addItem, updateItem, removeItem, uid, nowISO, TODAY } from '@/lib/store';
import type { Client, ClientType } from '@/lib/store';
import { formatKES } from '@/lib/format';
import {
  PageHeader, StatChip, Pill, Drawer, ConfirmDialog, Field, TextInput,
  PhoneInput, SelectInput, TextareaInput, Toggle, TimelineItem,
} from '@/components/shared';
import {
  DataTable, ExportCsvButton, PrimaryButton, SearchBox, UploadExcelButton,
  CountUp, ToastStack, useToasts, downloadCSV, nextCode, useFlashIds,
  FormSection, KV, TabStrip, KENYA_COUNTIES,
} from '@/components/masterdata/shared';
import type { Col } from '@/components/masterdata/shared';
import type { ClientX } from '@/components/masterdata/types';

const CLIENT_TYPES: ClientType[] = ['Government', 'County Government', 'Parastatal', 'Corporate', 'NGO'];
const KRA_RE = /^[A-Z]\d{9}[A-Z]$/i;

interface Draft {
  code: string; name: string; type: ClientType; company: string;
  contactPerson: string; phone: string; email: string; kraPin: string;
  address: string; county: string; country: string;
  paymentTerms: string; creditLimit: string; status: 'Active' | 'Inactive'; notes: string;
}

const emptyDraft = (code: string): Draft => ({
  code, name: '', type: 'Corporate', company: '', contactPerson: '', phone: '',
  email: '', kraPin: '', address: '', county: 'Nairobi', country: 'Kenya',
  paymentTerms: '30', creditLimit: '', status: 'Active', notes: '',
});

function draftOf(c: ClientX): Draft {
  return {
    code: c.code, name: c.name, type: c.type, company: c.company ?? '',
    contactPerson: c.contactPerson, phone: c.phone.replace(/^\+254\s?/, ''),
    email: c.email, kraPin: c.kraPin, address: c.address,
    county: c.county ?? c.city, country: c.country ?? 'Kenya',
    paymentTerms: String(c.paymentTerms ?? 30),
    creditLimit: c.creditLimit != null ? String(c.creditLimit) : '',
    status: c.status, notes: c.notes ?? '',
  };
}

export default function Clients() {
  const state = useStore();
  const { toasts, push, dismiss } = useToasts();
  const flashIds = useFlashIds('clients');

  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<Client | null>(null);
  const [detailTab, setDetailTab] = useState('overview');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft(''));
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const [confirm, setConfirm] = useState<{ kind: 'delete' | 'deactivate'; client: Client } | null>(null);

  const clients = state.clients as ClientX[];

  /* derived lookups */
  const openTendersByClient = useMemo(() => {
    const m = new Map<string, number>();
    state.tenders
      .filter((t) => t.status === 'Open' || t.status === 'Submitted' || t.status === 'Under Evaluation')
      .forEach((t) => m.set(t.clientId, (m.get(t.clientId) ?? 0) + 1));
    return m;
  }, [state.tenders]);

  const outstandingByClient = useMemo(() => {
    const m = new Map<string, number>();
    state.documents
      .filter((d) => d.type === 'invoice' && d.status !== 'Paid' && d.status !== 'Cancelled')
      .forEach((d) => m.set(d.clientId, (m.get(d.clientId) ?? 0) + Math.max(0, d.total - d.amountPaid)));
    return m;
  }, [state.documents]);

  const usageCount = useMemo(() => {
    const ids = new Set<string>();
    state.tenders.forEach((t) => ids.add(t.clientId));
    state.documents.forEach((d) => ids.add(d.clientId));
    return ids.size;
  }, [state.tenders, state.documents]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) =>
      [c.code, c.name, c.contactPerson, c.email, c.phone, c.kraPin, c.city]
        .join(' ').toLowerCase().includes(q));
  }, [clients, search]);

  const stats = useMemo(() => ({
    total: clients.length,
    active: clients.filter((c) => c.status === 'Active').length,
    withTenders: clients.filter((c) => (openTendersByClient.get(c.id) ?? 0) > 0).length,
    withBalance: clients.filter((c) => (outstandingByClient.get(c.id) ?? 0) > 0).length,
  }), [clients, openTendersByClient, outstandingByClient]);

  /* ---------------- form ---------------- */

  const openAdd = () => {
    setEditing(null);
    setDraft(emptyDraft(nextCode('FBV-CLI', state.clients)));
    setErrors({});
    setFormOpen(true);
  };
  const openEdit = (c: Client) => {
    setEditing(c);
    setDraft(draftOf(c));
    setErrors({});
    setFormOpen(true);
  };

  const validate = (): boolean => {
    const e: Partial<Record<keyof Draft, string>> = {};
    if (!draft.name.trim()) e.name = 'Client Name is required';
    if (!draft.code.trim()) e.code = 'Client Code is required';
    if (draft.kraPin && !KRA_RE.test(draft.kraPin.trim())) e.kraPin = 'Format: P000111222A';
    if (draft.email && !/^\S+@\S+\.\S+$/.test(draft.email.trim())) e.email = "That email doesn't look right";
    if (draft.creditLimit && Number.isNaN(Number(draft.creditLimit))) e.creditLimit = 'Credit Limit must be a number';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = () => {
    if (!validate()) return;
    const record = {
      code: draft.code.trim(),
      name: draft.name.trim(),
      type: draft.type,
      contactPerson: draft.contactPerson.trim(),
      email: draft.email.trim(),
      phone: draft.phone.trim() ? `+254 ${draft.phone.trim()}` : '',
      kraPin: draft.kraPin.trim().toUpperCase(),
      address: draft.address.trim(),
      city: draft.county,
      status: draft.status,
      notes: draft.notes.trim() || undefined,
      company: draft.company.trim() || undefined,
      county: draft.county,
      country: draft.country.trim() || 'Kenya',
      paymentTerms: Number(draft.paymentTerms) || 30,
      creditLimit: draft.creditLimit ? Number(draft.creditLimit) : undefined,
    };
    if (editing) {
      updateItem('clients', editing.id, record as Partial<Client>, {
        details: `Updated Client — ${record.code} (${record.name})`,
      });
      push('success', 'Client updated');
    } else {
      addItem('clients', { id: uid('cli'), createdAt: nowISO(), ...record } as Client, {
        details: `Created Client — ${record.code} (${record.name})`,
      });
      push('success', 'Client added');
    }
    setFormOpen(false);
  };

  const doDelete = (c: Client) => {
    removeItem('clients', c.id, { details: `Deleted Client — ${c.code} (${c.name})` });
    push('success', 'Client deleted', () => {
      addItem('clients', c, { action: 'Restored', verb: 'Restored', details: `Restored Client — ${c.code} (${c.name})` });
    });
  };

  const doDeactivate = (c: Client) => {
    updateItem('clients', c.id, { status: c.status === 'Active' ? 'Inactive' : 'Active' }, {
      details: `${c.status === 'Active' ? 'Deactivated' : 'Reactivated'} Client — ${c.code} (${c.name})`,
    });
    push('success', c.status === 'Active' ? 'Client deactivated' : 'Client reactivated');
  };

  const depsOf = (c: Client) => ({
    tenders: state.tenders.filter((t) => t.clientId === c.id).length,
    documents: state.documents.filter((d) => d.clientId === c.id).length,
  });

  /* ---------------- export ---------------- */
  const exportCsv = () => {
    downloadCSV(
      `fbv-clients-${TODAY}.csv`,
      ['Client Code', 'Client Name', 'Type', 'Contact Person', 'Phone', 'Email', 'KRA PIN', 'County', 'Open Tenders', 'Outstanding (KES)', 'Status'],
      filtered.map((c) => [
        c.code, c.name, c.type, c.contactPerson, c.phone, c.email, c.kraPin, c.county ?? c.city,
        openTendersByClient.get(c.id) ?? 0,
        (outstandingByClient.get(c.id) ?? 0).toFixed(2),
        c.status,
      ]),
    );
    push('success', 'Clients exported to CSV');
  };

  /* ---------------- columns ---------------- */
  const columns: Col<ClientX>[] = [
    {
      id: 'code', header: 'Code', sortKey: (c) => c.code,
      cell: (c) => <span className="font-mono text-[13px] font-medium text-navy-800">{c.code}</span>,
    },
    {
      id: 'name', header: 'Name', sortKey: (c) => c.name,
      cell: (c) => <span className="font-semibold text-app-ink">{c.name}</span>,
    },
    { id: 'contact', header: 'Contact Person', sortKey: (c) => c.contactPerson, cell: (c) => c.contactPerson || '—' },
    {
      id: 'phone', header: 'Phone / Email',
      cell: (c) => (
        <div className="leading-tight">
          <div className="tnum text-app-ink">{c.phone || '—'}</div>
          <div className="text-xs text-app-muted">{c.email || ''}</div>
        </div>
      ),
    },
    { id: 'kra', header: 'KRA PIN', cell: (c) => <span className="font-mono text-[13px] text-app-slate">{c.kraPin || '—'}</span> },
    {
      id: 'open', header: 'Open Tenders', align: 'center', sortKey: (c) => openTendersByClient.get(c.id) ?? 0,
      cell: (c) => {
        const n = openTendersByClient.get(c.id) ?? 0;
        return n > 0 ? <Pill tone="blue">{n}</Pill> : <span className="text-app-muted">—</span>;
      },
    },
    {
      id: 'outstanding', header: 'Outstanding', align: 'right', sortKey: (c) => outstandingByClient.get(c.id) ?? 0,
      cell: (c) => {
        const amt = outstandingByClient.get(c.id) ?? 0;
        return amt > 0
          ? <span className="tnum font-medium text-danger">{formatKES(amt)}</span>
          : <span className="text-app-muted">—</span>;
      },
    },
    { id: 'status', header: 'Status', sortKey: (c) => c.status, cell: (c) => <Pill status={c.status} /> },
  ];

  const detailTenders = detail ? state.tenders.filter((t) => t.clientId === detail.id) : [];
  const detailDocs = detail ? state.documents.filter((d) => d.clientId === detail.id) : [];
  const detailActivity = detail
    ? state.activity.filter((a) =>
        detailTenders.some((t) => t.refNo === a.ref) || detailDocs.some((d) => d.docNo === a.ref))
    : [];

  return (
    <div className="px-7 pt-6 pb-10">
      <PageHeader
        title="Clients"
        subtitle={`${clients.length} records · used in ${usageCount} documents/tenders`}
        actions={
          <>
            <SearchBox value={search} onChange={setSearch} placeholder="Search clients…" />
            <ExportCsvButton onClick={exportCsv} />
            <UploadExcelButton entity="clients" />
            <PrimaryButton onClick={openAdd}>Add Client</PrimaryButton>
          </>
        }
      />

      {/* StatChips */}
      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[
          { icon: <Users size={18} />, label: 'Total Clients', value: stats.total, variant: 'blue' as const },
          { icon: <UserCheck size={18} />, label: 'Active', value: stats.active, variant: 'green' as const },
          { icon: <Scale size={18} />, label: 'With Open Tenders', value: stats.withTenders, variant: 'gold' as const },
          { icon: <Wallet size={18} />, label: 'With Balance', value: stats.withBalance, variant: 'red' as const },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.05 }}
          >
            <StatChip icon={s.icon} label={s.label} variant={s.variant} value={<CountUp value={s.value} />} />
          </motion.div>
        ))}
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        rowId={(c) => c.id}
        onRowClick={(c) => { setDetail(c); setDetailTab('overview'); }}
        flashIds={flashIds}
        menu={(c) => [
          { label: 'View', icon: Eye, onClick: () => { setDetail(c); setDetailTab('overview'); } },
          { label: 'Edit', icon: Pencil, onClick: () => openEdit(c) },
          {
            label: c.status === 'Active' ? 'Deactivate' : 'Reactivate', icon: Ban,
            onClick: () => (c.status === 'Active' ? setConfirm({ kind: 'deactivate', client: c }) : doDeactivate(c)),
          },
          { label: 'Delete', icon: Trash2, danger: true, onClick: () => setConfirm({ kind: 'delete', client: c }) },
        ]}
        empty={{
          title: 'No clients yet',
          hint: 'Add your first client to start issuing quotations and tracking tenders.',
          action: (
            <div className="flex items-center gap-3">
              <PrimaryButton onClick={openAdd}>Add your first client</PrimaryButton>
              <Link to="/bulk-upload?entity=clients" className="text-sm font-semibold text-gold hover:underline">
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
        title={editing ? `Edit Client — ${editing.code}` : 'Add Client'}
        footer={
          <>
            <button onClick={() => setFormOpen(false)}
              className="h-9 rounded-lg border border-app-border bg-white px-4 text-[13px] font-semibold text-app-ink transition hover:brightness-105">
              Cancel
            </button>
            <PrimaryButton onClick={save}>Save Client</PrimaryButton>
          </>
        }
      >
        <FormSection title="Basic details">
          <Field label="Client Code" required error={errors.code} hint="Auto-generated, editable">
            <TextInput value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} className="font-mono" />
          </Field>
          <Field label="Client Name" required error={errors.name}>
            <TextInput value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Ministry of Health" />
          </Field>
          <Field label="Client Type">
            <SelectInput value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as ClientType })}
              options={CLIENT_TYPES.map((t) => ({ value: t, label: t }))} />
          </Field>
          <Field label="Company">
            <TextInput value={draft.company} onChange={(e) => setDraft({ ...draft, company: e.target.value })} placeholder="Registered company name" />
          </Field>
        </FormSection>

        <FormSection title="Contact">
          <Field label="Contact Person">
            <TextInput value={draft.contactPerson} onChange={(e) => setDraft({ ...draft, contactPerson: e.target.value })} placeholder="Jane Wanjiku" />
          </Field>
          <Field label="Phone">
            <PhoneInput value={draft.phone} onChange={(v) => setDraft({ ...draft, phone: v })} />
          </Field>
          <Field label="Email" error={errors.email}>
            <TextInput type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="procurement@client.go.ke" />
          </Field>
          <Field label="KRA PIN" error={errors.kraPin} hint="Format: P000111222A">
            <TextInput value={draft.kraPin} onChange={(e) => setDraft({ ...draft, kraPin: e.target.value.toUpperCase() })} className="font-mono" placeholder="P000111222A" />
          </Field>
          <Field label="Address" className="col-span-2">
            <TextInput value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} placeholder="Street, building" />
          </Field>
          <Field label="County">
            <SelectInput value={draft.county} onChange={(e) => setDraft({ ...draft, county: e.target.value })}
              options={KENYA_COUNTIES.map((c) => ({ value: c, label: c }))} />
          </Field>
          <Field label="Country">
            <TextInput value={draft.country} onChange={(e) => setDraft({ ...draft, country: e.target.value })} />
          </Field>
        </FormSection>

        <FormSection title="Financial">
          <Field label="Payment Terms">
            <SelectInput value={draft.paymentTerms} onChange={(e) => setDraft({ ...draft, paymentTerms: e.target.value })}
              options={[{ value: '30', label: '30 days' }, { value: '45', label: '45 days' }, { value: '60', label: '60 days' }]} />
          </Field>
          <Field label="Credit Limit (KES)" error={errors.creditLimit}>
            <TextInput inputMode="decimal" value={draft.creditLimit} onChange={(e) => setDraft({ ...draft, creditLimit: e.target.value.replace(/[^\d.]/g, '') })} placeholder="500,000" />
          </Field>
        </FormSection>

        <FormSection title="Notes">
          <Field label="Status" className="col-span-2">
            <div className="flex h-[38px] items-center">
              <Toggle checked={draft.status === 'Active'} onChange={(v) => setDraft({ ...draft, status: v ? 'Active' : 'Inactive' })} label={draft.status} />
            </div>
          </Field>
          <Field label="Notes" className="col-span-2">
            <TextareaInput value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Framework agreements, key contacts…" />
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
              <span className="font-mono text-[13px] font-medium text-navy-800">{detail.code}</span>
              <span className="text-[15px] font-semibold text-app-ink">{detail.name}</span>
              <Pill status={detail.status} />
            </div>
          )
        }
      >
        {detail && (
          <div>
            <TabStrip
              id="client-detail-tabs"
              active={detailTab}
              onChange={setDetailTab}
              tabs={[
                { id: 'overview', label: 'Overview' },
                { id: 'related', label: 'Tenders & Documents' },
                { id: 'activity', label: 'Activity' },
              ]}
            />

            {detailTab === 'overview' && (
              <div className="py-5">
                <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                  <KV label="Client Type">{detail.type}</KV>
                  <KV label="Company">{(detail as ClientX).company || '—'}</KV>
                  <KV label="Contact Person">{detail.contactPerson || '—'}</KV>
                  <KV label="Phone"><span className="tnum">{detail.phone || '—'}</span></KV>
                  <KV label="Email">{detail.email || '—'}</KV>
                  <KV label="KRA PIN"><span className="font-mono text-[13px]">{detail.kraPin || '—'}</span></KV>
                  <KV label="Payment Terms">{(detail as ClientX).paymentTerms ?? 30} days</KV>
                  <KV label="Credit Limit">{(detail as ClientX).creditLimit != null ? formatKES((detail as ClientX).creditLimit!) : '—'}</KV>
                </div>
                <div className="mt-5 flex items-start gap-2 rounded-lg bg-app-bg px-3 py-2.5 text-sm text-app-slate">
                  <MapPin size={15} className="mt-0.5 shrink-0 text-app-muted" />
                  <span>{[detail.address, (detail as ClientX).county ?? detail.city, (detail as ClientX).country ?? 'Kenya'].filter(Boolean).join(', ') || 'No address on file'}</span>
                </div>
                {detail.notes && <p className="mt-4 text-sm leading-6 text-app-slate">{detail.notes}</p>}

                <div className="mt-6">
                  <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-app-slate">Quick actions</h3>
                  <div className="flex flex-wrap gap-2">
                    <Link to="/documents/new/quotation" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-app-border bg-white px-3 text-xs font-semibold text-app-ink transition hover:brightness-105">
                      <FilePlus2 size={13} className="text-action" /> New Quotation
                    </Link>
                    <Link to="/tenders" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-app-border bg-white px-3 text-xs font-semibold text-app-ink transition hover:brightness-105">
                      <Landmark size={13} className="text-action" /> New Tender
                    </Link>
                    <Link to="/payments" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-app-border bg-white px-3 text-xs font-semibold text-app-ink transition hover:brightness-105">
                      <Banknote size={13} className="text-action" /> Record Payment
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {detailTab === 'related' && (
              <div className="py-5">
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-app-slate">
                  Tenders ({detailTenders.length})
                </h3>
                <div className="mb-5 flex flex-wrap gap-2">
                  {detailTenders.length === 0 && <span className="text-sm text-app-muted">No tenders for this client yet.</span>}
                  {detailTenders.map((t) => (
                    <span key={t.id} className="inline-flex items-center gap-2 rounded-full border border-app-border bg-white px-3 py-1.5 text-xs">
                      <span className="font-mono font-medium text-navy-800">{t.refNo}</span>
                      <span className="max-w-[220px] truncate text-app-slate">{t.title}</span>
                      <Pill status={t.status} />
                    </span>
                  ))}
                </div>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-app-slate">
                  Documents ({detailDocs.length})
                </h3>
                <div className="space-y-1.5">
                  {detailDocs.length === 0 && <span className="text-sm text-app-muted">No documents for this client yet.</span>}
                  {detailDocs.map((d) => (
                    <div key={d.id} className="flex items-center justify-between rounded-lg border border-app-border px-3 py-2">
                      <span className="font-mono text-[13px] font-medium text-navy-800">{d.docNo}</span>
                      <span className="text-xs capitalize text-app-slate">{d.type}</span>
                      <span className="tnum text-sm text-app-ink">{formatKES(d.total)}</span>
                      <Pill status={d.status} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detailTab === 'activity' && (
              <div className="py-5">
                {detailActivity.length === 0 ? (
                  <p className="text-sm text-app-muted">No recent activity linked to this client.</p>
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
        onConfirm={() => confirm && doDelete(confirm.client)}
        title="Delete client?"
        destructive
        confirmLabel="Delete"
        message={
          confirm && (
            <span>
              <b>{confirm.client.name}</b> ({confirm.client.code}) will be permanently removed.
              {depsOf(confirm.client).tenders + depsOf(confirm.client).documents > 0 && (
                <span className="mt-2 flex flex-wrap items-center gap-2">
                  Linked records:
                  <Pill tone="amber">{depsOf(confirm.client).tenders} tenders</Pill>
                  <Pill tone="amber">{depsOf(confirm.client).documents} documents</Pill>
                </span>
              )}
            </span>
          )
        }
      />
      <ConfirmDialog
        open={confirm?.kind === 'deactivate'}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && doDeactivate(confirm.client)}
        title="Deactivate client?"
        confirmLabel="Deactivate"
        message={
          confirm && (
            <span>
              <b>{confirm.client.name}</b> will no longer appear in pickers for new documents and tenders.
              {depsOf(confirm.client).tenders + depsOf(confirm.client).documents > 0 && (
                <span className="mt-2 flex flex-wrap items-center gap-2">
                  Existing records stay linked:
                  <Pill tone="amber">{depsOf(confirm.client).tenders} tenders</Pill>
                  <Pill tone="amber">{depsOf(confirm.client).documents} documents</Pill>
                </span>
              )}
            </span>
          )
        }
      />

      <ToastStack toasts={toasts} dismiss={dismiss} />
    </div>
  );
}
