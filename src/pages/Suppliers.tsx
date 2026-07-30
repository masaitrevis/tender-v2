/**
 * Suppliers — /suppliers. ERP list + drawer pattern per master-data.md §2,
 * with category filter pills and gold star ratings (hover-preview on edit).
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Eye, Pencil, Trash2, Truck, UserCheck, Layers, Star, Ban, Package, ShoppingCart,
} from 'lucide-react';
import { useStore, addItem, updateItem, removeItem, uid, nowISO, TODAY } from '@/lib/store';
import type { Supplier } from '@/lib/store';
import { formatKES } from '@/lib/format';
import {
  PageHeader, StatChip, Pill, Drawer, ConfirmDialog, Field, TextInput,
  PhoneInput, SelectInput, TextareaInput, Toggle, TimelineItem,
} from '@/components/shared';
import {
  DataTable, ExportCsvButton, PrimaryButton, SearchBox, UploadExcelButton,
  CountUp, ToastStack, useToasts, downloadCSV, nextCode, useFlashIds,
  FormSection, KV, TabStrip,
} from '@/components/masterdata/shared';
import type { Col } from '@/components/masterdata/shared';
import type { ProductX, SupplierX } from '@/components/masterdata/types';
import { cn } from '@/lib/utils';

const CATEGORIES = ['Office Supplies', 'ICT', 'Medical', 'Catering', 'Works', 'Printing', 'Equipment & Machinery', 'Stationery & Office Supplies', 'Security & Surveillance', 'Furniture & Fittings', 'ICT Equipment', 'Printing & Branding'];
const KRA_RE = /^[A-Z]\d{9}[A-Z]$/i;

interface Draft {
  code: string; name: string; category: string; contactPerson: string;
  phone: string; email: string; address: string; city: string; kraPin: string;
  paymentTerms: string; rating: number; status: 'Active' | 'Inactive'; notes: string;
}

const emptyDraft = (code: string): Draft => ({
  code, name: '', category: 'Office Supplies', contactPerson: '', phone: '',
  email: '', address: '', city: 'Nairobi', kraPin: '', paymentTerms: '30 days',
  rating: 3, status: 'Active', notes: '',
});

function draftOf(s: SupplierX): Draft {
  return {
    code: s.code, name: s.name, category: s.category, contactPerson: s.contactPerson,
    phone: s.phone.replace(/^\+254\s?/, ''), email: s.email, address: s.address,
    city: s.city, kraPin: s.kraPin, paymentTerms: s.paymentTerms ?? '30 days',
    rating: s.rating ?? 3, status: s.status, notes: s.notes ?? '',
  };
}

/** Gold 1–5 star display. */
export function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)} title={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={14}
          className={i <= Math.round(value) ? 'fill-gold text-gold' : 'fill-[#E4E9F0] text-[#E4E9F0]'}
        />
      ))}
    </span>
  );
}

/** Interactive star input with hover preview. */
function StarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="flex h-[38px] items-center gap-1" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          onMouseEnter={() => setHover(i)}
          onClick={() => onChange(i)}
          className="rounded p-0.5 transition hover:scale-110"
          aria-label={`${i} star${i > 1 ? 's' : ''}`}
        >
          <Star size={20} className={i <= shown ? 'fill-gold text-gold' : 'fill-[#E4E9F0] text-[#E4E9F0]'} />
        </button>
      ))}
      <span className="ml-2 text-sm text-app-slate tnum">{shown.toFixed(1)}</span>
    </div>
  );
}

