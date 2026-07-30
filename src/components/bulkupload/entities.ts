/**
 * Bulk Upload Centre — entity definitions, Excel template generation, file
 * parsing, automatic column mapping, per-row validation and record building.
 * All plain-language, per bulk-upload.md.
 */
import * as XLSX from 'xlsx';
import { parse, parseISO, isValid, format } from 'date-fns';
import { Package, Truck, Users, IdCard } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AppState, Client, Employee, Product, Supplier } from '@/lib/store';
import { uid, nowISO } from '@/lib/store';
import type { ClientX, EmployeeX, ProductX, SupplierX } from '@/components/masterdata/types';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type EntityKey = 'products' | 'suppliers' | 'clients' | 'employees';

export type FieldKind = 'text' | 'money' | 'int' | 'email' | 'krapin' | 'enum' | 'date' | 'vat' | 'rating';

export interface FieldDef {
  key: string;
  header: string; // template header shown to users
  aliases: string[];
  required?: boolean;
  kind: FieldKind;
  options?: string[]; // enum
}

export interface EntityDef {
  key: EntityKey;
  label: string;
  plural: EntityKey; // store collection key
  icon: LucideIcon;
  codePrefix: string;
  fields: FieldDef[];
  requiredCaption: string;
  examples: (string | number)[][];
  dupKeys: string[]; // duplicate detection order
  checks: string[]; // "What we check" panel lines
}

export type RawValue = string | number | Date | null | undefined;

export interface RowIssue {
  field: string; // FieldDef key
  message: string;
}

export interface DupMatch {
  existingId: string;
  code: string;
  name: string;
}

export interface ValidatedRow {
  index: number; // 1-based row number within the file's data rows
  raw: Record<string, RawValue>; // keyed by FieldDef.key
  issues: RowIssue[];
  dup: DupMatch | null;
}

export type RowStatus = 'ready' | 'problem' | 'duplicate';
export function rowStatus(r: ValidatedRow): RowStatus {
  if (r.issues.length > 0) return 'problem';
  if (r.dup) return 'duplicate';
  return 'ready';
}

/* ------------------------------------------------------------------ */
/* Entity definitions                                                  */
/* ------------------------------------------------------------------ */

const PRODUCT_FIELDS: FieldDef[] = [
  { key: 'code', header: 'Item Code', aliases: ['ItemCode', 'Code', 'Item', 'SKU'], required: true, kind: 'text' },
  { key: 'name', header: 'Description', aliases: ['Item Description', 'Product', 'Product Name', 'Name', 'Item Name'], required: true, kind: 'text' },
  { key: 'category', header: 'Category', aliases: ['Group', 'Type'], kind: 'text' },
  { key: 'unit', header: 'Unit', aliases: ['UOM', 'Unit of Measure', 'Units'], kind: 'text' },
  { key: 'costPrice', header: 'Buying Price', aliases: ['Cost Price', 'Purchase Price', 'Buy Price', 'Cost'], kind: 'money' },
  { key: 'sellingPrice', header: 'Selling Price', aliases: ['Sale Price', 'Price', 'Unit Price', 'Sell Price'], required: true, kind: 'money' },
  { key: 'vatRate', header: 'VAT Rate', aliases: ['VAT', 'VAT %', 'VATRate', 'Tax Rate'], kind: 'vat' },
  { key: 'stockQty', header: 'Stock Qty', aliases: ['Quantity', 'Qty', 'Stock', 'Stock Quantity', 'Opening Stock'], kind: 'int' },
  { key: 'supplierName', header: 'Supplier', aliases: ['Supplier Name', 'Vendor'], kind: 'text' },
  { key: 'brand', header: 'Brand', aliases: ['Make', 'Manufacturer'], kind: 'text' },
  { key: 'leadTimeDays', header: 'Lead Time (Days)', aliases: ['Lead Time', 'LeadTimeDays', 'Lead Time Days'], kind: 'int' },
  { key: 'warranty', header: 'Warranty', aliases: ['Guarantee'], kind: 'text' },
];

