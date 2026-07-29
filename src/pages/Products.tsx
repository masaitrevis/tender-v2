/**
 * Products — /products. Product & service database per master-data.md §3,
 * with live margin caption, VAT chips and low-stock amber row highlighting.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle, Eye, Pencil, Trash2, Package, PackageCheck, PackageMinus,
  PackageX, Ban, Truck,
} from 'lucide-react';
import { useStore, addItem, updateItem, removeItem, uid, nowISO, TODAY } from '@/lib/store';
import type { Product } from '@/lib/store';
import { formatKES, formatNumber } from '@/lib/format';
import {
  PageHeader, StatChip, Pill, Drawer, ConfirmDialog, Field, TextInput,
  SelectInput, Toggle, CurrencyInput,
} from '@/components/shared';
import {
  DataTable, ExportCsvButton, PrimaryButton, SearchBox, UploadExcelButton,
  CountUp, ToastStack, useToasts, downloadCSV, nextCode, useFlashIds,
  FormSection, KV,
} from '@/components/masterdata/shared';
import type { Col } from '@/components/masterdata/shared';
import { stockStatus, type ProductX, type StockStatus } from '@/components/masterdata/types';

const UNITS = ['Pcs', 'Box', 'Ream', 'Set', 'Carton', 'Service', 'Lot', 'Month'];
const CATEGORIES = ['ICT Equipment', 'Office Machines', 'Furniture', 'Stationery', 'Security Systems', 'Power Equipment', 'Medical Consumables', 'Catering', 'Services'];

interface Draft {
  code: string; name: string; category: string; unit: string;
  buyingPrice: string; sellingPrice: string; vatRate: string; discount: string;
  supplierId: string; stockQty: string; brand: string; leadTimeDays: string;
  warranty: string; status: 'Active' | 'Inactive';
}

const emptyDraft = (code: string): Draft => ({
  code, name: '', category: 'Stationery', unit: 'Pcs', buyingPrice: '', sellingPrice: '',
  vatRate: '16', discount: '', supplierId: '', stockQty: '0', brand: '',
  leadTimeDays: '', warranty: '', status: 'Active',
});

function draftOf(p: ProductX): Draft {
  return {
    code: p.code, name: p.name, category: p.category, unit: p.unit,
    buyingPrice: String(p.costPrice), sellingPrice: String(p.sellingPrice),
    vatRate: String(p.vatRate), discount: p.discount != null ? String(p.discount) : '',
    supplierId: p.supplierId ?? '', stockQty: String(p.stockQty ?? 0),
    brand: p.brand ?? '', leadTimeDays: p.leadTimeDays != null ? String(p.leadTimeDays) : '',
    warranty: p.warranty ?? '', status: p.status,
  };
}

const STOCK_TONE: Record<StockStatus, 'green' | 'amber' | 'red'> = {
  'In Stock': 'green',
  'Low Stock': 'amber',
  'Out of Stock': 'red',
};

export default function Products() {
  const state = useStore();
  const { toasts, push, dismiss } = useToasts();
  const flashIds = useFlashIds('products');

  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft(''));
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const [confirm, setConfirm] = useState<{ kind: 'delete' | 'deactivate'; product: Product } | null>(null);

  const products = state.products as ProductX[];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) =>
      [p.code, p.name, p.category, p.unit, p.supplierName, p.brand]
        .filter(Boolean).join(' ').toLowerCase().includes(q));
  }, [products, search]);

  const stats = useMemo(() => {
    const statuses = products.map(stockStatus);
    return {
      total: products.length,
      inStock: statuses.filter((s) => s === 'In Stock').length,
      low: statuses.filter((s) => s === 'Low Stock').length,
      out: statuses.filter((s) => s === 'Out of Stock').length,
    };
  }, [products]);

  const usageCount = useMemo(
    () => new Set(state.documents.flatMap((d) => d.lines.map((l) => l.productId).filter(Boolean))).size,
    [state.documents],
  );

  /* live margin caption */
  const margin = useMemo(() => {
    const buy = Number(draft.buyingPrice);
    const sell = Number(draft.sellingPrice);
    if (!buy || !sell || sell <= 0) return null;
    const m = Math.round(((sell - buy) / sell) * 100);
    return { pct: m, kes: sell - buy };
  }, [draft.buyingPrice, draft.sellingPrice]);

  /* ---------------- form ---------------- */
  const openAdd = () => {
    setEditing(null);
    setDraft(emptyDraft(nextCode('FBV-PRD', state.products)));
    setErrors({});
    setFormOpen(true);
  };
  const openEdit = (p: Product) => {
    setEditing(p);
    setDraft(draftOf(p));
    setErrors({});
    setFormOpen(true);
  };

  const validate = (): boolean => {
    const e: Partial<Record<keyof Draft, string>> = {};
    if (!draft.name.trim()) e.name = 'Description is required';
    if (!draft.code.trim()) e.code = 'Item Code is required';
    if (draft.buyingPrice === '' || Number.isNaN(Number(draft.buyingPrice))) e.buyingPrice = 'Buying Price must be a number';
    if (draft.sellingPrice === '' || Number.isNaN(Number(draft.sellingPrice))) e.sellingPrice = 'Selling Price must be a number';
    if (draft.vatRate !== '0' && draft.vatRate !== '16') e.vatRate = 'VAT should be 0 or 16';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = () => {
    if (!validate()) return;
    const supplier = state.suppliers.find((s) => s.id === draft.supplierId);
    const record = {
      code: draft.code.trim(),
      name: draft.name.trim(),
      category: draft.category,
      unit: draft.unit.toLowerCase(),
      costPrice: Number(draft.buyingPrice) || 0,
      sellingPrice: Number(draft.sellingPrice) || 0,
      vatRate: Number(draft.vatRate) || 0,
      stockQty: Number(draft.stockQty) || 0,
      status: draft.status,
      supplierId: supplier?.id,
      supplierName: supplier?.name,
      brand: draft.brand.trim() || undefined,
      leadTimeDays: draft.leadTimeDays ? Number(draft.leadTimeDays) : undefined,
      warranty: draft.warranty.trim() || undefined,
      discount: draft.discount ? Number(draft.discount) : undefined,
    };
    if (editing) {
      updateItem('products', editing.id, record as Partial<Product>, { details: `Updated Product — ${record.code} (${record.name})` });
      push('success', 'Product updated');
    } else {
      addItem('products', { id: uid('prd'), createdAt: nowISO(), ...record } as Product, { details: `Created Product — ${record.code} (${record.name})` });
      push('success', 'Product added');
    }
    setFormOpen(false);
  };

  const doDelete = (p: Product) => {
    removeItem('products', p.id, { details: `Deleted Product — ${p.code} (${p.name})` });
    push('success', 'Product deleted', () => {
      addItem('products', p, { action: 'Restored', verb: 'Restored', details: `Restored Product — ${p.code} (${p.name})` });
    });
  };

  const doDeactivate = (p: Product) => {
    updateItem('products', p.id, { status: p.status === 'Active' ? 'Inactive' : 'Active' }, {
      details: `${p.status === 'Active' ? 'Deactivated' : 'Reactivated'} Product — ${p.code} (${p.name})`,
    });
    push('success', p.status === 'Active' ? 'Product deactivated' : 'Product reactivated');
  };

  const docsUsing = (p: Product) =>
    state.documents.filter((d) => d.lines.some((l) => l.productId === p.id)).length;

  /* ---------------- export ---------------- */
  const exportCsv = () => {
    downloadCSV(
      `fbv-products-${TODAY}.csv`,
      ['Item Code', 'Description', 'Category', 'Unit', 'Buying Price', 'Selling Price', 'VAT Rate', 'Stock Qty', 'Stock Status', 'Supplier'],
      filtered.map((p) => [p.code, p.name, p.category, p.unit, p.costPrice, p.sellingPrice, p.vatRate, p.stockQty ?? 0, stockStatus(p), p.supplierName ?? '']),
    );
    push('success', 'Products exported to CSV');
  };

  /* ---------------- columns ---------------- */
  const columns: Col<ProductX>[] = [
    {
      id: 'code', header: 'Item Code', sortKey: (p) => p.code,
      cell: (p) => (
        <span className="inline-flex items-center gap-1.5 font-mono text-[13px] font-medium text-navy-800">
          {p.code}
          {stockStatus(p) === 'Low Stock' && <AlertTriangle size={13} className="text-warning" />}
        </span>
      ),
    },
    { id: 'name', header: 'Description', sortKey: (p) => p.name, cell: (p) => <span className="font-semibold text-app-ink">{p.name}</span> },
    { id: 'category', header: 'Category', sortKey: (p) => p.category, cell: (p) => <span className="text-app-slate">{p.category}</span> },
    { id: 'unit', header: 'Unit', cell: (p) => <span className="capitalize">{p.unit}</span> },
    {
      id: 'buy', header: 'Buying Price', align: 'right', sortKey: (p) => p.costPrice,
      cell: (p) => <span className="tnum text-app-slate">{formatNumber(p.costPrice)}</span>,
    },
    {
      id: 'sell', header: 'Selling Price', align: 'right', sortKey: (p) => p.sellingPrice,
      cell: (p) => <span className="tnum font-medium text-app-ink">{formatNumber(p.sellingPrice)}</span>,
    },
    {
      id: 'vat', header: 'VAT', align: 'center', sortKey: (p) => p.vatRate,
      cell: (p) => (
        <span className="inline-flex rounded-full bg-grey-soft px-2 py-0.5 text-[11px] font-semibold text-grey tnum">{p.vatRate}%</span>
      ),
    },
    {
      id: 'stock', header: 'Stock Status', sortKey: (p) => stockStatus(p),
      cell: (p) => {
        const s = stockStatus(p);
        return (
          <span className="inline-flex items-center gap-2">
            <Pill tone={STOCK_TONE[s]}>{s}</Pill>
            <span className="text-xs text-app-muted tnum">×{p.stockQty ?? 0}</span>
          </span>
        );
      },
    },
    {
      id: 'supplier', header: 'Supplier',
      cell: (p) => (p.supplierName ? (
        <span className="inline-flex items-center gap-1.5 text-app-slate"><Truck size={13} className="text-app-muted" />{p.supplierName}</span>
      ) : <span className="text-app-muted">—</span>),
    },
    { id: 'status', header: 'Status', sortKey: (p) => p.status, cell: (p) => <Pill status={p.status} /> },
  ];

  return (
    <div className="px-7 pt-6 pb-10">
      <PageHeader
        title="Products & Services"
        subtitle={`${products.length} records · used in ${usageCount} documents/tenders`}
        actions={
          <>
            <SearchBox value={search} onChange={setSearch} placeholder="Search products…" />
            <ExportCsvButton onClick={exportCsv} />
            <UploadExcelButton entity="products" />
            <PrimaryButton onClick={openAdd}>Add Product</PrimaryButton>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[
          { icon: <Package size={18} />, label: 'Total Items', value: stats.total, variant: 'blue' as const },
          { icon: <PackageCheck size={18} />, label: 'In Stock', value: stats.inStock, variant: 'green' as const },
          { icon: <PackageMinus size={18} />, label: 'Low Stock', value: stats.low, variant: 'amber' as const },
          { icon: <PackageX size={18} />, label: 'Out of Stock', value: stats.out, variant: 'red' as const },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: i * 0.05 }}>
            <StatChip icon={s.icon} label={s.label} variant={s.variant} value={<CountUp value={s.value} />} />
          </motion.div>
        ))}
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        rowId={(p) => p.id}
        onRowClick={setDetail}
        flashIds={flashIds}
        rowClass={(p) => (stockStatus(p) === 'Low Stock' ? 'bg-warning-soft/40 hover:bg-warning-soft/60' : undefined)}
        menu={(p) => [
          { label: 'View', icon: Eye, onClick: () => setDetail(p) },
          { label: 'Edit', icon: Pencil, onClick: () => openEdit(p) },
          {
            label: p.status === 'Active' ? 'Deactivate' : 'Reactivate', icon: Ban,
            onClick: () => (p.status === 'Active' ? setConfirm({ kind: 'deactivate', product: p }) : doDeactivate(p)),
          },
          { label: 'Delete', icon: Trash2, danger: true, onClick: () => setConfirm({ kind: 'delete', product: p }) },
        ]}
        empty={{
          title: 'No products yet',
          hint: 'Add your first product or service to start building quotations and BOQs.',
          action: (
            <div className="flex items-center gap-3">
              <PrimaryButton onClick={openAdd}>Add your first product</PrimaryButton>
              <Link to="/bulk-upload?entity=products" className="text-sm font-semibold text-gold hover:underline">
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
        title={editing ? `Edit Product — ${editing.code}` : 'Add Product / Service'}
        footer={
          <>
            <button onClick={() => setFormOpen(false)}
              className="h-9 rounded-lg border border-app-border bg-white px-4 text-[13px] font-semibold text-app-ink transition hover:brightness-105">
              Cancel
            </button>
            <PrimaryButton onClick={save}>Save Product</PrimaryButton>
          </>
        }
      >
        <FormSection title="Basic details">
          <Field label="Item Code" required error={errors.code} hint="Auto-generated, editable">
            <TextInput value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} className="font-mono" />
          </Field>
          <Field label="Description" required error={errors.name}>
            <TextInput value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="A4 Printing Paper 80gsm" />
          </Field>
          <Field label="Category">
            <SelectInput value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              options={Array.from(new Set([...CATEGORIES, draft.category])).map((c) => ({ value: c, label: c }))} />
          </Field>
          <Field label="Unit">
            <SelectInput value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
              options={UNITS.map((u) => ({ value: u, label: u }))} />
          </Field>
          <Field label="Brand">
            <TextInput value={draft.brand} onChange={(e) => setDraft({ ...draft, brand: e.target.value })} placeholder="HP, Double A…" />
          </Field>
          <Field label="Supplier">
            <SelectInput value={draft.supplierId} onChange={(e) => setDraft({ ...draft, supplierId: e.target.value })}
              options={[{ value: '', label: '— None —' }, ...state.suppliers.map((s) => ({ value: s.id, label: `${s.code} · ${s.name}` }))]} />
          </Field>
        </FormSection>

        <FormSection title="Pricing">
          <Field label="Buying Price" required error={errors.buyingPrice}>
            <CurrencyInput value={draft.buyingPrice} onChange={(v) => setDraft({ ...draft, buyingPrice: v })} />
          </Field>
          <Field label="Selling Price" required error={errors.sellingPrice}>
            <CurrencyInput value={draft.sellingPrice} onChange={(v) => setDraft({ ...draft, sellingPrice: v })} />
          </Field>
          <div className="col-span-2 -mt-1 min-h-[18px]">
            <AnimatePresence mode="wait">
              {margin && (
                <motion.div
                  key={`${margin.pct}-${margin.kes}`}
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="text-xs font-medium text-success"
                >
                  Margin: {margin.pct}% · {formatKES(margin.kes, { decimals: 0 })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <Field label="VAT Rate" error={errors.vatRate}>
            <SelectInput value={draft.vatRate} onChange={(e) => setDraft({ ...draft, vatRate: e.target.value })}
              options={[{ value: '16', label: '16%' }, { value: '0', label: '0% (exempt)' }]} />
          </Field>
          <Field label="Discount (%)">
            <TextInput inputMode="decimal" value={draft.discount} onChange={(e) => setDraft({ ...draft, discount: e.target.value.replace(/[^\d.]/g, '') })} placeholder="0" />
          </Field>
        </FormSection>

        <FormSection title="Stock & fulfilment">
          <Field label="Stock Qty">
            <TextInput inputMode="numeric" value={draft.stockQty} onChange={(e) => setDraft({ ...draft, stockQty: e.target.value.replace(/[^\d]/g, '') })} />
          </Field>
          <Field label="Lead Time (days)">
            <TextInput inputMode="numeric" value={draft.leadTimeDays} onChange={(e) => setDraft({ ...draft, leadTimeDays: e.target.value.replace(/[^\d]/g, '') })} placeholder="7" />
          </Field>
          <Field label="Warranty" className="col-span-2">
            <TextInput value={draft.warranty} onChange={(e) => setDraft({ ...draft, warranty: e.target.value })} placeholder="1 year manufacturer warranty" />
          </Field>
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
              <span className="font-mono text-[13px] font-medium text-navy-800">{detail.code}</span>
              <Pill tone={STOCK_TONE[stockStatus(detail)]}>{stockStatus(detail)}</Pill>
              <Pill status={detail.status} />
            </div>
          )
        }
      >
        {detail && (
          <div className="py-1">
            <h2 className="mb-4 text-[15px] font-semibold text-app-ink">{(detail as ProductX).name}</h2>
            <div className="grid grid-cols-2 gap-x-6 gap-y-5">
              <KV label="Category">{detail.category}</KV>
              <KV label="Unit"><span className="capitalize">{detail.unit}</span></KV>
              <KV label="Buying Price"><span className="tnum">{formatKES(detail.costPrice)}</span></KV>
              <KV label="Selling Price"><span className="tnum font-medium">{formatKES(detail.sellingPrice)}</span></KV>
              <KV label="VAT Rate"><span className="tnum">{detail.vatRate}%</span></KV>
              <KV label="Margin">
                {detail.sellingPrice > 0 && detail.costPrice > 0
                  ? <span className="tnum text-success">{Math.round(((detail.sellingPrice - detail.costPrice) / detail.sellingPrice) * 100)}%</span>
                  : '—'}
              </KV>
              <KV label="Stock Qty"><span className="tnum">{detail.stockQty ?? 0} {detail.unit}</span></KV>
              <KV label="Supplier">{(detail as ProductX).supplierName ?? '—'}</KV>
              <KV label="Brand">{(detail as ProductX).brand ?? '—'}</KV>
              <KV label="Lead Time">{(detail as ProductX).leadTimeDays != null ? `${(detail as ProductX).leadTimeDays} days` : '—'}</KV>
              <KV label="Warranty">{(detail as ProductX).warranty ?? '—'}</KV>
              <KV label="Used In"><span className="tnum">{docsUsing(detail)} documents</span></KV>
            </div>
            {stockStatus(detail) === 'Low Stock' && (
              <div className="mt-5 flex items-center gap-2 rounded-lg bg-warning-soft px-3 py-2.5 text-sm text-warning">
                <AlertTriangle size={15} /> Low stock — consider raising a purchase order.
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* ------------------------- Confirm dialogs ------------------------- */}
      <ConfirmDialog
        open={confirm?.kind === 'delete'}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && doDelete(confirm.product)}
        title="Delete product?"
        destructive
        confirmLabel="Delete"
        message={
          confirm && (
            <span>
              <b>{confirm.product.name}</b> ({confirm.product.code}) will be permanently removed.
              {docsUsing(confirm.product) > 0 && (
                <span className="mt-2 flex flex-wrap items-center gap-2">
                  Linked records: <Pill tone="amber">{docsUsing(confirm.product)} documents</Pill>
                </span>
              )}
            </span>
          )
        }
      />
      <ConfirmDialog
        open={confirm?.kind === 'deactivate'}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && doDeactivate(confirm.product)}
        title="Deactivate product?"
        confirmLabel="Deactivate"
        message={
          confirm && (
            <span>
              <b>{confirm.product.name}</b> will no longer appear in product pickers.
              {docsUsing(confirm.product) > 0 && (
                <span className="mt-2 flex flex-wrap items-center gap-2">
                  Existing documents stay linked: <Pill tone="amber">{docsUsing(confirm.product)} documents</Pill>
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