export default function Suppliers() {
  const state = useStore();
  const { toasts, push, dismiss } = useToasts();
  const flashIds = useFlashIds('suppliers');

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('All');
  const [detail, setDetail] = useState<Supplier | null>(null);
  const [detailTab, setDetailTab] = useState('overview');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft(''));
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const [confirm, setConfirm] = useState<{ kind: 'delete' | 'deactivate'; supplier: Supplier } | null>(null);

  const suppliers = state.suppliers as SupplierX[];

  const categories = useMemo(() => ['All', ...Array.from(new Set(suppliers.map((s) => s.category)))], [suppliers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return suppliers.filter((s) => {
      if (category !== 'All' && s.category !== category) return false;
      if (!q) return true;
      return [s.code, s.name, s.category, s.contactPerson, s.email, s.phone, s.kraPin]
        .join(' ').toLowerCase().includes(q);
    });
  }, [suppliers, search, category]);

  const stats = useMemo(() => {
    const rated = suppliers.filter((s) => s.rating != null);
    return {
      total: suppliers.length,
      active: suppliers.filter((s) => s.status === 'Active').length,
      categories: new Set(suppliers.map((s) => s.category)).size,
      avgRating: rated.length ? rated.reduce((a, s) => a + (s.rating ?? 0), 0) / rated.length : 0,
    };
  }, [suppliers]);

  /* ---------------- form ---------------- */
  const openAdd = () => {
    setEditing(null);
    setDraft(emptyDraft(nextCode('FBV-SUP', state.suppliers)));
    setErrors({});
    setFormOpen(true);
  };
  const openEdit = (s: Supplier) => {
    setEditing(s);
    setDraft(draftOf(s));
    setErrors({});
    setFormOpen(true);
  };

  const validate = (): boolean => {
    const e: Partial<Record<keyof Draft, string>> = {};
    if (!draft.name.trim()) e.name = 'Supplier Name is required';
    if (!draft.code.trim()) e.code = 'Supplier Code is required';
    if (draft.kraPin && !KRA_RE.test(draft.kraPin.trim())) e.kraPin = 'Format: P000111222A';
    if (draft.email && !/^\S+@\S+\.\S+$/.test(draft.email.trim())) e.email = "That email doesn't look right";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = () => {
    if (!validate()) return;
    const record = {
      code: draft.code.trim(),
      name: draft.name.trim(),
      category: draft.category,
      contactPerson: draft.contactPerson.trim(),
      email: draft.email.trim(),
      phone: draft.phone.trim() ? `+254 ${draft.phone.trim()}` : '',
      kraPin: draft.kraPin.trim().toUpperCase(),
      address: draft.address.trim(),
      city: draft.city.trim(),
      status: draft.status,
      rating: draft.rating,
      notes: draft.notes.trim() || undefined,
      paymentTerms: draft.paymentTerms,
    };
    if (editing) {
      updateItem('suppliers', editing.id, record as Partial<Supplier>, { details: `Updated Supplier — ${record.code} (${record.name})` });
      push('success', 'Supplier updated');
    } else {
      addItem('suppliers', { id: uid('sup'), createdAt: nowISO(), ...record } as Supplier, { details: `Created Supplier — ${record.code} (${record.name})` });
      push('success', 'Supplier added');
    }
    setFormOpen(false);
  };

  const doDelete = (s: Supplier) => {
    removeItem('suppliers', s.id, { details: `Deleted Supplier — ${s.code} (${s.name})` });
    push('success', 'Supplier deleted', () => {
      addItem('suppliers', s, { action: 'Restored', verb: 'Restored', details: `Restored Supplier — ${s.code} (${s.name})` });
    });
  };

  const doDeactivate = (s: Supplier) => {
    updateItem('suppliers', s.id, { status: s.status === 'Active' ? 'Inactive' : 'Active' }, {
      details: `${s.status === 'Active' ? 'Deactivated' : 'Reactivated'} Supplier — ${s.code} (${s.name})`,
    });
    push('success', s.status === 'Active' ? 'Supplier deactivated' : 'Supplier reactivated');
  };

  const depsOf = (s: Supplier) => ({
    products: (state.products as ProductX[]).filter((p) => p.supplierId === s.id || p.supplierName === s.name).length,
    orders: state.documents.filter((d) => d.type === 'purchase-order' && d.clientId === s.id).length,
  });

  /* ---------------- export ---------------- */
  const exportCsv = () => {
    downloadCSV(
      `fbv-suppliers-${TODAY}.csv`,
      ['Supplier Code', 'Name', 'Category', 'Contact Person', 'Phone', 'Email', 'KRA PIN', 'Rating', 'Payment Terms', 'Status'],
      filtered.map((s) => [s.code, s.name, s.category, s.contactPerson, s.phone, s.email, s.kraPin, s.rating ?? '', s.paymentTerms ?? '', s.status]),
    );
    push('success', 'Suppliers exported to CSV');
  };

  /* ---------------- columns ---------------- */
  const columns: Col<SupplierX>[] = [
    {
      id: 'code', header: 'Code', sortKey: (s) => s.code,
      cell: (s) => <span className="font-mono text-[13px] font-medium text-navy-800">{s.code}</span>,
    },
    { id: 'name', header: 'Name', sortKey: (s) => s.name, cell: (s) => <span className="font-semibold text-app-ink">{s.name}</span> },
    {
      id: 'category', header: 'Category', sortKey: (s) => s.category,
      cell: (s) => (
        <span className="inline-flex rounded-full bg-grey-soft px-2.5 py-1 text-[11px] font-semibold text-grey">{s.category}</span>
      ),
    },
    { id: 'contact', header: 'Contact Person', sortKey: (s) => s.contactPerson, cell: (s) => s.contactPerson || '—' },
    {
      id: 'phone', header: 'Phone / Email',
      cell: (s) => (
        <div className="leading-tight">
          <div className="tnum text-app-ink">{s.phone || '—'}</div>
          <div className="text-xs text-app-muted">{s.email || ''}</div>
        </div>
      ),
    },
    { id: 'kra', header: 'KRA PIN', cell: (s) => <span className="font-mono text-[13px] text-app-slate">{s.kraPin || '—'}</span> },
    { id: 'rating', header: 'Rating', sortKey: (s) => s.rating ?? 0, cell: (s) => <Stars value={s.rating ?? 0} /> },
    { id: 'terms', header: 'Payment Terms', cell: (s) => s.paymentTerms ?? '—' },
    { id: 'status', header: 'Status', sortKey: (s) => s.status, cell: (s) => <Pill status={s.status} /> },
  ];

  const detailProducts = detail
    ? (state.products as ProductX[]).filter((p) => p.supplierId === detail.id || p.supplierName === detail.name)
    : [];
  const detailPOs = detail ? state.documents.filter((d) => d.type === 'purchase-order' && d.clientId === detail.id) : [];
  const detailActivity = detail ? state.activity.filter((a) => detailPOs.some((d) => d.docNo === a.ref)) : [];

  return (
    <div className="px-7 pt-6 pb-10">
      <PageHeader
        title="Suppliers"
        subtitle={`${suppliers.length} records · ${stats.categories} categories`}
        actions={
          <>
            <SearchBox value={search} onChange={setSearch} placeholder="Search suppliers…" />
            <ExportCsvButton onClick={exportCsv} />
            <UploadExcelButton entity="suppliers" />
            <PrimaryButton onClick={openAdd}>Add Supplier</PrimaryButton>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[
          { icon: <Truck size={18} />, label: 'Total Suppliers', value: <CountUp value={stats.total} />, variant: 'blue' as const },
          { icon: <UserCheck size={18} />, label: 'Active', value: <CountUp value={stats.active} />, variant: 'green' as const },
          { icon: <Layers size={18} />, label: 'Categories', value: <CountUp value={stats.categories} />, variant: 'amber' as const },
          { icon: <Star size={18} />, label: 'Avg Rating', value: <CountUp value={stats.avgRating} format={(n) => n.toFixed(1)} />, variant: 'gold' as const },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: i * 0.05 }}>
            <StatChip icon={s.icon} label={s.label} variant={s.variant} value={s.value} />
          </motion.div>
        ))}
      </div>

      {/* category filter pills */}
      <div className="mb-4 flex flex-wrap gap-2">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
              category === c
                ? 'border-action bg-info-soft text-action'
                : 'border-app-border bg-white text-app-slate hover:text-app-ink',
            )}
          >
            {c}
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        rowId={(s) => s.id}
        onRowClick={(s) => { setDetail(s); setDetailTab('overview'); }}
        flashIds={flashIds}
        menu={(s) => [
          { label: 'View', icon: Eye, onClick: () => { setDetail(s); setDetailTab('overview'); } },
          { label: 'Edit', icon: Pencil, onClick: () => openEdit(s) },
          {
            label: s.status === 'Active' ? 'Deactivate' : 'Reactivate', icon: Ban,
            onClick: () => (s.status === 'Active' ? setConfirm({ kind: 'deactivate', supplier: s }) : doDeactivate(s)),
          },
          { label: 'Delete', icon: Trash2, danger: true, onClick: () => setConfirm({ kind: 'delete', supplier: s }) },
        ]}
        empty={{
          title: 'No suppliers yet',
          hint: 'Add your first supplier to start linking purchase orders and products.',
          action: (
            <div className="flex items-center gap-3">
              <PrimaryButton onClick={openAdd}>Add your first supplier</PrimaryButton>
              <Link to="/bulk-upload?entity=suppliers" className="text-sm font-semibold text-gold hover:underline">
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
        title={editing ? `Edit Supplier — ${editing.code}` : 'Add Supplier'}
        footer={
          <>
            <button onClick={() => setFormOpen(false)}
              className="h-9 rounded-lg border border-app-border bg-white px-4 text-[13px] font-semibold text-app-ink transition hover:brightness-105">
              Cancel
            </button>
            <PrimaryButton onClick={save}>Save Supplier</PrimaryButton>
          </>
        }
      >
        <FormSection title="Basic details">
          <Field label="Supplier Code" required error={errors.code} hint="Auto-generated, editable">
            <TextInput value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} className="font-mono" />
          </Field>
          <Field label="Name" required error={errors.name}>
            <TextInput value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="TechWorks Ltd" />
          </Field>
          <Field label="Category">
            <SelectInput value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              options={Array.from(new Set([...CATEGORIES, draft.category])).map((c) => ({ value: c, label: c }))} />
          </Field>
          <Field label="Contact Person">
            <TextInput value={draft.contactPerson} onChange={(e) => setDraft({ ...draft, contactPerson: e.target.value })} />
          </Field>
        </FormSection>

        <FormSection title="Contact">
          <Field label="Phone">
            <PhoneInput value={draft.phone} onChange={(v) => setDraft({ ...draft, phone: v })} />
          </Field>
          <Field label="Email" error={errors.email}>
            <TextInput type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="sales@supplier.co.ke" />
          </Field>
          <Field label="Address" className="col-span-2">
            <TextInput value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} />
          </Field>
          <Field label="City / Town">
            <TextInput value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} />
          </Field>
          <Field label="KRA PIN" error={errors.kraPin} hint="Format: P000111222A">
            <TextInput value={draft.kraPin} onChange={(e) => setDraft({ ...draft, kraPin: e.target.value.toUpperCase() })} className="font-mono" placeholder="P000111222A" />
          </Field>
        </FormSection>

        <FormSection title="Financial">
          <Field label="Payment Terms">
            <SelectInput value={draft.paymentTerms} onChange={(e) => setDraft({ ...draft, paymentTerms: e.target.value })}
              options={['Cash on delivery', '14 days', '30 days', '45 days', '60 days'].map((t) => ({ value: t, label: t }))} />
          </Field>
          <Field label="Performance Rating">
            <StarInput value={draft.rating} onChange={(v) => setDraft({ ...draft, rating: v })} />
          </Field>
        </FormSection>

        <FormSection title="Notes">
          <Field label="Status" className="col-span-2">
            <div className="flex h-[38px] items-center">
              <Toggle checked={draft.status === 'Active'} onChange={(v) => setDraft({ ...draft, status: v ? 'Active' : 'Inactive' })} label={draft.status} />
            </div>
          </Field>
          <Field label="Notes" className="col-span-2">
            <TextareaInput value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Lead times, preferred brands…" />
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
              id="supplier-detail-tabs"
              active={detailTab}
              onChange={setDetailTab}
              tabs={[
                { id: 'overview', label: 'Overview' },
                { id: 'products', label: 'Products Supplied' },
                { id: 'orders', label: 'Purchase Orders' },
                { id: 'activity', label: 'Activity' },
              ]}
            />

            {detailTab === 'overview' && (
              <div className="py-5">
                <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                  <KV label="Category">{detail.category}</KV>
                  <KV label="Rating"><Stars value={detail.rating ?? 0} /></KV>
                  <KV label="Contact Person">{detail.contactPerson || '—'}</KV>
                  <KV label="Phone"><span className="tnum">{detail.phone || '—'}</span></KV>
                  <KV label="Email">{detail.email || '—'}</KV>
                  <KV label="KRA PIN"><span className="font-mono text-[13px]">{detail.kraPin || '—'}</span></KV>
                  <KV label="Payment Terms">{(detail as SupplierX).paymentTerms ?? '—'}</KV>
                  <KV label="Location">{[detail.address, detail.city].filter(Boolean).join(', ') || '—'}</KV>
                </div>
                {detail.notes && <p className="mt-4 text-sm leading-6 text-app-slate">{detail.notes}</p>}
              </div>
            )}

            {detailTab === 'products' && (
              <div className="py-5">
                {detailProducts.length === 0 ? (
                  <p className="flex items-center gap-2 text-sm text-app-muted">
                    <Package size={15} /> No products linked to this supplier yet.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {detailProducts.map((p) => (
                      <span key={p.id} className="inline-flex items-center gap-2 rounded-full border border-app-border bg-white px-3 py-1.5 text-xs">
                        <span className="font-mono font-medium text-navy-800">{p.code}</span>
                        <span className="max-w-[200px] truncate text-app-slate">{p.name}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {detailTab === 'orders' && (
              <div className="py-5">
                {detailPOs.length === 0 ? (
                  <p className="flex items-center gap-2 text-sm text-app-muted">
                    <ShoppingCart size={15} /> No purchase orders for this supplier yet.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {detailPOs.map((d) => (
                      <div key={d.id} className="flex items-center justify-between rounded-lg border border-app-border px-3 py-2">
                        <span className="font-mono text-[13px] font-medium text-navy-800">{d.docNo}</span>
                        <span className="tnum text-sm text-app-ink">{formatKES(d.total)}</span>
                        <Pill status={d.status} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {detailTab === 'activity' && (
              <div className="py-5">
                {detailActivity.length === 0 ? (
                  <p className="text-sm text-app-muted">No recent activity linked to this supplier.</p>
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
        onConfirm={() => confirm && doDelete(confirm.supplier)}
        title="Delete supplier?"
        destructive
        confirmLabel="Delete"
        message={
          confirm && (
            <span>
              <b>{confirm.supplier.name}</b> ({confirm.supplier.code}) will be permanently removed.
              {depsOf(confirm.supplier).products + depsOf(confirm.supplier).orders > 0 && (
                <span className="mt-2 flex flex-wrap items-center gap-2">
                  Linked records:
                  <Pill tone="amber">{depsOf(confirm.supplier).products} products</Pill>
                  <Pill tone="amber">{depsOf(confirm.supplier).orders} purchase orders</Pill>
                </span>
              )}
            </span>
          )
        }
      />
      <ConfirmDialog
        open={confirm?.kind === 'deactivate'}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && doDeactivate(confirm.supplier)}
        title="Deactivate supplier?"
        confirmLabel="Deactivate"
        message={
          confirm && (
            <span>
              <b>{confirm.supplier.name}</b> will no longer appear in pickers for new purchase orders.
              {depsOf(confirm.supplier).products + depsOf(confirm.supplier).orders > 0 && (
                <span className="mt-2 flex flex-wrap items-center gap-2">
                  Existing records stay linked:
                  <Pill tone="amber">{depsOf(confirm.supplier).products} products</Pill>
                  <Pill tone="amber">{depsOf(confirm.supplier).orders} purchase orders</Pill>
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