const SUPPLIER_FIELDS: FieldDef[] = [
  { key: 'code', header: 'Supplier Code', aliases: ['SupplierCode', 'Code', 'Vendor Code'], required: true, kind: 'text' },
  { key: 'name', header: 'Supplier Name', aliases: ['Name', 'Supplier', 'Vendor', 'Company'], required: true, kind: 'text' },
  { key: 'category', header: 'Category', aliases: ['Group', 'Type'], kind: 'text' },
  { key: 'contactPerson', header: 'Contact Person', aliases: ['Contact', 'Contact Name'], kind: 'text' },
  { key: 'phone', header: 'Phone', aliases: ['Telephone', 'Mobile', 'Phone Number', 'Tel'], kind: 'text' },
  { key: 'email', header: 'Email', aliases: ['E-mail', 'Email Address', 'Mail'], kind: 'email' },
  { key: 'kraPin', header: 'KRA PIN', aliases: ['KRAPIN', 'PIN', 'KRA', 'Tax PIN'], kind: 'krapin' },
  { key: 'address', header: 'Address', aliases: ['Location', 'Street'], kind: 'text' },
  { key: 'city', header: 'City', aliases: ['Town', 'County'], kind: 'text' },
  { key: 'rating', header: 'Rating', aliases: ['Performance Rating', 'Stars', 'Score'], kind: 'rating' },
  { key: 'paymentTerms', header: 'Payment Terms', aliases: ['Terms', 'Credit Terms'], kind: 'text' },
];

const CLIENT_FIELDS: FieldDef[] = [
  { key: 'code', header: 'Client Code', aliases: ['ClientCode', 'Code', 'Customer Code'], required: true, kind: 'text' },
  { key: 'name', header: 'Client Name', aliases: ['Name', 'Client', 'Organization', 'Organisation', 'Customer'], required: true, kind: 'text' },
  { key: 'type', header: 'Client Type', aliases: ['Type', 'Category'], kind: 'enum', options: ['Government', 'County Government', 'Parastatal', 'Corporate', 'NGO'] },
  { key: 'company', header: 'Company', aliases: ['Company Name', 'Registered Name'], kind: 'text' },
  { key: 'contactPerson', header: 'Contact Person', aliases: ['Contact', 'Contact Name'], kind: 'text' },
  { key: 'phone', header: 'Phone', aliases: ['Telephone', 'Mobile', 'Phone Number', 'Tel'], kind: 'text' },
  { key: 'email', header: 'Email', aliases: ['E-mail', 'Email Address', 'Mail'], kind: 'email' },
  { key: 'kraPin', header: 'KRA PIN', aliases: ['KRAPIN', 'PIN', 'KRA', 'Tax PIN'], kind: 'krapin' },
  { key: 'address', header: 'Address', aliases: ['Location', 'Street'], kind: 'text' },
  { key: 'city', header: 'County', aliases: ['City', 'Town'], kind: 'text' },
  { key: 'country', header: 'Country', aliases: [], kind: 'text' },
  { key: 'paymentTerms', header: 'Payment Terms (Days)', aliases: ['Payment Terms', 'Terms', 'Credit Days'], kind: 'int' },
  { key: 'creditLimit', header: 'Credit Limit', aliases: ['CreditLimit', 'Credit Limit (KES)'], kind: 'money' },
];

const EMPLOYEE_FIELDS: FieldDef[] = [
  { key: 'code', header: 'Employee Code', aliases: ['EmployeeCode', 'Code', 'Staff Code', 'Payroll No'], required: true, kind: 'text' },
  { key: 'name', header: 'Full Name', aliases: ['Name', 'Employee Name', 'Staff Name', 'Employee'], required: true, kind: 'text' },
  { key: 'department', header: 'Department', aliases: ['Dept', 'Team', 'Section'], kind: 'text' },
  { key: 'role', header: 'Designation', aliases: ['Job Title', 'Position', 'Title'], kind: 'text' },
  { key: 'phone', header: 'Phone', aliases: ['Telephone', 'Mobile', 'Phone Number', 'Tel'], kind: 'text' },
  { key: 'email', header: 'Email', aliases: ['E-mail', 'Email Address', 'Mail'], kind: 'email' },
  { key: 'kraPin', header: 'KRA PIN', aliases: ['KRAPIN', 'PIN', 'KRA', 'Tax PIN'], kind: 'krapin' },
  { key: 'systemRole', header: 'System Role', aliases: ['SystemRole', 'Role', 'Access Level', 'Access'], kind: 'enum', options: ['Admin', 'Manager', 'Officer', 'Viewer'] },
  { key: 'hiredAt', header: 'Hire Date', aliases: ['Hired At', 'Start Date', 'Date Hired', 'Date Joined'], kind: 'date' },
  { key: 'status', header: 'Status', aliases: ['State'], kind: 'enum', options: ['Active', 'Inactive'] },
];

