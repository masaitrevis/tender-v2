/**
 * Business Documents vault (DMS) — document kinds, classification and file helpers.
 *
 * The store's `DmsDocument` shape is intentionally small (6 broad `docType`s).
 * The design's richer 12-type shelf (KRA PIN, Tax Compliance, AGPO, NCA, ISO…)
 * is derived here from the document title + docType, so the store stays exact.
 */
import {
  FileBadge, ShieldCheck, Award, HardHat, Medal, ScrollText, IdCard,
  FileBarChart, Umbrella, Ticket, FileSignature, GraduationCap, File,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { DmsDocType, DmsDocument } from '@/lib/store';

export type DmsKind =
  | 'kra-pin' | 'tax-compliance' | 'agpo' | 'nca' | 'iso' | 'permit' | 'cr12'
  | 'financials' | 'insurance' | 'bid-bond' | 'contract' | 'certificate' | 'other';

export interface KindMeta {
  kind: DmsKind;
  label: string;
  icon: LucideIcon;
  /** Tile tint (hex) for icon tiles + card strips. */
  color: string;
  /** Store docType this kind maps to when saving. */
  docType: DmsDocType;
  defaultIssuer?: string;
  /** Kinds that normally have no expiry (toggle defaults on). */
  noExpiry?: boolean;
  hint?: string;
}

export const KINDS: KindMeta[] = [
  { kind: 'kra-pin', label: 'KRA PIN', icon: FileBadge, color: '#1F3B57', docType: 'registration', defaultIssuer: 'Kenya Revenue Authority', noExpiry: true },
  { kind: 'tax-compliance', label: 'Tax Compliance', icon: ShieldCheck, color: '#16A34A', docType: 'license', defaultIssuer: 'Kenya Revenue Authority', hint: "We'll remind you 30 days before it expires ✓" },
  { kind: 'agpo', label: 'AGPO', icon: Award, color: '#C9A227', docType: 'certification', defaultIssuer: 'National Treasury — AGPO', hint: "We'll remind you 30 days before it expires ✓" },
  { kind: 'nca', label: 'NCA', icon: HardHat, color: '#D97706', docType: 'registration', defaultIssuer: 'National Construction Authority' },
  { kind: 'iso', label: 'ISO', icon: Medal, color: '#7C3AED', docType: 'certification', defaultIssuer: 'Kenya Bureau of Standards' },
  { kind: 'permit', label: 'Business Permit', icon: ScrollText, color: '#2563EB', docType: 'permit', defaultIssuer: 'County Government', hint: "We'll remind you 30 days before it expires ✓" },
  { kind: 'cr12', label: 'CR12', icon: IdCard, color: '#0F2438', docType: 'registration', defaultIssuer: 'Business Registration Service', noExpiry: true },
  { kind: 'financials', label: 'Audited Financials', icon: FileBarChart, color: '#2A4A6B', docType: 'other', defaultIssuer: 'External Auditor', noExpiry: true },
  { kind: 'insurance', label: 'Insurance', icon: Umbrella, color: '#DC2626', docType: 'insurance', defaultIssuer: 'Insurance Provider', hint: "We'll remind you 30 days before it expires ✓" },
  { kind: 'bid-bond', label: 'Bid Bonds', icon: Ticket, color: '#D97706', docType: 'other', defaultIssuer: 'Bank / Insurance' },
  { kind: 'contract', label: 'Contracts', icon: FileSignature, color: '#1F3B57', docType: 'other' },
  { kind: 'certificate', label: 'Certificates', icon: GraduationCap, color: '#16A34A', docType: 'certification' },
  { kind: 'other', label: 'Other', icon: File, color: '#64748B', docType: 'other' },
];

export function kindMeta(kind: DmsKind): KindMeta {
  return KINDS.find((k) => k.kind === kind) ?? KINDS[KINDS.length - 1];
}

const TITLE_RULES: Array<[RegExp, DmsKind]> = [
  [/kra\s*pin/i, 'kra-pin'],
  [/tax\s*compliance|tcc/i, 'tax-compliance'],
  [/agpo/i, 'agpo'],
  [/nca|construction\s*authority/i, 'nca'],
  [/iso\s*\d|qms/i, 'iso'],
  [/permit/i, 'permit'],
  [/cr\s*12|cr12/i, 'cr12'],
  [/financial|audited/i, 'financials'],
  [/insurance|wiba|indemnity|policy/i, 'insurance'],
  [/bid\s*bond|bond/i, 'bid-bond'],
  [/contract|agreement/i, 'contract'],
  [/certificate|certification|training/i, 'certificate'],
];

const DOCTYPE_FALLBACK: Record<DmsDocType, DmsKind> = {
  license: 'permit',
  certification: 'certificate',
  permit: 'permit',
  registration: 'cr12',
  insurance: 'insurance',
  other: 'other',
};

/** Classify a stored document into a display kind (title first, docType fallback). */
export function kindForDoc(doc: Pick<DmsDocument, 'title' | 'docType'>): DmsKind {
  for (const [re, kind] of TITLE_RULES) {
    if (re.test(doc.title)) return kind;
  }
  return DOCTYPE_FALLBACK[doc.docType];
}

/* ------------------------------ file helpers ------------------------------ */

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp)$/i;
const PDF_EXT = /\.pdf$/i;

export function isImage(fileName: string): boolean {
  return IMAGE_EXT.test(fileName);
}
export function isPdf(fileName: string): boolean {
  return PDF_EXT.test(fileName);
}

export function mimeOf(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', pdf: 'application/pdf',
  };
  return map[ext] ?? 'application/octet-stream';
}

/** Base64 payload → data URL (null when no file stored, e.g. seeded rows). */
export function dataUrlOf(doc: Pick<DmsDocument, 'fileName' | 'fileData'>): string | null {
  if (!doc.fileData) return null;
  return `data:${mimeOf(doc.fileName)};base64,${doc.fileData}`;
}

/** Approximate decoded size of a base64 payload, e.g. `412 KB`. */
export function fileSizeText(fileData: string): string {
  if (!fileData) return '—';
  const bytes = Math.round((fileData.length * 3) / 4);
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function base64ToBlob(base64: string, mime: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Open an object URL for a stored file (preview/download). */
export function openObjectUrl(doc: Pick<DmsDocument, 'fileName' | 'fileData'>): string | null {
  if (!doc.fileData) return null;
  const blob = base64ToBlob(doc.fileData, mimeOf(doc.fileName));
  return URL.createObjectURL(blob);
}

export function downloadDoc(doc: Pick<DmsDocument, 'fileName' | 'fileData' | 'title'>): void {
  const url = openObjectUrl(doc);
  if (!url) return;
  const a = document.createElement('a');
  a.href = url;
  a.download = doc.fileName || `${doc.title}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** `v2.0` → `v3.0` version bump on file replacement. */
export function bumpVersion(version: string): string {
  const m = /v(\d+)/i.exec(version);
  if (!m) return 'v2.0';
  return `v${parseInt(m[1], 10) + 1}.0`;
}
