/**
 * Settings — /settings
 * Left tab rail: General · Document Numbering · Notifications & Alerts ·
 * Data & Storage · Appearance. Store-backed fields persist via
 * updateSettings(); UI-only preferences persist under a separate
 * localStorage key (fbv-tcms-v2-prefs).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  SlidersHorizontal, Hash, Bell, Database, Palette, Lock, Download, Upload,
  RotateCcw, FileX2, Check, AlertTriangle, ShieldCheck,
} from 'lucide-react';
import {
  useStore, updateSettings, resetToSeed, exportJSON, importJSON, storageUsage,
  mutateStore, nextDocNumber, TODAY, type AppState,
} from '@/lib/store';
import { formatDate } from '@/lib/format';
import { PageHeader, SelectInput, Toggle, ConfirmDialog, ExpiryBadge, Modal } from '@/components/shared';
import { cn } from '@/lib/utils';

/* ---------------------------------------------------------------- */
/* UI-only preferences (store schema has no fields for these)        */
/* ---------------------------------------------------------------- */

const PREFS_KEY = 'fbv-tcms-v2-prefs';

interface Prefs {
  dateFormat: 'd MMM yyyy' | 'dd/MM/yyyy' | 'yyyy-MM-dd';
  fiscalYearStart: string; // month name
  paymentTermsDays: number;
  quoteValidityDays: number;
  yearToken: boolean;
  nextNumbers: Record<string, number>;
  alerts: {
    deadlineWarnings: boolean;
    docExpiry: boolean;
    overdueInvoices: boolean;
    approvals: boolean;
    importSummaries: boolean;
  };
  overdueReminderDays: number;
  appearance: {
    sidebarDensity: 'comfortable' | 'compact';
    tableDensity: 'comfortable' | 'compact';
    reducedMotion: boolean;
  };
}

const DEFAULT_PREFS: Prefs = {
  dateFormat: 'd MMM yyyy',
  fiscalYearStart: 'January',
  paymentTermsDays: 30,
  quoteValidityDays: 30,
  yearToken: true,
  nextNumbers: {},
  alerts: { deadlineWarnings: true, docExpiry: true, overdueInvoices: true, approvals: true, importSummaries: true },
  overdueReminderDays: 7,
  appearance: { sidebarDensity: 'comfortable', tableDensity: 'comfortable', reducedMotion: false },
};

function loadPrefs(): Prefs {
  try {
    return { ...DEFAULT_PREFS, ...(JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>) };
  } catch {
    return DEFAULT_PREFS;
  }
}
function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch { /* ignore */ }
}

/* ---------------------------------------------------------------- */
/* Doc numbering rows                                                 */
/* ---------------------------------------------------------------- */

const DOC_ROWS: { key: string; label: string }[] = [
  { key: 'quotation', label: 'Quotation' },
  { key: 'proforma', label: 'Proforma Invoice' },
  { key: 'invoice', label: 'Invoice' },
  { key: 'receipt', label: 'Receipt' },
  { key: 'purchase-order', label: 'Purchase Order' },
  { key: 'contract', label: 'Contract' },
  { key: 'tender', label: 'Tender' },
  { key: 'payment', label: 'Payment' },
];

/** Highest existing document number for a prefix+year, e.g. FBV-QUO-2026-003. */
function lastUsed(prefix: string, year: number, s: AppState): string | null {
  const head = `${prefix}-${year}-`;
  let max = 0;
  const scan = (no?: string) => {
    if (no && no.startsWith(head)) {
      const n = parseInt(no.slice(head.length), 10);
      if (!Number.isNaN(n) && n > max) max = n;
    }
  };
  s.documents.forEach((d) => scan(d.docNo));
  s.tenders.forEach((t) => scan(t.refNo));
  s.payments.forEach((p) => scan(p.refNo));
  s.bonds.forEach((b) => scan(b.refNo));
  s.approvals.forEach((a) => scan(a.refNo));
  return max ? `${head}${String(max).padStart(3, '0')}` : null;
}