export const ENTITIES: Record<EntityKey, EntityDef> = {
  products: {
    key: 'products', label: 'Products / Parts', plural: 'products', icon: Package, codePrefix: 'FBV-ITM',
    fields: PRODUCT_FIELDS,
    requiredCaption: 'Required: Item Code, Description, Selling Price. Everything else is optional.',
    examples: [
      ['FBV-ITM-101', 'Office Chair', 'Furniture', 'Pcs', 6500, 9400, 16, 25, 'OfficeMart Kenya', 'ComfortSeating', 7, '1 year'],
      ['FBV-ITM-102', 'A4 Printing Paper 80gsm', 'Stationery', 'Ream', 450, 650, 16, 500, 'Text Book Centre', 'Double A', 2, '—'],
    ],
    dupKeys: ['code'],
    checks: [
      'Item Code is required and must not repeat inside the file',
      'Description is required',
      'Buying Price and Selling Price must be numbers, zero or more',
      'VAT Rate should be 0 or 16',
      'Lead Time (Days) must be a whole number',
    ],
  },
  suppliers: {
    key: 'suppliers', label: 'Suppliers', plural: 'suppliers', icon: Truck, codePrefix: 'FBV-SUP',
    fields: SUPPLIER_FIELDS,
    requiredCaption: 'Required: Supplier Code, Supplier Name. Everything else is optional.',
    examples: [
      ['FBV-SUP-101', 'TechWorks Ltd', 'ICT', 'John Kariuki', '+254 722 000 111', 'sales@techworks.co.ke', 'P051234000A', 'Westlands, Nairobi', 'Nairobi', 4, '30 days'],
      ['FBV-SUP-102', 'MedSupply EA', 'Medical', 'Alice Wambui', '+254 733 222 333', 'orders@medsupply.co.ke', 'P051234001B', 'Mombasa Road', 'Nairobi', 5, '45 days'],
    ],
    dupKeys: ['code', 'kraPin'],
    checks: [
      'Supplier Code is required and must not repeat inside the file',
      'Supplier Name is required',
      'KRA PIN looks like P000111222A',
      'Rating should be between 1 and 5',
    ],
  },
  clients: {
    key: 'clients', label: 'Clients', plural: 'clients', icon: Users, codePrefix: 'FBV-CLI',
    fields: CLIENT_FIELDS,
    requiredCaption: 'Required: Client Code, Client Name. Everything else is optional.',
    examples: [
      ['FBV-CLI-101', 'Ministry of Agriculture', 'Government', '—', 'Mary Wanjiru', '+254 20 271 8888', 'proc@agriculture.go.ke', 'P051235000B', 'Kilimo House, Cathedral Road', 'Nairobi', 'Kenya', 30, 500000],
      ['FBV-CLI-102', 'Kisumu Water Company', 'Parastatal', '—', 'Peter Ochieng', '+254 57 202 9999', 'tenders@kisumuwater.co.ke', 'P051235001C', 'Oginga Odinga Street', 'Kisumu', 'Kenya', 45, 250000],
    ],
    dupKeys: ['code', 'kraPin'],
    checks: [
      'Client Code is required and must not repeat inside the file',
      'Client Name is required',
      'KRA PIN looks like P000111222A',
      'Email must look like an email address',
      'Credit Limit must be a number',
    ],
  },
  employees: {
    key: 'employees', label: 'Employees', plural: 'employees', icon: IdCard, codePrefix: 'FBV-EMP',
    fields: EMPLOYEE_FIELDS,
    requiredCaption: 'Required: Employee Code, Full Name. Everything else is optional.',
    examples: [
      ['FBV-EMP-101', 'Jane Njoki', 'Tendering', 'Tender Officer', '+254 733 111 222', 'j.njoki@fbv.co.ke', 'A009999001Z', 'Officer', '2026-08-03', 'Active'],
      ['FBV-EMP-102', 'Peter Kamau', 'Finance', 'Accounts Assistant', '+254 722 444 555', 'p.kamau@fbv.co.ke', 'A009999002Y', 'Viewer', '27 Jul 2026', 'Active'],
    ],
    dupKeys: ['code', 'email'],
    checks: [
      'Employee Code is required and must not repeat inside the file',
      'Full Name is required',
      'Email must look like an email address and must not repeat',
      'System Role should be Admin, Manager, Officer or Viewer',
      'Hire Date should be a date like 27 Jul 2026 or 2026-07-27',
    ],
  },
};

