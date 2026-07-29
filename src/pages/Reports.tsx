/**
 * Reports — /reports
 * Report catalog (3-col card grid) + report runner drawer with live preview,
 * print (letterhead window), Excel export (SheetJS) and CSV export.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  FolderKanban, Trophy, TrendingUp, Banknote, Receipt, BookUser, ShieldCheck,
  Landmark, Truck, IdCard, ScrollText, ArrowRight, Printer, FileSpreadsheet,
  FileDown, Loader2, Play,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  useStore, daysUntil, alertLevel, nowISO,
  type AppState,
} from '@/lib/store';
import { formatKES, formatDate, formatDateTime } from '@/lib/format';
import { PageHeader, Drawer, SelectInput, NewPill } from '@/components/shared';
import { cn } from '@/lib/utils';

/* ================= report model ================= */

type Domain = 'tenders' | 'financial' | 'compliance' | 'operations';

interface Column {
  key: string;
  label: string;
  money?: boolean;
  mono?: boolean;
  right?: boolean;
}
type Row = (string | number)[];
interface ReportData {
  columns: Column[];
  rows: Row[];
  totals?: Row;
}
interface Params {
  clientId: string; // 'all' | id
  status: string; // 'all' | status
  period: string; // 'all' | 'month' | 'quarter' | 'year'
  groupBy: string; // 'none' | column key
  columns: string[]; // visible column keys
}

interface ReportDef {
  id: string;
  name: string;
  description: string;
  domain: Domain;
  icon: LucideIcon;
  isNew?: boolean;
  groupOptions: { value: string; label: string }[];
  build: (s: AppState, p: Params) => ReportData;
}

const DOMAIN_TILE: Record<Domain, string> = {
  tenders: 'bg-info-soft text-info',
  financial: 'bg-success-soft text-success',
  compliance: 'bg-gold-soft text-gold',
  operations: 'bg-[#E4EBF4] text-navy-800',
};

/* Period cutoff helper */
function periodFrom(period: string): string | null {
  if (period === 'month') return '2026-07-01';
  if (period === 'quarter') return '2026-05-01';
  if (period === 'year') return '2026-01-01';
  return null;
}
const inPeriod = (iso: string | undefined, period: string) => {
  const cut = periodFrom(period);
  if (!cut || !iso) return true;
  return iso.slice(0, 10) >= cut;
};

const clientName = (s: AppState, id: string) => s.clients.find((c) => c.id === id)?.name ?? '—';

