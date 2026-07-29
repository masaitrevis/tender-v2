/**
 * Global search engine — shared by the ⌘K CommandPalette and the /search page.
 * Pure functions over AppState; no React.
 */
import type { AppState, DocType } from '@/lib/store';
import { formatKES } from '@/lib/format';

export type SearchGroupKey =
  | 'tenders'
  | 'clients'
  | 'suppliers'
  | 'products'
  | 'documents'
  | 'invoices'
  | 'dms'
  | 'employees'
  | 'actions';

export interface SearchResult {
  id: string;
  group: SearchGroupKey;
  title: string;
  /** mono ref shown before/with title (e.g. FBV-TND-2026-001) */
  ref?: string;
  caption: string;
  /** right-hand hint: status / amount / expiry date */
  hint?: string;
  hintTone?: string; // status string for Pill
  route: string;
  /** ISO date used by the /search date filter */
  date?: string;
  breadcrumb: string;
  searchable: string;
}

export interface SearchGroup {
  key: SearchGroupKey;
  label: string;
  breadcrumb: string;
  results: SearchResult[];
}

export const GROUP_META: Record<SearchGroupKey, { label: string; breadcrumb: string }> = {
  tenders: { label: 'Tenders', breadcrumb: 'Tenders / Tender Register' },
  clients: { label: 'Clients', breadcrumb: 'Master Data / Clients' },
  suppliers: { label: 'Suppliers', breadcrumb: 'Master Data / Suppliers' },
  products: { label: 'Products', breadcrumb: 'Master Data / Products' },
  documents: { label: 'Documents', breadcrumb: 'Documents / Document Center' },
  invoices: { label: 'Invoices', breadcrumb: 'Trackers / Payments' },
  dms: { label: 'Business Documents', breadcrumb: 'Documents / Business Documents' },
  employees: { label: 'Employees', breadcrumb: 'Master Data / Employees' },
  actions: { label: 'Actions', breadcrumb: 'Actions' },
};

export interface QuickAction {
  id: string;
  label: string;
  caption: string;
  route: string;
  keywords: string;
}

export const QUICK_ACTIONS: QuickAction[] = [
  { id: 'act-new-tender', label: 'New Tender', caption: 'Register a new tender opportunity', route: '/tenders', keywords: 'new tender create add register' },
  { id: 'act-record-payment', label: 'Record Payment', caption: 'Apply a client payment to an invoice', route: '/payments', keywords: 'record payment receipt invoice money' },
  { id: 'act-bulk-upload', label: 'Upload Excel — Bulk Upload Centre', caption: 'Mass-import masters from a spreadsheet', route: '/bulk-upload', keywords: 'upload excel bulk import spreadsheet xlsx' },
  { id: 'act-upload-dms', label: 'Upload Business Document', caption: 'Add a licence or certificate to the vault', route: '/dms', keywords: 'upload business document licence certificate dms vault' },
];

const DOC_TYPE_LABEL: Record<DocType, string> = {
  quotation: 'Quotation',
  proforma: 'Proforma',
  invoice: 'Invoice',
  receipt: 'Receipt',
  'purchase-order': 'Purchase Order',
  contract: 'Contract',
};

function clientName(s: AppState, id: string): string {
  return s.clients.find((c) => c.id === id)?.name ?? '—';
}