export const ENTITY_ORDER: EntityKey[] = ['products', 'suppliers', 'clients', 'employees'];

/* ------------------------------------------------------------------ */
/* Template + export generation (SheetJS)                              */
/* ------------------------------------------------------------------ */

function aoaToSheet(aoa: (string | number)[][]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = (aoa[0] ?? []).map((h, i) => {
    const longest = Math.max(...aoa.map((r) => String(r[i] ?? '').length), String(h).length);
    return { wch: Math.min(Math.max(longest + 2, 10), 42) };
  });
  return ws;
}

function downloadWorkbook(wb: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(wb, filename, { compression: true });
}

export function downloadTemplate(def: EntityDef, fmt: 'xlsx' | 'csv') {
  const aoa: (string | number)[][] = [def.fields.map((f) => f.header), ...def.examples];
  if (fmt === 'csv') {
    const ws = aoaToSheet(aoa);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fbv-${def.key}-template.csv`;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, aoaToSheet(aoa), def.label.replace(' / Parts', ''));
  downloadWorkbook(wb, `fbv-${def.key}-template.xlsx`);
}

/** One .xlsx with all four template sheets. */
export function downloadAllTemplates() {
  const wb = XLSX.utils.book_new();
  ENTITY_ORDER.forEach((k) => {
    const def = ENTITIES[k];
    XLSX.utils.book_append_sheet(wb, aoaToSheet([def.fields.map((f) => f.header), ...def.examples]), def.label.replace(' / Parts', ''));
  });
  downloadWorkbook(wb, 'fbv-all-templates.xlsx');
}

/** Record → export row, using template headers (round-trip safe). */
export function recordToRow(def: EntityDef, rec: Record<string, unknown>): (string | number)[] {
  return def.fields.map((f) => {
    const v = rec[f.key];
    if (v == null) return '';
    if (f.kind === 'date') return String(v).slice(0, 10);
    return v as string | number;
  });
}

export function downloadEntityData(def: EntityDef, state: AppState) {
  const rows = (state[def.plural] as unknown as Record<string, unknown>[]).map((r) => recordToRow(def, r));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, aoaToSheet([def.fields.map((f) => f.header), ...rows]), def.label.replace(' / Parts', ''));
  downloadWorkbook(wb, `fbv-${def.key}-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function downloadAllData(state: AppState) {
  const wb = XLSX.utils.book_new();
  ENTITY_ORDER.forEach((k) => {
    const def = ENTITIES[k];
    const rows = (state[def.plural] as unknown as Record<string, unknown>[]).map((r) => recordToRow(def, r));
    XLSX.utils.book_append_sheet(wb, aoaToSheet([def.fields.map((f) => f.header), ...rows]), def.label.replace(' / Parts', ''));
  });
  downloadWorkbook(wb, `fbv-all-data-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/* ------------------------------------------------------------------ */
/* File parsing                                                        */
/* ------------------------------------------------------------------ */

export interface ParsedFile {
  fileName: string;
  fileSize: number;
  sheetNames: string[];
  sheet: string;
  grid: RawValue[][]; // raw grid incl. header row(s)
}

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB per design
const ACCEPT = /\.(xlsx|xls|csv)$/i;

export async function parseSpreadsheet(file: File): Promise<ParsedFile> {
  if (!ACCEPT.test(file.name)) {
    throw new Error("That file type isn't supported — please use Excel (.xlsx) or CSV");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 5 MB`);
  }
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { cellDates: true });
  if (wb.SheetNames.length === 0) throw new Error("We couldn't find any sheets in that file");
  const sheet = wb.SheetNames[0];
  const grid = XLSX.utils.sheet_to_json<RawValue[]>(wb.Sheets[sheet], { header: 1, defval: '', raw: true });
  return { fileName: file.name, fileSize: file.size, sheetNames: wb.SheetNames, sheet, grid };
}