/** Group + aggregate numeric columns when groupBy is set. */
function applyGrouping(data: ReportData, groupBy: string): ReportData {
  if (groupBy === 'none') return data;
  const gi = data.columns.findIndex((c) => c.key === groupBy);
  if (gi < 0) return data;
  const groups = new Map<string, Row[]>();
  data.rows.forEach((r) => {
    const key = String(r[gi]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  });
  const rows: Row[] = [];
  [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([name, rs]) => {
    const row: Row = data.columns.map((c, i) => {
      if (i === gi) return name;
      if (c.money) return rs.reduce((a, r) => a + (typeof r[i] === 'number' ? (r[i] as number) : 0), 0);
      if (i === 0) return `${rs.length} rows`;
      return '';
    });
    rows.push(row);
  });
  return { columns: data.columns, rows, totals: data.totals };
}

/* ================= report builders ================= */

const REPORTS: ReportDef[] = [
  {
    id: 'tender-summary',
    name: 'Tender Summary Report',
    description: 'Full tender register with client, status, value and submission deadlines.',
    domain: 'tenders',
    icon: FolderKanban,
    groupOptions: [
      { value: 'none', label: 'No grouping' },
      { value: 'status', label: 'Group by status' },
      { value: 'client', label: 'Group by client' },
      { value: 'category', label: 'Group by category' },
    ],
    build: (s, p) => {
      const rows = s.tenders
        .filter((t) => (p.clientId === 'all' || t.clientId === p.clientId) && (p.status === 'all' || t.status === p.status) && inPeriod(t.publishedDate, p.period))
        .map((t): Row => [t.refNo, t.title, clientName(s, t.clientId), t.category, t.status, t.value, formatDate(t.submissionDeadline)]);
      return {
        columns: [
          { key: 'ref', label: 'Ref No', mono: true },
          { key: 'title', label: 'Tender' },
          { key: 'client', label: 'Client' },
          { key: 'category', label: 'Category' },
          { key: 'status', label: 'Status' },
          { key: 'value', label: 'Value', money: true, right: true },
          { key: 'deadline', label: 'Deadline' },
        ],
        rows,
        totals: ['', `${rows.length} tenders`, '', '', '', rows.reduce((a, r) => a + (r[5] as number), 0), ''],
      };
    },
  },
  {
    id: 'win-loss',
    name: 'Win/Loss Analysis',
    description: 'Decided tenders — win rate, values at stake and days from submission to award.',
    domain: 'tenders',
    icon: Trophy,
    groupOptions: [
      { value: 'none', label: 'No grouping' },
      { value: 'status', label: 'Group by outcome' },
      { value: 'client', label: 'Group by client' },
    ],
    build: (s, p) => {
      const rows = s.tenders
        .filter((t) => (t.status === 'Won' || t.status === 'Lost') && (p.clientId === 'all' || t.clientId === p.clientId) && (p.status === 'all' || t.status === p.status) && inPeriod(t.submissionDeadline, p.period))
        .map((t): Row => [
          t.refNo, t.title, clientName(s, t.clientId), t.status, t.value,
          t.awardDate ? Math.max(0, daysUntil(t.awardDate, t.submissionDeadline)) : '—',
        ]);
      const won = s.tenders.filter((t) => t.status === 'Won');
      const lost = s.tenders.filter((t) => t.status === 'Lost');
      const rate = won.length + lost.length ? Math.round((won.length / (won.length + lost.length)) * 100) : 0;
      return {
        columns: [
          { key: 'ref', label: 'Ref No', mono: true },
          { key: 'title', label: 'Tender' },
          { key: 'client', label: 'Client' },
          { key: 'status', label: 'Outcome' },
          { key: 'value', label: 'Value', money: true, right: true },
          { key: 'days', label: 'Days to Award', right: true },
        ],
        rows,
        totals: ['', `Win rate ${rate}%`, '', `${won.length}W · ${lost.length}L`, rows.reduce((a, r) => a + (r[4] as number), 0), ''],
      };
    },
  },
  {
    id: 'pipeline-forecast',
    name: 'Pipeline Forecast',
    description: 'Active pipeline probability-weighted (Open 50% · Submitted 70% · Under Evaluation 60%).',
    domain: 'tenders',
    icon: TrendingUp,
    groupOptions: [
      { value: 'none', label: 'No grouping' },
      { value: 'status', label: 'Group by stage' },
      { value: 'client', label: 'Group by client' },
    ],
    build: (s, p) => {
      const weight: Record<string, number> = { Open: 0.5, Submitted: 0.7, 'Under Evaluation': 0.6 };
      const rows = s.tenders
        .filter((t) => weight[t.status] != null && (p.clientId === 'all' || t.clientId === p.clientId) && (p.status === 'all' || t.status === p.status))
        .map((t): Row => [t.refNo, t.title, clientName(s, t.clientId), t.status, t.value, `${Math.round(weight[t.status] * 100)}%`, Math.round(t.value * weight[t.status])]);
      return {
        columns: [
          { key: 'ref', label: 'Ref No', mono: true },
          { key: 'title', label: 'Tender' },
          { key: 'client', label: 'Client' },
          { key: 'status', label: 'Stage' },
          { key: 'value', label: 'Value', money: true, right: true },
          { key: 'prob', label: 'Probability', right: true },
          { key: 'expected', label: 'Expected', money: true, right: true },
        ],
        rows,
        totals: ['', 'Expected revenue', '', '', rows.reduce((a, r) => a + (r[4] as number), 0), '', rows.reduce((a, r) => a + (r[6] as number), 0)],
      };
    },
  },
  {
    id: 'revenue-collections',
    name: 'Revenue & Collections',
    description: 'All invoices with amounts billed, collected and outstanding balances.',
    domain: 'financial',
    icon: Banknote,
    groupOptions: [
      { value: 'none', label: 'No grouping' },
      { value: 'client', label: 'Group by client' },
      { value: 'status', label: 'Group by status' },
    ],
    build: (s, p) => {
      const rows = s.documents
        .filter((d) => d.type === 'invoice' && (p.clientId === 'all' || d.clientId === p.clientId) && (p.status === 'all' || d.status === p.status) && inPeriod(d.issueDate, p.period))
        .map((d): Row => {
          const paid = d.status === 'Paid' ? d.total : d.amountPaid;
          return [d.docNo, clientName(s, d.clientId), formatDate(d.issueDate), formatDate(d.dueDate), Math.round(d.total), Math.round(paid), Math.round(Math.max(0, d.total - paid)), d.status];
        });
      return {
        columns: [
          { key: 'ref', label: 'Invoice No', mono: true },
          { key: 'client', label: 'Client' },
          { key: 'issue', label: 'Issued' },
          { key: 'due', label: 'Due' },
          { key: 'total', label: 'Total', money: true, right: true },
          { key: 'paid', label: 'Collected', money: true, right: true },
          { key: 'balance', label: 'Balance', money: true, right: true },
          { key: 'status', label: 'Status' },
        ],
        rows,
        totals: ['', `${rows.length} invoices`, '', '', rows.reduce((a, r) => a + (r[4] as number), 0), rows.reduce((a, r) => a + (r[5] as number), 0), rows.reduce((a, r) => a + (r[6] as number), 0), ''],
      };
    },
  },
  {
    id: 'aged-debtors',
    name: 'Outstanding Invoices (Aging)',
    description: 'Aged debtors — open balances bucketed Current / 1–30 / 31–60 / 60+ days.',
    domain: 'financial',
    icon: Receipt,
    groupOptions: [
      { value: 'none', label: 'No grouping' },
      { value: 'client', label: 'Group by client' },
      { value: 'bucket', label: 'Group by bucket' },
    ],
    build: (s, p) => {
      const rows = s.documents
        .filter((d) => d.type === 'invoice' && d.status !== 'Paid' && d.status !== 'Cancelled' && (p.clientId === 'all' || d.clientId === p.clientId))
        .map((d): Row => {
          const paid = d.amountPaid;
          const bal = Math.round(Math.max(0, d.total - paid));
          const od = d.dueDate ? -daysUntil(d.dueDate) : 0;
          const bucket = od <= 0 ? 'Current' : od <= 30 ? '1–30 days' : od <= 60 ? '31–60 days' : '60+ days';
          return [d.docNo, clientName(s, d.clientId), formatDate(d.dueDate), od > 0 ? od : 0, bucket, bal];
        })
        .sort((a, b) => (b[3] as number) - (a[3] as number));
      return {
        columns: [
          { key: 'ref', label: 'Invoice No', mono: true },
          { key: 'client', label: 'Client' },
          { key: 'due', label: 'Due Date' },
          { key: 'days', label: 'Days Overdue', right: true },
          { key: 'bucket', label: 'Bucket' },
          { key: 'balance', label: 'Balance', money: true, right: true },
        ],
        rows,
        totals: ['', `${rows.length} open`, '', '', '', rows.reduce((a, r) => a + (r[5] as number), 0)],
      };
    },
  },
  {
    id: 'client-statement',
    name: 'Client Statement',
    description: 'Per-client billed, collected and outstanding totals for the selected period.',
    domain: 'financial',
    icon: BookUser,
    groupOptions: [{ value: 'none', label: 'No grouping' }],
    build: (s, p) => {
      const rows = s.clients
        .filter((c) => p.clientId === 'all' || c.id === p.clientId)
        .map((c): Row | null => {
          const invs = s.documents.filter((d) => d.type === 'invoice' && d.clientId === c.id && inPeriod(d.issueDate, p.period));
          if (!invs.length && p.clientId === 'all') return null;
          const billed = invs.reduce((a, d) => a + d.total, 0);
          const collected = invs.reduce((a, d) => a + (d.status === 'Paid' ? d.total : d.amountPaid), 0);
          return [c.code, c.name, c.type, invs.length, Math.round(billed), Math.round(collected), Math.round(Math.max(0, billed - collected))];
        })
        .filter((r): r is Row => r != null);
      return {
        columns: [
          { key: 'ref', label: 'Code', mono: true },
          { key: 'client', label: 'Client' },
          { key: 'type', label: 'Type' },
          { key: 'count', label: 'Invoices', right: true },
          { key: 'billed', label: 'Billed', money: true, right: true },
          { key: 'collected', label: 'Collected', money: true, right: true },
          { key: 'balance', label: 'Balance', money: true, right: true },
        ],
        rows,
        totals: ['', 'All clients', '', rows.reduce((a, r) => a + (r[3] as number), 0), rows.reduce((a, r) => a + (r[4] as number), 0), rows.reduce((a, r) => a + (r[5] as number), 0), rows.reduce((a, r) => a + (r[6] as number), 0)],
      };
    },
  },
  {
    id: 'doc-expiry',
    name: 'Document Expiry Report',
    description: 'All licences & certs with expiry status — Business Documents vault (DMS).',
    domain: 'compliance',
    icon: ShieldCheck,
    isNew: true,
    groupOptions: [
      { value: 'none', label: 'No grouping' },
      { value: 'type', label: 'Group by type' },
      { value: 'status', label: 'Group by status' },
    ],
    build: (s, p) => {
      const rows = s.dms
        .map((d): Row => {
          const lvl = alertLevel(d.expiryDate, s.settings);
          const status = d.expiryDate ? (lvl === 'EXPIRED' ? 'Expired' : lvl === 'CRITICAL' ? 'Critical' : lvl === 'WARNING' ? 'Warning' : 'Valid') : 'No Expiry';
          return [d.refNo, d.title, d.docType, d.issuer, formatDate(d.issueDate), d.expiryDate ? formatDate(d.expiryDate) : '—', d.expiryDate ? daysUntil(d.expiryDate) : '—', status];
        })
        .filter((r) => p.status === 'all' || r[7] === p.status)
        .sort((a, b) => (typeof a[6] === 'number' && typeof b[6] === 'number' ? (a[6] as number) - (b[6] as number) : 0));
      return {
        columns: [
          { key: 'ref', label: 'Ref No', mono: true },
          { key: 'title', label: 'Document' },
          { key: 'type', label: 'Type' },
          { key: 'issuer', label: 'Issuer' },
          { key: 'issue', label: 'Issued' },
          { key: 'expiry', label: 'Expires' },
          { key: 'days', label: 'Days Left', right: true },
          { key: 'status', label: 'Status' },
        ],
        rows,
        totals: ['', `${rows.length} documents`, '', '', '', '', '', ''],
      };
    },
  },
  {
    id: 'bond-exposure',
    name: 'Bid Bond Exposure',
    description: 'Bid bonds, performance bonds and guarantees — amounts at risk by bank.',
    domain: 'compliance',
    icon: Landmark,
    groupOptions: [
      { value: 'none', label: 'No grouping' },
      { value: 'status', label: 'Group by status' },
      { value: 'kind', label: 'Group by kind' },
    ],
    build: (s, p) => {
      const rows = s.bonds
        .filter((b) => (p.status === 'all' || b.status === p.status) && inPeriod(b.issueDate, p.period))
        .map((b): Row => [b.refNo, b.kind, b.issuer, b.tenderTitle, Math.round(b.amount), formatDate(b.expiryDate), daysUntil(b.expiryDate), b.status]);
      return {
        columns: [
          { key: 'ref', label: 'Ref No', mono: true },
          { key: 'kind', label: 'Kind' },
          { key: 'issuer', label: 'Issuer' },
          { key: 'tender', label: 'Tender' },
          { key: 'amount', label: 'Amount', money: true, right: true },
          { key: 'expiry', label: 'Expiry' },
          { key: 'days', label: 'Days Left', right: true },
          { key: 'status', label: 'Status' },
        ],
        rows,
        totals: ['', `${rows.length} instruments`, '', '', rows.reduce((a, r) => a + (r[4] as number), 0), '', '', ''],
      };
    },
  },
  {
    id: 'supplier-performance',
    name: 'Supplier Performance',
    description: 'Purchase-order spend, order counts and rating per supplier.',
    domain: 'operations',
    icon: Truck,
    groupOptions: [
      { value: 'none', label: 'No grouping' },
      { value: 'category', label: 'Group by category' },
    ],
    build: (s) => {
      const rows = s.suppliers.map((sup): Row => {
        const pos = s.documents.filter((d) => d.type === 'purchase-order' && d.clientId === sup.id);
        const spend = pos.reduce((a, d) => a + d.total, 0);
        return [sup.code, sup.name, sup.category, pos.length, Math.round(spend), sup.rating ? '★'.repeat(sup.rating) : '—', sup.status];
      });
      return {
        columns: [
          { key: 'ref', label: 'Code', mono: true },
          { key: 'supplier', label: 'Supplier' },
          { key: 'category', label: 'Category' },
          { key: 'orders', label: 'POs', right: true },
          { key: 'spend', label: 'Spend', money: true, right: true },
          { key: 'rating', label: 'Rating' },
          { key: 'status', label: 'Status' },
        ],
        rows,
        totals: ['', `${rows.length} suppliers`, '', rows.reduce((a, r) => a + (r[3] as number), 0), rows.reduce((a, r) => a + (r[4] as number), 0), '', ''],
      };
    },
  },
  {
    id: 'employee-workload',
    name: 'Employee Workload',
    description: 'Activity volume per employee — audit actions and recent-activity entries.',
    domain: 'operations',
    icon: IdCard,
    groupOptions: [
      { value: 'none', label: 'No grouping' },
      { value: 'department', label: 'Group by department' },
    ],
    build: (s) => {
      const rows = s.employees.map((e): Row => {
        const actions = s.audit.filter((a) => a.user === e.name).length;
        const activity = s.activity.filter((a) => a.user === e.name).length;
        return [e.code, e.name, e.department, e.role, actions + activity, e.status];
      }).sort((a, b) => (b[4] as number) - (a[4] as number));
      return {
        columns: [
          { key: 'ref', label: 'Code', mono: true },
          { key: 'employee', label: 'Employee' },
          { key: 'department', label: 'Department' },
          { key: 'role', label: 'Role' },
          { key: 'actions', label: 'Logged Actions', right: true },
          { key: 'status', label: 'Status' },
        ],
        rows,
        totals: ['', `${rows.length} employees`, '', '', rows.reduce((a, r) => a + (r[4] as number), 0), ''],
      };
    },
  },
  {
    id: 'audit-extract',
    name: 'Full Audit Extract',
    description: 'Complete audit trail — every create, update and delete with user and timestamp.',
    domain: 'operations',
    icon: ScrollText,
    groupOptions: [
      { value: 'none', label: 'No grouping' },
      { value: 'entity', label: 'Group by entity' },
      { value: 'user', label: 'Group by user' },
    ],
    build: (s, p) => {
      const rows = s.audit
        .filter((a) => inPeriod(a.timestamp, p.period))
        .map((a): Row => [formatDateTime(a.timestamp), a.user, a.action, a.entity, a.entityRef, a.details]);
      return {
        columns: [
          { key: 'ts', label: 'Timestamp' },
          { key: 'user', label: 'User' },
          { key: 'action', label: 'Action' },
          { key: 'entity', label: 'Entity' },
          { key: 'ref', label: 'Ref', mono: true },
          { key: 'details', label: 'Details' },
        ],
        rows,
        totals: [`${rows.length} entries`, '', '', '', '', ''],
      };
    },
  },
];

const LASTRUN_KEY = 'fbv-report-lastrun';
function loadLastRun(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(LASTRUN_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

/* ================= exports ================= */

function dataToAOA(data: ReportData): (string | number)[][] {
  const head = data.columns.map((c) => c.label);
  const out: (string | number)[][] = [head, ...data.rows];
  if (data.totals) out.push(data.totals.map((c) => (typeof c === 'number' ? c : String(c))));
  return out;
}

function downloadBlob(content: string | Blob, filename: string, type: string) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function exportXlsx(report: ReportDef, data: ReportData) {
  const ws = XLSX.utils.aoa_to_sheet(dataToAOA(data));
  ws['!cols'] = data.columns.map((c) => ({ wch: Math.max(12, c.label.length + 4) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  XLSX.writeFile(wb, `${report.id}.xlsx`);
}

function exportCsv(report: ReportDef, data: ReportData) {
  const ws = XLSX.utils.aoa_to_sheet(dataToAOA(data));
  downloadBlob(XLSX.utils.sheet_to_csv(ws), `${report.id}.csv`, 'text/csv;charset=utf-8');
}

/** Print via a letterhead window (A4 landscape for wide reports). */
function printReport(state: AppState, report: ReportDef, data: ReportData, periodLabel: string) {
  const prof = state.profile;
  const wide = data.columns.length > 6;
  const cell = (v: string | number, money?: boolean, right?: boolean, mono?: boolean) =>
    `<td style="padding:5px 8px;border-bottom:1px solid #EEF1F5;text-align:${right ? 'right' : 'left'};${mono ? "font-family:'JetBrains Mono',monospace;font-size:11px;" : ''}">${typeof v === 'number' ? (money ? formatKES(v, { decimals: 0 }) : v) : v}</td>`;
  const html = `<!doctype html><html><head><title>${report.name}</title><style>
    @page { size: A4 ${wide ? 'landscape' : 'portrait'}; margin: 18mm; }
    body { font-family: Inter, system-ui, sans-serif; color: #1A2B3C; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    table { border-collapse: collapse; width: 100%; font-size: 12px; }
  </style></head><body>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #C9A227;padding-bottom:12px;">
      <div>
        <div style="font-size:18px;font-weight:700;color:#1F3B57;">${prof.name}</div>
        <div style="font-size:11px;color:#5B6B7C;">${prof.address}, ${prof.city}, ${prof.country} · ${prof.phone} · ${prof.email}</div>
        <div style="font-size:11px;color:#5B6B7C;">KRA PIN ${prof.kraPin}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:15px;font-weight:600;color:#1F3B57;">${report.name}</div>
        <div style="font-size:11px;color:#5B6B7C;">Period: ${periodLabel}</div>
        <div style="font-size:11px;color:#8494A7;">Generated ${formatDateTime(nowISO())} by ${state.users[0]?.name ?? 'Admin User'}</div>
      </div>
    </div>
    <table style="margin-top:14px;">
      <thead><tr>${data.columns.map((c) => `<th style="text-align:${c.right ? 'right' : 'left'};padding:6px 8px;background:#F8FAFC;border-bottom:2px solid #E4E9F0;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#8494A7;">${c.label}</th>`).join('')}</tr></thead>
      <tbody>${data.rows.map((r) => `<tr>${r.map((v, i) => cell(v, data.columns[i].money, data.columns[i].right, data.columns[i].mono)).join('')}</tr>`).join('')}</tbody>
      ${data.totals ? `<tfoot><tr>${data.totals.map((v, i) => `<td style="padding:6px 8px;border-top:2px solid #1F3B57;font-weight:700;text-align:${data.columns[i].right ? 'right' : 'left'};">${typeof v === 'number' ? (data.columns[i].money ? formatKES(v, { decimals: 0 }) : v) : v}</td>`).join('')}</tr></tfoot>` : ''}
    </table>
    <div style="margin-top:16px;font-size:10px;color:#8494A7;">FBV Tender &amp; Contract Management System v2.0 — computer-generated report.</div>
    <script>window.onload = () => { window.print(); };</script>
  </body></html>`;
  const w = window.open('', '_blank', 'width=1000,height=700');
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

/* ================= page ================= */

const PERIOD_OPTIONS = [
  { value: 'year', label: 'This Year' },
  { value: 'quarter', label: 'This Quarter' },
  { value: 'month', label: 'This Month' },
  { value: 'all', label: 'All Time' },
];
const PERIOD_LABEL: Record<string, string> = { year: 'This Year (2026)', quarter: 'This Quarter (May–Jul 2026)', month: 'This Month (Jul 2026)', all: 'All Time' };

export default function Reports() {
  const [period, setPeriod] = useState('year');
  const [lastRun, setLastRun] = useState<Record<string, string>>(loadLastRun);
  const [active, setActive] = useState<ReportDef | null>(null);

  const runReport = (r: ReportDef) => {
    setActive(r);
    const stamp = nowISO();
    const next = { ...loadLastRun(), [r.id]: stamp };
    try {
      localStorage.setItem(LASTRUN_KEY, JSON.stringify(next));
    } catch { /* ignore */ }
    setLastRun(next);
  };

  const domains: { key: Domain; label: string }[] = [
    { key: 'tenders', label: 'Tenders' },
    { key: 'financial', label: 'Financial' },
    { key: 'compliance', label: 'Compliance' },
    { key: 'operations', label: 'Operations' },
  ];

  return (
    <div className="px-7 pb-8 pt-6">
      <PageHeader
        title="Reports"
        subtitle="Generate, print and export business reports."
        actions={
          <div className="w-44">
            <SelectInput value={period} onChange={(e) => setPeriod(e.target.value)} options={PERIOD_OPTIONS} aria-label="Report period" />
          </div>
        }
      />

      {domains.map((d) => (
        <div key={d.key} className="mb-7">
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-app-slate">{d.label}</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {REPORTS.filter((r) => r.domain === d.key).map((r, i) => (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: 'easeOut', delay: i * 0.05 }}
                className="group flex flex-col rounded-xl border border-app-border bg-app-card p-4 shadow-card transition-all duration-150 hover:-translate-y-0.5 hover:shadow-card-hover"
              >
                <div className="flex items-start justify-between">
                  <span className={cn('flex h-10 w-10 items-center justify-center rounded-lg', DOMAIN_TILE[r.domain])}>
                    <r.icon size={19} />
                  </span>
                  {r.isNew && <NewPill />}
                </div>
                <h3 className="mt-3 text-[15px] font-semibold text-app-ink">{r.name}</h3>
                <p className="mt-1 flex-1 text-[13px] leading-5 text-app-slate">{r.description}</p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs text-app-muted">
                    {lastRun[r.id] ? `Last run ${formatDateTime(lastRun[r.id])}` : 'Never run'}
                  </span>
                  <button
                    onClick={() => runReport(r)}
                    className="group/btn flex h-8 items-center gap-1.5 rounded-lg bg-action px-3.5 text-[13px] font-semibold text-white transition hover:-translate-y-px hover:bg-action-hover active:scale-[.98]"
                  >
                    Run
                    <ArrowRight size={14} className="transition-transform group-hover/btn:translate-x-0.5" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      ))}

      <ReportRunner report={active} period={period} onClose={() => setActive(null)} />
    </div>
  );
}

/* ================= report runner drawer ================= */

function ReportRunner({ report, period, onClose }: { report: ReportDef | null; period: string; onClose: () => void }) {
  const state = useStore();
  const [params, setParams] = useState<Params>({ clientId: 'all', status: 'all', period, groupBy: 'none', columns: [] });
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState<'xlsx' | 'csv' | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reportId = report?.id;

  /* reset whenever a new report opens (spinner 400ms, then preview) */
  useEffect(() => {
    if (!reportId) return;
    setParams({ clientId: 'all', status: 'all', period, groupBy: 'none', columns: [] });
    setGenerating(true);
    timer.current = setTimeout(() => setGenerating(false), 400);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId]);

  const allColumnKeys = useMemo(
    () => (report ? report.build(state, { clientId: 'all', status: 'all', period: 'all', groupBy: 'none', columns: [] }).columns.map((c) => c.key) : []),
    [report, state],
  );

  const statusOptions = useMemo(() => {
    if (!report) return [{ value: 'all', label: 'All statuses' }];
    const set = new Set<string>();
    if (report.domain === 'tenders') state.tenders.forEach((t) => set.add(t.status));
    else if (report.id === 'doc-expiry') ['Valid', 'Warning', 'Critical', 'Expired', 'No Expiry'].forEach((x) => set.add(x));
    else if (report.id === 'bond-exposure') state.bonds.forEach((b) => set.add(b.status));
    else state.documents.filter((d) => d.type === 'invoice').forEach((d) => set.add(d.status));
    return [{ value: 'all', label: 'All statuses' }, ...[...set].sort().map((x) => ({ value: x, label: x }))];
  }, [report, state]);

  const data = useMemo<ReportData | null>(() => {
    if (!report) return null;
    const raw = report.build(state, params);
    const grouped = applyGrouping(raw, params.groupBy);
    const visible = params.columns.length ? grouped.columns.filter((c) => params.columns.includes(c.key)) : grouped.columns;
    const idx = visible.map((c) => grouped.columns.indexOf(c));
    return {
      columns: visible,
      rows: grouped.rows.map((r) => idx.map((i) => r[i])),
      totals: grouped.totals ? idx.map((i) => grouped.totals![i]) : undefined,
    };
  }, [report, state, params]);

  if (!report) return null;

  const clientOptions = [
    { value: 'all', label: 'All clients' },
    ...state.clients.map((c) => ({ value: c.id, label: c.name })),
  ];

  const regenerate = () => {
    setGenerating(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setGenerating(false), 400);
  };

  const doExport = (kind: 'xlsx' | 'csv') => {
    if (!data) return;
    setExporting(kind);
    setTimeout(() => {
      if (kind === 'xlsx') exportXlsx(report, data);
      else exportCsv(report, data);
      setExporting(null);
    }, 600);
  };

  const toggleColumn = (key: string) => {
    const current = params.columns.length ? params.columns : allColumnKeys;
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    setParams((p) => ({ ...p, columns: next.length ? next : allColumnKeys }));
  };

  const visibleCols = params.columns.length ? params.columns : allColumnKeys;
  const previewRows = data?.rows.slice(0, 25) ?? [];

  return (
    <Drawer
      open={!!report}
      onClose={onClose}
      width="w-[760px]"
      title={
        <span className="flex items-center gap-2">
          <report.icon size={16} className="text-navy-800" />
          {report.name}
        </span>
      }
      footer={
        <>
          <button
            onClick={() => data && printReport(state, report, data, PERIOD_LABEL[params.period] ?? params.period)}
            className="flex h-9 items-center gap-2 rounded-lg border border-app-border bg-white px-4 text-[13px] font-semibold text-app-ink transition hover:-translate-y-px hover:brightness-105 active:scale-[.98]"
          >
            <Printer size={15} /> Print
          </button>
          <button
            onClick={() => doExport('csv')}
            className="relative flex h-9 items-center gap-2 overflow-hidden rounded-lg border border-app-border bg-white px-4 text-[13px] font-semibold text-app-ink transition hover:-translate-y-px hover:brightness-105 active:scale-[.98]"
          >
            {exporting === 'csv' && <motion.span initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.6, ease: 'linear' }} className="absolute inset-0 origin-left bg-grey-soft" />}
            <FileDown size={15} className="relative" /> <span className="relative">Export CSV</span>
          </button>
          <button
            onClick={() => doExport('xlsx')}
            className="relative flex h-9 items-center gap-2 overflow-hidden rounded-lg bg-gold px-4 text-[13px] font-semibold text-navy-950 transition hover:-translate-y-px hover:brightness-105 active:scale-[.98]"
          >
            {exporting === 'xlsx' && <motion.span initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.6, ease: 'linear' }} className="absolute inset-0 origin-left bg-[rgba(15,36,56,.12)]" />}
            <FileSpreadsheet size={15} className="relative" /> <span className="relative">Export Excel .xlsx</span>
          </button>
        </>
      }
    >
      <div className="grid grid-cols-[220px_1fr] gap-5">
        {/* Parameters */}
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-app-ink">Client</label>
            <SelectInput value={params.clientId} onChange={(e) => setParams((p) => ({ ...p, clientId: e.target.value }))} options={clientOptions} />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-app-ink">Status</label>
            <SelectInput value={params.status} onChange={(e) => setParams((p) => ({ ...p, status: e.target.value }))} options={statusOptions} />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-app-ink">Period</label>
            <SelectInput value={params.period} onChange={(e) => setParams((p) => ({ ...p, period: e.target.value }))} options={PERIOD_OPTIONS} />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-app-ink">Grouping</label>
            <SelectInput value={params.groupBy} onChange={(e) => setParams((p) => ({ ...p, groupBy: e.target.value }))} options={report.groupOptions} />
          </div>
          <div>
            <div className="mb-1.5 text-[13px] font-medium text-app-ink">Columns</div>
            <div className="flex flex-wrap gap-1.5">
              {allColumnKeys.map((key) => {
                const on = visibleCols.includes(key);
                return (
                  <button
                    key={key}
                    onClick={() => toggleColumn(key)}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-[11px] font-semibold transition',
                      on ? 'border-action bg-info-soft text-info' : 'border-app-border bg-white text-app-muted hover:text-app-slate',
                    )}
                  >
                    {data?.columns.find((c) => c.key === key)?.label ?? key}
                  </button>
                );
              })}
            </div>
          </div>
          <button
            onClick={regenerate}
            className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-action text-[13px] font-semibold text-white transition hover:-translate-y-px hover:bg-action-hover active:scale-[.98]"
          >
            <Play size={14} /> Generate
          </button>
        </div>

        {/* Preview */}
        <div className="min-w-0">
          {generating ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 text-app-muted">
              <Loader2 size={22} className="animate-spin text-action" />
              <span className="text-sm">Generating report…</span>
            </div>
          ) : !data || data.rows.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-center">
              <img src="/empty-box.svg" alt="" className="h-32 w-auto opacity-90" />
              <p className="mt-3 text-sm font-medium text-app-ink">No rows for these filters</p>
              <p className="mt-1 text-xs text-app-muted">Loosen the client/status/period filters and generate again.</p>
            </div>
          ) : (
            <motion.div
              initial="initial"
              animate="animate"
              variants={{ animate: { transition: { staggerChildren: 0.015 } } }}
              className="overflow-x-auto rounded-lg border border-app-border"
            >
              <table className="w-full min-w-[520px] text-[13px]">
                <thead>
                  <tr className="bg-[#F8FAFC] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-app-muted">
                    {data.columns.map((c) => (
                      <th key={c.key} className={cn('px-3 py-2', c.right && 'text-right')}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r, i) => (
                    <motion.tr
                      key={i}
                      variants={{ initial: { opacity: 0 }, animate: { opacity: 1 } }}
                      className={cn('border-t border-[#EEF1F5]', i % 2 === 1 && 'bg-[#FAFBFD]')}
                    >
                      {r.map((v, j) => (
                        <td
                          key={j}
                          className={cn(
                            'max-w-[180px] truncate px-3 py-2 text-app-slate',
                            data.columns[j].mono && 'font-mono text-xs font-medium text-navy-800',
                            data.columns[j].right && 'text-right tnum',
                            data.columns[j].money && typeof v === 'number' && v < 0 && 'text-danger',
                          )}
                        >
                          {typeof v === 'number' && data.columns[j].money ? formatKES(v, { decimals: 0 }) : v}
                        </td>
                      ))}
                    </motion.tr>
                  ))}
                </tbody>
                {data.totals && (
                  <tfoot>
                    <tr className="border-t-2 border-navy-800 bg-[#F8FAFC]">
                      {data.totals.map((v, i) => (
                        <td key={i} className={cn('px-3 py-2 text-[13px] font-bold text-app-ink', data.columns[i]?.right && 'text-right tnum')}>
                          {typeof v === 'number' && data.columns[i]?.money ? formatKES(v, { decimals: 0 }) : v}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
              {data.rows.length > 25 && (
                <div className="border-t border-[#EEF1F5] bg-[#F8FAFC] px-3 py-2 text-xs text-app-muted tnum">
                  Showing first 25 of {data.rows.length} rows — exports include everything.
                </div>
              )}
            </motion.div>
          )}
          <p className="mt-3 text-xs text-app-muted">
            {PERIOD_LABEL[params.period]} · Generated {formatDateTime(nowISO())} by {state.users[0]?.name ?? 'Admin User'}
          </p>
        </div>
      </div>
    </Drawer>
  );
}