/* ---------------------------------------------------------------- */
/* Page                                                               */
/* ---------------------------------------------------------------- */

type TabKey = 'general' | 'numbering' | 'alerts' | 'data' | 'appearance';

const TABS: { key: TabKey; label: string; icon: typeof SlidersHorizontal }[] = [
  { key: 'general', label: 'General', icon: SlidersHorizontal },
  { key: 'numbering', label: 'Document Numbering', icon: Hash },
  { key: 'alerts', label: 'Notifications & Alerts', icon: Bell },
  { key: 'data', label: 'Data & Storage', icon: Database },
  { key: 'appearance', label: 'Appearance', icon: Palette },
];

interface FormState {
  vatRate: number;
  warningDays: number;
  criticalDays: number;
  docPrefixes: Record<string, string>;
  docYear: number;
  prefs: Prefs;
}

export default function Settings() {
  const state = useStore();
  const [tab, setTab] = useState<TabKey>('general');

  const snapshot = (): FormState => ({
    vatRate: state.settings.vatRate,
    warningDays: state.settings.warningDays,
    criticalDays: state.settings.criticalDays,
    docPrefixes: { ...state.settings.docPrefixes },
    docYear: state.settings.docYear,
    prefs: loadPrefs(),
  });

  const [form, setForm] = useState<FormState>(snapshot);
  const [baseline, setBaseline] = useState<string>(() => JSON.stringify(snapshot()));
  const dirty = JSON.stringify(form) !== baseline;

  /* keep form in sync if store changes externally (e.g. after resetToSeed) */
  const seededAt = state.seededAt;
  useEffect(() => {
    const snap = snapshot();
    setForm(snap);
    setBaseline(JSON.stringify(snap));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seededAt]);

  const patch = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }));
  const patchPrefs = (p: Partial<Prefs>) => setForm((f) => ({ ...f, prefs: { ...f.prefs, ...p } }));

  const save = () => {
    updateSettings(
      {
        vatRate: form.vatRate,
        warningDays: form.warningDays,
        criticalDays: form.criticalDays,
        docPrefixes: { ...form.docPrefixes },
        docYear: form.docYear,
      },
      state.users[0]?.name,
    );
    savePrefs(form.prefs);
    setBaseline(JSON.stringify(form));
  };
  const discard = () => {
    const snap = snapshot();
    setForm(snap);
    setBaseline(JSON.stringify(snap));
  };

  return (
    <div className="px-7 pb-8 pt-6">
      <PageHeader title="Settings" subtitle="System preferences for numbering, tax, alerts and data." />

      <div className="flex items-start gap-6">
        {/* Tab rail */}
        <aside className="w-[220px] shrink-0 rounded-xl border border-app-border bg-app-card p-2 shadow-card">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'relative flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
                tab === t.key ? 'bg-[rgba(37,99,235,.10)] text-navy-800' : 'text-app-slate hover:bg-app-bg hover:text-app-ink',
              )}
            >
              {tab === t.key && (
                <motion.span layoutId="settings-tab" className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-action" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />
              )}
              <t.icon size={16} />
              {t.label}
            </button>
          ))}
        </aside>

        {/* Tab content */}
        <div className="min-w-0 flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8, transition: { duration: 0.12 } }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            >
              {tab === 'general' && <GeneralTab form={form} patch={patch} patchPrefs={patchPrefs} />}
              {tab === 'numbering' && <NumberingTab form={form} patch={patch} patchPrefs={patchPrefs} state={state} />}
              {tab === 'alerts' && <AlertsTab form={form} patch={patch} patchPrefs={patchPrefs} />}
              {tab === 'data' && <DataTab state={state} />}
              {tab === 'appearance' && <AppearanceTab form={form} patchPrefs={patchPrefs} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Sticky save bar (slides up when dirty) */}
      <AnimatePresence>
        {dirty && (
          <motion.div
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="sticky bottom-4 z-20 mx-auto mt-6 flex w-fit items-center gap-3 rounded-xl border border-app-border bg-white px-4 py-3 shadow-card-hover"
          >
            <span className="text-sm font-medium text-app-ink">Unsaved changes</span>
            <button
              onClick={discard}
              className="h-9 rounded-lg border border-app-border bg-white px-4 text-[13px] font-semibold text-app-ink transition hover:brightness-105"
            >
              Discard
            </button>
            <button
              onClick={save}
              className="flex h-9 items-center gap-2 rounded-lg bg-action px-4 text-[13px] font-semibold text-white transition hover:-translate-y-px hover:bg-action-hover active:scale-[.98]"
            >
              <Check size={15} /> Save Settings
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Shared bits                                                        */
/* ---------------------------------------------------------------- */

function Card({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-app-border bg-app-card p-5 shadow-card', className)}>
      {title && <h3 className="mb-4 text-[15px] font-semibold text-app-ink">{title}</h3>}
      {children}
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <div className="text-sm font-medium text-app-ink">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-app-muted">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

const NUM_INPUT =
  'h-[38px] w-24 rounded-lg border border-app-border bg-white px-3 text-sm text-app-ink outline-none tnum transition focus:border-action focus:ring-2 focus:ring-[rgba(37,99,235,.25)]';

/* ---------------------------------------------------------------- */
/* Tab: General                                                       */
/* ---------------------------------------------------------------- */

function GeneralTab({
  form,
  patch,
  patchPrefs,
}: {
  form: FormState;
  patch: (p: Partial<FormState>) => void;
  patchPrefs: (p: Partial<Prefs>) => void;
}) {
  const previewDate = useMemo(() => {
    const d = new Date(`${TODAY}T00:00:00`);
    if (form.prefs.dateFormat === 'dd/MM/yyyy') return d.toLocaleDateString('en-GB');
    if (form.prefs.dateFormat === 'yyyy-MM-dd') return TODAY;
    return formatDate(TODAY);
  }, [form.prefs.dateFormat]);

  return (
    <div className="space-y-4">
      <Card title="Regional & Tax">
        <div className="divide-y divide-[#EEF1F5]">
          <Row label="Currency" hint="FBV operates in KES">
            <span className="flex h-[38px] items-center gap-2 rounded-lg border border-app-border bg-app-bg px-3 text-sm font-medium text-app-slate">
              <Lock size={13} className="text-app-muted" /> KES — Kenyan Shilling
            </span>
          </Row>
          <Row label="VAT Rate (%)" hint="Changing VAT affects new documents only">
            <input
              type="number"
              min={0}
              max={100}
              value={form.vatRate}
              onChange={(e) => patch({ vatRate: Number(e.target.value) })}
              className={NUM_INPUT}
            />
          </Row>
          <Row label="Date format" hint="Used across lists, documents and reports">
            <div className="flex items-center gap-2">
              <SelectInput
                value={form.prefs.dateFormat}
                onChange={(e) => patchPrefs({ dateFormat: e.target.value as Prefs['dateFormat'] })}
                options={[
                  { value: 'd MMM yyyy', label: '27 Jul 2026' },
                  { value: 'dd/MM/yyyy', label: '27/07/2026' },
                  { value: 'yyyy-MM-dd', label: '2026-07-27' },
                ]}
              />
              <span className="rounded-full bg-gold-soft px-2.5 py-1 text-[11px] font-semibold text-gold tnum">{previewDate}</span>
            </div>
          </Row>
          <Row label="Fiscal year start" hint="First month of the financial year">
            <SelectInput
              value={form.prefs.fiscalYearStart}
              onChange={(e) => patchPrefs({ fiscalYearStart: e.target.value })}
              options={['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((m) => ({ value: m, label: m }))}
            />
          </Row>
        </div>
      </Card>
      <Card title="Commercial Defaults">
        <div className="divide-y divide-[#EEF1F5]">
          <Row label="Default payment terms" hint="Applied to new invoices">
            <span className="flex items-center gap-2">
              <input type="number" min={0} value={form.prefs.paymentTermsDays} onChange={(e) => patchPrefs({ paymentTermsDays: Number(e.target.value) })} className={NUM_INPUT} />
              <span className="text-sm text-app-slate">days</span>
            </span>
          </Row>
          <Row label="Default quotation validity" hint="Applied to new quotations">
            <span className="flex items-center gap-2">
              <input type="number" min={0} value={form.prefs.quoteValidityDays} onChange={(e) => patchPrefs({ quoteValidityDays: Number(e.target.value) })} className={NUM_INPUT} />
              <span className="text-sm text-app-slate">days</span>
            </span>
          </Row>
        </div>
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Tab: Document Numbering                                            */
/* ---------------------------------------------------------------- */

function NumberingTab({
  form,
  patch,
  patchPrefs,
  state,
}: {
  form: FormState;
  patch: (p: Partial<FormState>) => void;
  patchPrefs: (p: Partial<Prefs>) => void;
  state: AppState;
}) {
  const preview = (key: string) => {
    const prefix = form.docPrefixes[key] ?? '';
    const derived = nextDocNumber(prefix, form.docYear, state);
    const derivedN = parseInt(derived.slice(derived.lastIndexOf('-') + 1), 10) || 1;
    const override = form.prefs.nextNumbers[key];
    const n = Math.max(override ?? 0, derivedN) || 1;
    return form.prefs.yearToken
      ? `${prefix}-${form.docYear}-${String(n).padStart(3, '0')}`
      : `${prefix}-${String(n).padStart(3, '0')}`;
  };

  return (
    <Card title="Document Numbering">
      <div className="mb-4 flex items-center justify-between rounded-lg border border-app-border bg-app-bg px-4 py-3">
        <div>
          <div className="text-sm font-medium text-app-ink">Year token in document numbers</div>
          <div className="text-xs text-app-muted">Include the {form.docYear} infix (FBV-QUO-{form.docYear}-004)</div>
        </div>
        <Toggle checked={form.prefs.yearToken} onChange={(v) => patchPrefs({ yearToken: v })} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-app-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#F8FAFC] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-app-muted">
              <th className="px-4 py-2.5">Type</th>
              <th className="px-4 py-2.5">Prefix</th>
              <th className="px-4 py-2.5">Next Number</th>
              <th className="px-4 py-2.5">Preview</th>
            </tr>
          </thead>
          <tbody>
            {DOC_ROWS.map((r) => {
              const last = lastUsed(form.docPrefixes[r.key] ?? '', form.docYear, state);
              return (
                <tr key={r.key} className="border-t border-[#EEF1F5] hover:bg-[#F8FAFC]">
                  <td className="px-4 py-2.5 font-medium text-app-ink">{r.label}</td>
                  <td className="px-4 py-2.5">
                    <input
                      value={form.docPrefixes[r.key] ?? ''}
                      onChange={(e) => patch({ docPrefixes: { ...form.docPrefixes, [r.key]: e.target.value.toUpperCase() } })}
                      className="h-9 w-40 rounded-lg border border-app-border bg-white px-3 font-mono text-[13px] font-medium text-navy-800 outline-none transition focus:border-action focus:ring-2 focus:ring-[rgba(37,99,235,.25)]"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      type="number"
                      min={1}
                      value={form.prefs.nextNumbers[r.key] ?? (last ? parseInt(last.slice(last.lastIndexOf('-') + 1), 10) + 1 : 1)}
                      onChange={(e) => patchPrefs({ nextNumbers: { ...form.prefs.nextNumbers, [r.key]: Number(e.target.value) } })}
                      className={NUM_INPUT}
                    />
                    <div className="mt-1 text-xs text-app-muted">Last used: {last ?? '—'}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="rounded-full bg-gold-soft px-2.5 py-1 font-mono text-[11px] font-semibold text-gold">{preview(r.key)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-[13px] text-danger">
        <AlertTriangle size={15} className="mt-0.5 shrink-0" />
        Lowering the next number may create duplicates.
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- */
/* Tab: Notifications & Alerts                                        */
/* ---------------------------------------------------------------- */

function ToggleRow({
  label,
  caption,
  checked,
  onChange,
  children,
}: {
  label: string;
  caption: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="border-b border-[#EEF1F5] py-3 first:pt-0 last:border-0 last:pb-0">
      <div className="flex items-center justify-between gap-6">
        <div className="min-w-0">
          <div className="text-sm font-medium text-app-ink">{label}</div>
          <div className="mt-0.5 text-xs text-app-muted">{caption}</div>
        </div>
        <Toggle checked={checked} onChange={onChange} />
      </div>
      <AnimatePresence initial={false}>
        {checked && children && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="mt-3 rounded-lg border border-app-border bg-app-bg px-4 py-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AlertsTab({
  form,
  patch,
  patchPrefs,
}: {
  form: FormState;
  patch: (p: Partial<FormState>) => void;
  patchPrefs: (p: Partial<Prefs>) => void;
}) {
  const plusDays = (n: number) => {
    const d = new Date(`${TODAY}T00:00:00`);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };

  return (
    <Card title="Notifications & Alerts">
      <ToggleRow
        label="Deadline warnings"
        caption="Feed the Deadline Tracker, dashboard Needs Attention and the topbar bell"
        checked={form.prefs.alerts.deadlineWarnings}
        onChange={(v) => patchPrefs({ alerts: { ...form.prefs.alerts, deadlineWarnings: v } })}
      >
        <div className="flex flex-wrap items-end gap-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-app-slate">Warn (days before)</label>
            <input type="number" min={1} value={form.warningDays} onChange={(e) => patch({ warningDays: Number(e.target.value) })} className={NUM_INPUT} />
          </div>
          <ExpiryBadge date={plusDays(form.warningDays)} showDays={false} />
          <div>
            <label className="mb-1 block text-xs font-medium text-app-slate">Critical (days before)</label>
            <input type="number" min={1} value={form.criticalDays} onChange={(e) => patch({ criticalDays: Number(e.target.value) })} className={NUM_INPUT} />
          </div>
          <ExpiryBadge date={plusDays(form.criticalDays)} showDays={false} />
        </div>
      </ToggleRow>
      <ToggleRow
        label="Business document expiry alerts"
        caption="Licences and certificates from the DMS vault surface in Needs Attention (default on)"
        checked={form.prefs.alerts.docExpiry}
        onChange={(v) => patchPrefs({ alerts: { ...form.prefs.alerts, docExpiry: v } })}
      />
      <ToggleRow
        label="Overdue invoice reminders"
        caption="Re-surface overdue invoices until they are settled"
        checked={form.prefs.alerts.overdueInvoices}
        onChange={(v) => patchPrefs({ alerts: { ...form.prefs.alerts, overdueInvoices: v } })}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-app-slate">Remind every</span>
          <input
            type="number"
            min={1}
            value={form.prefs.overdueReminderDays}
            onChange={(e) => patchPrefs({ overdueReminderDays: Number(e.target.value) })}
            className={NUM_INPUT}
          />
          <span className="text-xs text-app-slate">days</span>
        </div>
      </ToggleRow>
      <ToggleRow
        label="Approval requests"
        caption="Notify approvers when a PO, credit note or discount needs a decision"
        checked={form.prefs.alerts.approvals}
        onChange={(v) => patchPrefs({ alerts: { ...form.prefs.alerts, approvals: v } })}
      />
      <ToggleRow
        label="Import summaries"
        caption="Show a summary notification after each Bulk Upload Centre import"
        checked={form.prefs.alerts.importSummaries}
        onChange={(v) => patchPrefs({ alerts: { ...form.prefs.alerts, importSummaries: v } })}
      />
    </Card>
  );
}

/* ---------------------------------------------------------------- */
/* Tab: Data & Storage                                                */
/* ---------------------------------------------------------------- */

function fmtMB(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function DataTab({ state }: { state: AppState }) {
  const usage = useMemo(() => storageUsage(), [state]);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [resetStep, setResetStep] = useState(0); // 0 = idle, 1 = first confirm, 2 = hold-to-confirm
  const [clearOpen, setClearOpen] = useState(false);
  const [done, setDone] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  /* storage segments (bytes of each JSON slice) */
  const segments = useMemo(() => {
    const size = (v: unknown) => new Blob([JSON.stringify(v) ?? '']).size;
    const masters = size([state.clients, state.suppliers, state.products, state.employees]);
    const transactions = size([state.tenders, state.documents, state.payments, state.deadlines, state.bonds, state.milestones, state.risks, state.approvals, state.crm]);
    const files = state.dms.reduce((a, d) => a + (d.fileData?.length ?? 0), 0);
    const other = Math.max(0, usage.used - masters - transactions - files);
    return [
      { label: 'Masters', bytes: masters, color: '#2563EB' },
      { label: 'Transactions', bytes: transactions, color: '#1F3B57' },
      { label: 'Files', bytes: files, color: '#C9A227' },
      { label: 'Other', bytes: other, color: '#94A3B8' },
    ];
  }, [state, usage.used]);

  const warn = usage.ratio > 0.8;

  const doExport = async () => {
    const blob = new Blob([await exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `fbv-backup-${TODAY}.json`;
    a.click();
    setDone('Backup exported.');
    setTimeout(() => setDone(''), 3000);
  };

  const onImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setImportText(String(reader.result ?? ''));
      setImportError('');
      setImportOpen(true);
    };
    reader.readAsText(file);
  };

  const confirmImport = async () => {
    try {
      await importJSON(importText);
      setImportText('');
      setDone('Backup restored.');
      setTimeout(() => setDone(''), 3000);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed.');
    }
  };

  return (
    <div className="space-y-4">
      {/* Storage meter */}
      <Card title="Storage">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-sm text-app-slate tnum">
            <span className="font-semibold text-app-ink">{fmtMB(usage.used)}</span> of ~{fmtMB(usage.quota)} used
          </span>
          {warn && (
            <span className="flex items-center gap-1 text-xs font-semibold text-warning">
              <AlertTriangle size={13} /> Over 80% — consider clearing uploaded files
            </span>
          )}
        </div>
        <div className={cn('flex h-3 overflow-hidden rounded-full', warn ? 'bg-warning-soft' : 'bg-grey-soft')}>
          {segments.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(1.5, (s.bytes / usage.quota) * 100)}%` }}
              transition={{ duration: 0.5, ease: 'easeOut', delay: i * 0.12 }}
              style={{ backgroundColor: s.color }}
              className="h-full"
            />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-4">
          {segments.map((s) => (
            <span key={s.label} className="flex items-center gap-1.5 text-xs text-app-slate">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
              {s.label} <span className="text-app-muted tnum">{fmtMB(s.bytes)}</span>
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs text-app-muted">Documents and images live in your browser.</p>
      </Card>

      {/* Actions */}
      <Card title="Backup & Data">
        <div className="divide-y divide-[#EEF1F5]">
          <Row label="Export all data (.json)" hint="Download a full backup of every record">
            <button onClick={doExport} className="flex h-9 items-center gap-2 rounded-lg border border-app-border bg-white px-4 text-[13px] font-semibold text-app-ink transition hover:-translate-y-px hover:shadow-card active:scale-[.98]">
              <Download size={15} /> Export
            </button>
          </Row>
          <Row label="Import backup (.json)" hint="Restore from a previous export">
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onImportFile(f);
                e.target.value = '';
              }}
            />
            <button onClick={() => fileRef.current?.click()} className="flex h-9 items-center gap-2 rounded-lg border border-app-border bg-white px-4 text-[13px] font-semibold text-app-ink transition hover:-translate-y-px hover:shadow-card active:scale-[.98]">
              <Upload size={15} /> Import
            </button>
          </Row>
          <Row label="Reset to demo data" hint="Restore the seeded Future Bright Ventures dataset">
            <button onClick={() => setResetStep(1)} className="flex h-9 items-center gap-2 rounded-lg border border-danger/40 bg-white px-4 text-[13px] font-semibold text-danger transition hover:-translate-y-px hover:bg-danger-soft active:scale-[.98]">
              <RotateCcw size={15} /> Reset
            </button>
          </Row>
          <Row label="Clear uploaded files" hint="Frees space — keeps every record, removes file contents">
            <button onClick={() => setClearOpen(true)} className="flex h-9 items-center gap-2 rounded-lg border border-app-border bg-white px-4 text-[13px] font-semibold text-app-ink transition hover:-translate-y-px hover:shadow-card active:scale-[.98]">
              <FileX2 size={15} /> Clear files
            </button>
          </Row>
        </div>
        {(done || importError) && (
          <p className={cn('mt-4 text-xs font-medium', importError ? 'text-danger' : 'text-success')}>
            {importError || done}
          </p>
        )}
      </Card>

      {/* Import confirm */}
      <ConfirmDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onConfirm={confirmImport}
        title="Restore backup?"
        message="This replaces ALL current data with the contents of the backup file. Export a backup first if you are unsure."
        confirmLabel="Replace all data"
        destructive
      />

      {/* Reset: first confirm, then hold-to-confirm */}
      <ConfirmDialog
        open={resetStep === 1}
        onClose={() => setResetStep(0)}
        onConfirm={() => setResetStep(2)}
        title="Reset to demo data?"
        message="All changes will be discarded and the original seeded dataset restored. This cannot be undone."
        confirmLabel="Yes, continue"
        destructive
      />
      <HoldToReset open={resetStep === 2} onClose={() => setResetStep(0)} />

      {/* Clear files confirm */}
      <ConfirmDialog
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        onConfirm={() => {
          mutateStore(
            (d) => {
              d.dms.forEach((doc) => {
                doc.fileData = '';
              });
            },
            { action: 'Updated', entity: 'Business Documents', entityRef: 'DMS', details: 'Cleared uploaded file contents to free storage', verb: 'Cleared files', verbColor: 'blue' },
          );
          setDone('Uploaded files cleared.');
          setTimeout(() => setDone(''), 3000);
        }}
        title="Clear uploaded files?"
        message="File contents (base64) will be removed from all business documents. Document records, metadata and expiry alerts are kept."
        confirmLabel="Clear files"
      />
    </div>
  );
}

/** Hold-to-confirm 1.2s with progress ring fill (reset double-confirm step 2). */
function HoldToReset({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [progress, setProgress] = useState(0);
  const raf = useRef<number | null>(null);
  const start = useRef(0);

  const stop = () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    setProgress(0);
  };

  const begin = () => {
    start.current = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start.current) / 1200);
      setProgress(p);
      if (p >= 1) {
        resetToSeed();
        onClose();
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };

  useEffect(() => stop, []);

  const R = 15;
  const CIRC = 2 * Math.PI * R;

  return (
    <Modal
      open={open}
      onClose={() => {
        stop();
        onClose();
      }}
      width="max-w-[440px]"
      title={
        <span className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-danger" /> Final confirmation
        </span>
      }
    >
      <p className="text-sm leading-6 text-app-slate">
        Press and hold the button for 1.2 seconds to reset everything to the demo dataset.
      </p>
      <button
        onPointerDown={begin}
        onPointerUp={stop}
        onPointerLeave={stop}
        className="relative mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-danger text-sm font-bold text-white transition active:scale-[.99]"
      >
        <svg width="34" height="34" viewBox="0 0 34 34" className="absolute left-3">
          <circle cx="17" cy="17" r={R} fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="3" />
          <circle
            cx="17"
            cy="17"
            r={R}
            fill="none"
            stroke="#fff"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - progress)}
            transform="rotate(-90 17 17)"
          />
        </svg>
        Hold to reset all data
      </button>
    </Modal>
  );
}

/* ---------------------------------------------------------------- */
/* Tab: Appearance                                                    */
/* ---------------------------------------------------------------- */

function AppearanceTab({ form, patchPrefs }: { form: FormState; patchPrefs: (p: Partial<Prefs>) => void }) {
  const densityCard = (
    value: 'comfortable' | 'compact',
    title: string,
    caption: string,
    selected: boolean,
    onSelect: () => void,
    rows: number[],
  ) => (
    <button
      onClick={onSelect}
      className={cn(
        'flex-1 rounded-xl border-2 p-4 text-left transition',
        selected ? 'border-action bg-info-soft/40' : 'border-app-border bg-white hover:border-app-muted',
      )}
    >
      <div className="mb-3 flex h-16 items-stretch gap-1.5 overflow-hidden rounded-lg bg-navy-950 p-1.5">
        <div className={cn('rounded bg-white/10 transition-all', value === 'compact' ? 'w-3' : 'w-6')} />
        <div className="flex-1 space-y-1 rounded bg-white/5 p-1">
          {rows.map((w, i) => (
            <div key={i} className="h-1.5 rounded-full bg-white/25" style={{ width: `${w}%` }} />
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={cn('flex h-4 w-4 items-center justify-center rounded-full border-2', selected ? 'border-action bg-action' : 'border-app-muted')}>
          {selected && <Check size={10} className="text-white" />}
        </span>
        <span className="text-sm font-semibold text-app-ink">{title}</span>
      </div>
      <div className="mt-0.5 pl-6 text-xs text-app-muted">{caption}</div>
    </button>
  );

  return (
    <div className="space-y-4">
      <Card title="Sidebar density">
        <div className="flex gap-3">
          {densityCard('comfortable', 'Comfortable', '248px sidebar with group labels', form.prefs.appearance.sidebarDensity === 'comfortable', () => patchPrefs({ appearance: { ...form.prefs.appearance, sidebarDensity: 'comfortable' } }), [80, 65, 72])}
          {densityCard('compact', 'Compact', '68px icon-only rail', form.prefs.appearance.sidebarDensity === 'compact', () => patchPrefs({ appearance: { ...form.prefs.appearance, sidebarDensity: 'compact' } }), [55, 70, 48])}
        </div>
      </Card>
      <Card title="Accent color">
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 overflow-hidden rounded-lg border border-app-border">
              <span className="h-full w-6 bg-navy-800" />
              <span className="h-full w-6 bg-gold" />
            </span>
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-app-ink">
                <Lock size={13} className="text-app-muted" /> Brand theme
              </div>
              <div className="mt-0.5 text-xs text-app-muted">
                Managed in Company Profile → Branding.{' '}
                <Link to="/profile" className="font-semibold text-action hover:text-action-hover">
                  Open Company Profile
                </Link>
              </div>
            </div>
          </div>
          <ShieldCheck size={18} className="text-success" />
        </div>
      </Card>
      <Card title="Tables & Motion">
        <div className="divide-y divide-[#EEF1F5]">
          <Row label="Table row density" hint="Row height in data tables">
            <SelectInput
              value={form.prefs.appearance.tableDensity}
              onChange={(e) => patchPrefs({ appearance: { ...form.prefs.appearance, tableDensity: e.target.value as 'comfortable' | 'compact' } })}
              options={[
                { value: 'comfortable', label: 'Comfortable (56px)' },
                { value: 'compact', label: 'Compact (40px)' },
              ]}
            />
          </Row>
          <Row label="Reduced motion" hint="Respects and overrides animations system-wide">
            <Toggle checked={form.prefs.appearance.reducedMotion} onChange={(v) => patchPrefs({ appearance: { ...form.prefs.appearance, reducedMotion: v } })} />
          </Row>
        </div>
      </Card>
    </div>
  );
}