export function gridForSheet(sheet: string, file: File): Promise<RawValue[][]> {
  return file.arrayBuffer().then((buf) => {
    const wb = XLSX.read(buf, { cellDates: true });
    return XLSX.utils.sheet_to_json<RawValue[]>(wb.Sheets[sheet], { header: 1, defval: '', raw: true });
  });
}

function cellText(v: RawValue): string {
  if (v == null) return '';
  if (v instanceof Date) return format(v, 'yyyy-MM-dd');
  return String(v).trim();
}

/** Split grid into headers + data rows; drops fully-empty rows. */
export function splitGrid(grid: RawValue[][], firstRowHeaders: boolean): { headers: string[]; rows: RawValue[][] } {
  const nonEmpty = grid.filter((r) => r.some((c) => cellText(c) !== ''));
  if (nonEmpty.length === 0) throw new Error("We couldn't find any rows in that file");
  if (!firstRowHeaders) {
    const width = Math.max(...nonEmpty.map((r) => r.length));
    return {
      headers: Array.from({ length: width }, (_, i) => `Column ${i + 1}`),
      rows: nonEmpty,
    };
  }
  const headers = (nonEmpty[0] ?? []).map((c, i) => cellText(c) || `Column ${i + 1}`);
  const rows = nonEmpty.slice(1);
  if (rows.length === 0) throw new Error("We couldn't find any rows in that file");
  return { headers, rows };
}

/* ------------------------------------------------------------------ */
/* Automatic column mapping                                            */
/* ------------------------------------------------------------------ */

export type Confidence = 'matched' | 'check' | 'none';

export interface ColumnMap {
  fileColumn: number;
  header: string;
  samples: string[]; // first 2 data-row values
  fieldKey: string; // '' = skip this column
  confidence: Confidence;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export function autoMapColumns(headers: string[], rows: RawValue[][], def: EntityDef): ColumnMap[] {
  return headers.map((header, fileColumn) => {
    const samples = rows.slice(0, 2).map((r) => cellText(r[fileColumn])).filter(Boolean);
    const n = norm(header);
    let fieldKey = '';
    let confidence: Confidence = 'none';
    if (n) {
      // exact match against header / alias / key
      const exact = def.fields.find((f) =>
        [f.header, f.key, ...f.aliases].some((a) => norm(a) === n));
      if (exact) {
        fieldKey = exact.key;
        confidence = 'matched';
      } else if (n.length >= 4) {
        // partial containment → needs a human check
        const partial = def.fields.find((f) =>
          [f.header, ...f.aliases].some((a) => {
            const na = norm(a);
            return na.length >= 4 && (na.includes(n) || n.includes(na));
          }));
        if (partial) {
          fieldKey = partial.key;
          confidence = 'check';
        }
      }
    }
    return { fileColumn, header, samples, fieldKey, confidence };
  });
}

export function unmappedRequired(mapping: ColumnMap[], def: EntityDef): FieldDef[] {
  const used = new Set(mapping.map((m) => m.fieldKey).filter(Boolean));
  return def.fields.filter((f) => f.required && !used.has(f.key));
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

const KRA_RE = /^[A-Z]\d{9}[A-Z]$/i;
const EMAIL_RE = /^\S+@\S+\.\S+$/;

function parseNum(v: RawValue): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[,KES\s]/gi, ''));
  return Number.isNaN(n) ? null : n;
}

export function parseDateValue(v: RawValue): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return isValid(v) ? format(v, 'yyyy-MM-dd') : null;
  if (typeof v === 'number') {
    const dc = XLSX.SSF.parse_date_code(v);
    return dc ? `${dc.y}-${String(dc.m).padStart(2, '0')}-${String(dc.d).padStart(2, '0')}` : null;
  }
  const s = String(v).trim();
  const iso = parseISO(s);
  if (isValid(iso) && /^\d{4}-\d{2}-\d{2}/.test(s)) return format(iso, 'yyyy-MM-dd');
  for (const fmt of ['d MMM yyyy', 'dd/MM/yyyy', 'd/M/yyyy', 'MM/dd/yyyy', 'd-M-yyyy', 'yyyy/MM/dd']) {
    const d = parse(s, fmt, new Date());
    if (isValid(d)) return format(d, 'yyyy-MM-dd');
  }
  return null;
}

