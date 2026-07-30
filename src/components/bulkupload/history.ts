/**
 * Import history for the Bulk Upload Centre. The central store schema has no
 * import-history collection (store.ts is outside this scope), so history is
 * persisted in its own localStorage key and seeded with 3 demo rows so the
 * page never looks empty.
 */
import type { EntityKey } from './entities';

export interface ImportOutcome {
  row: number;
  status: 'added' | 'updated' | 'skipped' | 'failed';
  detail: string;
}

export interface ImportRecord {
  id: string;
  fileName: string;
  entity: EntityKey;
  rows: number;
  added: number;
  updated: number;
  skipped: number;
  failed: number;
  by: string;
  date: string; // ISO
  outcomes?: ImportOutcome[]; // capped for storage
}

const KEY = 'fbv-bulk-import-history-v1';

function seed(): ImportRecord[] {
  return [
    {
      id: 'imp-003', fileName: 'products-july-restock.xlsx', entity: 'products', rows: 34,
      added: 32, updated: 0, skipped: 2, failed: 0, by: 'Admin User', date: '2026-07-24T14:22:00',
    },
    {
      id: 'imp-002', fileName: 'new-suppliers-q3.xlsx', entity: 'suppliers', rows: 12,
      added: 10, updated: 1, skipped: 1, failed: 0, by: 'Caroline Wanjiru', date: '2026-07-18T09:41:00',
    },
    {
      id: 'imp-001', fileName: 'county-clients.csv', entity: 'clients', rows: 48,
      added: 0, updated: 0, skipped: 0, failed: 48, by: 'Admin User', date: '2026-07-09T16:05:00',
    },
  ];
}

export function loadHistory(): ImportRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as ImportRecord[];
  } catch { /* corrupted — reseed */ }
  const s = seed();
  saveHistory(s);
  return s;
}

export function saveHistory(records: ImportRecord[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(records.slice(0, 50)));
  } catch { /* quota — drop outcomes and retry */ }
}

export function appendHistory(rec: ImportRecord): ImportRecord[] {
  const next = [rec, ...loadHistory()].slice(0, 50);
  saveHistory(next);
  return next;
}

export function lastImportCaption(records: ImportRecord[], entity: EntityKey): string {
  const hit = records.find((r) => r.entity === entity);
  if (!hit) return 'No imports yet';
  const d = new Date(hit.date);
  const when = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const bits: string[] = [];
  if (hit.added) bits.push(`${hit.added} added`);
  if (hit.updated) bits.push(`${hit.updated} updated`);
  if (!bits.length) bits.push(hit.failed ? `${hit.failed} failed` : '0 added');
  return `Last import: ${when} · ${bits.join(', ')}`;
}