/** Build the full searchable index from the store. */
export function buildIndex(s: AppState): SearchResult[] {
  const out: SearchResult[] = [];

  s.tenders.forEach((t) => {
    const client = clientName(s, t.clientId);
    out.push({
      id: `t-${t.id}`,
      group: 'tenders',
      ref: t.refNo,
      title: t.title,
      caption: `${client} · ${t.category} · ${formatKES(t.value, { decimals: 0 })}`,
      hint: t.status,
      hintTone: t.status,
      route: '/tenders',
      date: t.publishedDate,
      breadcrumb: GROUP_META.tenders.breadcrumb,
      searchable: `${t.refNo} ${t.title} ${client} ${t.category} ${t.status}`.toLowerCase(),
    });
  });

  s.clients.forEach((c) => {
    out.push({
      id: `c-${c.id}`,
      group: 'clients',
      ref: c.code,
      title: c.name,
      caption: `${c.type} · ${c.contactPerson} · ${c.city}`,
      hint: c.status,
      hintTone: c.status,
      route: '/clients',
      date: c.createdAt,
      breadcrumb: GROUP_META.clients.breadcrumb,
      searchable: `${c.code} ${c.name} ${c.type} ${c.contactPerson} ${c.email} ${c.city} ${c.kraPin}`.toLowerCase(),
    });
  });

  s.suppliers.forEach((x) => {
    out.push({
      id: `s-${x.id}`,
      group: 'suppliers',
      ref: x.code,
      title: x.name,
      caption: `${x.category} · ${x.contactPerson} · ${x.city}`,
      hint: x.status,
      hintTone: x.status,
      route: '/suppliers',
      date: x.createdAt,
      breadcrumb: GROUP_META.suppliers.breadcrumb,
      searchable: `${x.code} ${x.name} ${x.category} ${x.contactPerson} ${x.email} ${x.city}`.toLowerCase(),
    });
  });

  s.products.forEach((p) => {
    out.push({
      id: `p-${p.id}`,
      group: 'products',
      ref: p.code,
      title: p.name,
      caption: `${p.category} · ${formatKES(p.sellingPrice, { decimals: 0 })} per ${p.unit}`,
      hint: formatKES(p.sellingPrice, { decimals: 0 }),
      route: '/products',
      date: p.createdAt,
      breadcrumb: GROUP_META.products.breadcrumb,
      searchable: `${p.code} ${p.name} ${p.category} ${p.unit}`.toLowerCase(),
    });
  });

  s.documents.forEach((d) => {
    const isInvoice = d.type === 'invoice';
    const client = clientName(s, d.clientId);
    out.push({
      id: `d-${d.id}`,
      group: isInvoice ? 'invoices' : 'documents',
      ref: d.docNo,
      title: `${DOC_TYPE_LABEL[d.type]} — ${client}`,
      caption: `${formatKES(d.total, { decimals: 0 })} · issued ${d.issueDate.slice(0, 10)}`,
      hint: isInvoice ? `${formatKES(d.total, { decimals: 0 })}` : d.status,
      hintTone: d.status,
      route: isInvoice ? '/payments' : '/documents',
      date: d.issueDate,
      breadcrumb: isInvoice ? GROUP_META.invoices.breadcrumb : GROUP_META.documents.breadcrumb,
      searchable: `${d.docNo} ${DOC_TYPE_LABEL[d.type]} ${client} ${d.status}`.toLowerCase(),
    });
  });

  s.dms.forEach((doc) => {
    out.push({
      id: `m-${doc.id}`,
      group: 'dms',
      ref: doc.refNo,
      title: doc.title,
      caption: `${doc.issuer} · ${doc.docType}`,
      hint: doc.expiryDate ? `exp ${doc.expiryDate.slice(0, 10)}` : 'No expiry',
      route: '/dms',
      date: doc.expiryDate ?? doc.issueDate,
      breadcrumb: GROUP_META.dms.breadcrumb,
      searchable: `${doc.refNo} ${doc.title} ${doc.issuer} ${doc.docType} ${doc.fileName}`.toLowerCase(),
    });
  });

  s.employees.forEach((e) => {
    out.push({
      id: `e-${e.id}`,
      group: 'employees',
      ref: e.code,
      title: e.name,
      caption: `${e.role} · ${e.department}`,
      hint: e.status,
      hintTone: e.status,
      route: '/employees',
      date: e.hiredAt,
      breadcrumb: GROUP_META.employees.breadcrumb,
      searchable: `${e.code} ${e.name} ${e.role} ${e.department} ${e.email}`.toLowerCase(),
    });
  });

  return out;
}

/** Every-token matching across the index; grouped, max per group configurable. */
export function searchAll(
  s: AppState,
  query: string,
  opts: { maxPerGroup?: number; groups?: SearchGroupKey[]; from?: string; to?: string } = {},
): SearchGroup[] {
  const q = query.trim().toLowerCase();
  const max = opts.maxPerGroup ?? 6;
  const index = buildIndex(s);

  const matchTokens = (hay: string, extra = ''): boolean => {
    if (!q) return true;
    return q.split(/\s+/).every((tok) => hay.includes(tok) || extra.includes(tok));
  };

  const inDateRange = (r: SearchResult): boolean => {
    if (!opts.from && !opts.to) return true;
    const d = (r.date ?? '').slice(0, 10);
    if (opts.from && d < opts.from) return false;
    if (opts.to && d > opts.to) return false;
    return true;
  };

  const groups: SearchGroup[] = [];
  const wanted = opts.groups ?? (Object.keys(GROUP_META) as SearchGroupKey[]);

  wanted.forEach((key) => {
    if (key === 'actions') {
      const hits = QUICK_ACTIONS.filter((a) => matchTokens(`${a.label} ${a.keywords}`.toLowerCase())).map((a) => ({
        id: a.id,
        group: 'actions' as const,
        title: a.label,
        caption: a.caption,
        route: a.route,
        breadcrumb: 'Actions',
        searchable: a.keywords,
      }));
      if (hits.length) groups.push({ key, label: GROUP_META[key].label, breadcrumb: GROUP_META[key].breadcrumb, results: hits.slice(0, max) });
      return;
    }
    const hits = index.filter((r) => r.group === key && matchTokens(r.searchable) && inDateRange(r));
    if (hits.length) groups.push({ key, label: GROUP_META[key].label, breadcrumb: GROUP_META[key].breadcrumb, results: hits.slice(0, max) });
  });

  return groups;
}

/** Flat counts per group for the /search filter rail. */
export function groupCounts(s: AppState, query: string): Record<SearchGroupKey, number> {
  const counts = {} as Record<SearchGroupKey, number>;
  (Object.keys(GROUP_META) as SearchGroupKey[]).forEach((k) => {
    counts[k] = searchAll(s, query, { groups: [k], maxPerGroup: 1000 })[0]?.results.length ?? 0;
  });
  return counts;
}