function enumMatch(v: string, options: string[]): string | null {
  const n = v.trim().toLowerCase();
  return options.find((o) => o.toLowerCase() === n) ?? null;
}

/** Validate every data row against the entity rules + duplicates vs store. */
export function validateRows(
  def: EntityDef,
  mapping: ColumnMap[],
  rows: RawValue[][],
  state: AppState,
): ValidatedRow[] {
  const mapped = mapping.filter((m) => m.fieldKey);
  const existing = state[def.plural] as unknown as Record<string, unknown>[];
  const seen = new Map<string, number>(); // code → first row index (within-file dup)

  return rows.map((r, i) => {
    const raw: Record<string, RawValue> = {};
    mapped.forEach((m) => {
      raw[m.fieldKey] = r[m.fileColumn];
    });
    const issues: RowIssue[] = [];

    def.fields.forEach((f) => {
      const present = mapped.some((m) => m.fieldKey === f.key);
      if (!present) return; // unmapped optional columns aren't checked
      const v = raw[f.key];
      const text = cellText(v);
      const label = f.header;

      if (f.required && text === '') {
        issues.push({ field: f.key, message: `Missing ${label}` });
        return;
      }
      if (text === '') return; // optional + empty is fine

      switch (f.kind) {
        case 'money': {
          const n = parseNum(v);
          if (n == null) issues.push({ field: f.key, message: `${label} is not a number` });
          else if (n < 0) issues.push({ field: f.key, message: `${label} can't be negative` });
          break;
        }
        case 'int': {
          const n = parseNum(v);
          if (n == null || !Number.isInteger(n)) issues.push({ field: f.key, message: `${label} must be a whole number` });
          break;
        }
        case 'vat': {
          const n = parseNum(v);
          if (n !== 0 && n !== 16) issues.push({ field: f.key, message: 'VAT should be 0 or 16' });
          break;
        }
        case 'rating': {
          const n = parseNum(v);
          if (n == null || n < 1 || n > 5) issues.push({ field: f.key, message: 'Rating should be between 1 and 5' });
          break;
        }
        case 'email':
          if (!EMAIL_RE.test(text)) issues.push({ field: f.key, message: `${label} doesn't look right` });
          break;
        case 'krapin':
          if (!KRA_RE.test(text)) issues.push({ field: f.key, message: 'KRA PIN should look like P000111222A' });
          break;
        case 'enum':
          if (f.options && !enumMatch(text, f.options)) {
            issues.push({ field: f.key, message: `${label} should be ${f.options.join(', ').replace(/, ([^,]*)$/, ' or $1')}` });
          }
          break;
        case 'date':
          if (!parseDateValue(v)) issues.push({ field: f.key, message: `${label} should be a date` });
          break;
        default:
          break;
      }
    });

    // within-file code uniqueness
    const code = cellText(raw.code).toLowerCase();
    if (code) {
      const first = seen.get(code);
      if (first != null) {
        issues.push({ field: 'code', message: `Same ${def.fields[0].header} as row ${first}` });
      } else {
        seen.set(code, i + 1);
      }
    }

    // duplicates against existing records (skip rows that already have a code problem)
    let dup: DupMatch | null = null;
    for (const k of def.dupKeys) {
      const val = cellText(raw[k]).toLowerCase();
      if (!val) continue;
      const hit = existing.find((e) => String(e[k] ?? '').trim().toLowerCase() === val);
      if (hit) {
        dup = {
          existingId: String(hit.id),
          code: String(hit.code ?? ''),
          name: String(hit.name ?? ''),
        };
        break;
      }
    }

    return { index: i + 1, raw, issues, dup };
  });
}

/* ------------------------------------------------------------------ */
/* Record building (import)                                            */
/* ------------------------------------------------------------------ */

function phoneOf(v: RawValue): string {
  const t = cellText(v);
  if (!t) return '';
  if (t.startsWith('+')) return t;
  return `+254 ${t.replace(/^0/, '')}`;
}

/** Build the field patch for one validated row (used for add + update). */
export function buildPatch(def: EntityDef, raw: Record<string, RawValue>, filledOnly: boolean): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const keep = (key: string, v: unknown, emptyOk = false) => {
    if (v === undefined) return;
    if (filledOnly && !emptyOk && (v === '' || v == null)) return;
    patch[key] = v;
  };

  def.fields.forEach((f) => {
    const v = raw[f.key];
    const text = cellText(v);
    switch (f.kind) {
      case 'money':
      case 'vat':
      case 'rating':
        keep(f.key, text === '' ? undefined : (parseNum(v) ?? 0));
        break;
      case 'int':
        keep(f.key, text === '' ? undefined : (parseNum(v) ?? 0));
        break;
      case 'date': {
        const d = parseDateValue(v);
        keep(f.key, d ?? undefined);
        break;
      }
      case 'enum':
        keep(f.key, f.options ? (enumMatch(text, f.options) ?? undefined) : text);
        break;
      case 'krapin':
        keep(f.key, text.toUpperCase());
        break;
      case 'email':
        keep(f.key, text.toLowerCase());
        break;
      case 'text':
      default:
        if (f.key === 'unit') keep(f.key, text.toLowerCase());
        else if (f.key === 'phone') keep(f.key, phoneOf(v));
        else keep(f.key, text);
        break;
    }
  });
  return patch;
}

/** Create a full new store record for the entity from a validated row. */
export function buildRecord(def: EntityDef, raw: Record<string, RawValue>): Product | Supplier | Client | Employee {
  const patch = buildPatch(def, raw, false);
  const s = (k: string, dflt = '') => String(patch[k] ?? dflt);
  const n = (k: string, dflt = 0) => (typeof patch[k] === 'number' ? (patch[k] as number) : dflt);

  switch (def.key) {
    case 'products':
      return {
        id: uid('prd'), code: s('code'), name: s('name'), category: s('category', 'General'),
        unit: s('unit', 'pcs'), costPrice: n('costPrice'), sellingPrice: n('sellingPrice'),
        vatRate: patch.vatRate != null ? n('vatRate') : 16, stockQty: patch.stockQty != null ? n('stockQty') : undefined,
        status: 'Active', createdAt: nowISO(),
        supplierName: s('supplierName') || undefined,
        brand: s('brand') || undefined,
        leadTimeDays: patch.leadTimeDays != null ? n('leadTimeDays') : undefined,
        warranty: s('warranty') || undefined,
      } as Product;
    case 'suppliers':
      return {
        id: uid('sup'), code: s('code'), name: s('name'), category: s('category', 'General'),
        contactPerson: s('contactPerson'), email: s('email'), phone: s('phone'), kraPin: s('kraPin'),
        address: s('address'), city: s('city'), status: 'Active',
        rating: patch.rating != null ? n('rating') : undefined, createdAt: nowISO(),
        paymentTerms: s('paymentTerms') || undefined,
      } as Supplier;
    case 'clients':
      return {
        id: uid('cli'), code: s('code'), name: s('name'),
        type: (patch.type as Client['type']) ?? 'Corporate',
        contactPerson: s('contactPerson'), email: s('email'), phone: s('phone'), kraPin: s('kraPin'),
        address: s('address'), city: s('city'), status: 'Active', createdAt: nowISO(),
        company: s('company') || undefined,
        county: s('city') || undefined,
        country: s('country') || 'Kenya',
        paymentTerms: patch.paymentTerms != null ? n('paymentTerms') : undefined,
        creditLimit: patch.creditLimit != null ? n('creditLimit') : undefined,
      } as Client;
    case 'employees':
      return {
        id: uid('emp'), code: s('code'), name: s('name'),
        role: s('role'), department: s('department', 'Administration'),
        email: s('email'), phone: s('phone'), kraPin: s('kraPin'),
        status: (patch.status as Employee['status']) ?? 'Active',
        hiredAt: s('hiredAt') || nowISO().slice(0, 10),
        systemRole: patch.systemRole as EmployeeX['systemRole'],
      } as Employee;
  }
}

/* Extra schema-extension keys persisted on store items (see masterdata/types.ts). */
export type { ClientX, EmployeeX, ProductX, SupplierX };
