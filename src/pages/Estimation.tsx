/** Cost Estimation & BOQ Engine — /estimation
 *  BOQ builder with draggable sections/items, Products-DB combobox autofill,
 *  Excel import/export, live Bid Price Builder cascade (overheads %, contingency %,
 *  margin %, discount %, VAT 16%) and one-click push to a Quotation draft. */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, Reorder, motion, useDragControls } from 'framer-motion';
import {
  Calculator, ChevronDown, CircleCheck, FileDown, FileSpreadsheet, FileUp,
  GripVertical, Plus, Table2, Trash2,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useStore, addItem, nextDocNumber, nowISO, uid, TODAY } from '@/lib/store';
import type { DocumentLine, Product } from '@/lib/store';
import { formatDateTime, formatKES, formatKESCompact } from '@/lib/format';
import { PageHeader, Pill, SelectInput } from '@/components/shared';
import {
  computeTotals, latestEstimate, markEstimatePushed, newBoqItem, newBoqSection,
  saveEstimate, useExtras,
} from '@/components/tenders/extras';
import type { BoqItem, BoqSection, Estimate } from '@/components/tenders/extras';
import { TenderContextBar, useTenderParam } from '@/components/tenders/TenderContextBar';
import { Btn, Card, PageEnter, SectionTitle, TweenNumber } from '@/components/tenders/ui';
import { cn } from '@/lib/utils';

const TEMPLATES: Record<string, string[]> = {
  'Supply of Goods': ['Materials', 'Logistics'],
  Works: ['Materials', 'Labour', 'Plant & Equipment', 'Logistics'],
  Services: ['Labour', 'Logistics'],
};
const SECTION_SUGGESTIONS = ['Materials', 'Labour', 'Plant & Equipment', 'Logistics', 'Overheads', 'Contingency'];

const r2 = (n: number) => Math.round(n * 100) / 100;

const CELL =
  'h-9 w-full rounded-lg border border-app-border bg-white px-2.5 text-[13px] text-app-ink outline-none transition placeholder:text-app-muted focus:border-action focus:ring-2 focus:ring-[rgba(37,99,235,.25)]';

/* ------------------------------------------------------------------ */
/* Excel helpers                                                       */
/* ------------------------------------------------------------------ */

function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Section', 'Description', 'Unit', 'Qty', 'Rate (KES)'],
    ['Materials', 'A4 Printing Paper 80gsm (Box of 5 Reams)', 'box', 100, 3200],
    ['Materials', 'Medical Examination Gloves (Carton of 1000)', 'carton', 50, 14200],
    ['Logistics', 'Delivery & handling — Nairobi to site', 'lot', 1, 480000],
  ]);
  ws['!cols'] = [{ wch: 18 }, { wch: 46 }, { wch: 10 }, { wch: 8 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'BOQ');
  XLSX.writeFile(wb, 'fbv-boq-template.xlsx');
}

async function parseBoqFile(file: File): Promise<BoqSection[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1 });
  const bySection = new Map<string, BoqItem[]>();
  rows.slice(1).forEach((row) => {
    const [sec, desc, unit, qty, rate] = row;
    if (desc == null || String(desc).trim() === '') return;
    const section = String(sec ?? 'Materials').trim() || 'Materials';
    const list = bySection.get(section) ?? [];
    list.push(newBoqItem({
      description: String(desc).trim(),
      unit: String(unit ?? 'pcs').trim() || 'pcs',
      qty: Number(qty) || 1,
      rate: Number(rate) || 0,
    }));
    bySection.set(section, list);
  });
  if (bySection.size === 0) throw new Error('No BOQ rows found — use the template columns: Section, Description, Unit, Qty, Rate.');
  return Array.from(bySection.entries()).map(([title, items]) => ({ id: uid('sec'), title, items }));
}

function exportBoq(sections: BoqSection[], ref: string) {
  const aoa: (string | number)[][] = [['Section', 'Description', 'Unit', 'Qty', 'Rate (KES)', 'Amount (KES)']];
  sections.forEach((s) =>
    s.items.forEach((it) => {
      if (!it.description.trim()) return;
      aoa.push([s.title, it.description, it.unit, it.qty, it.rate, r2(it.qty * it.rate)]);
    }),
  );
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 18 }, { wch: 46 }, { wch: 10 }, { wch: 8 }, { wch: 14 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'BOQ');
  XLSX.writeFile(wb, `fbv-boq-${ref}.xlsx`);
}

/* ================================================================== */

export default function Estimation() {
  const state = useStore();
  const extras = useExtras();
  const [tenderId, setTenderId] = useTenderParam();
  const tender = state.tenders.find((t) => t.id === tenderId);

  const [estimateId, setEstimateId] = useState<string | null>(null);
  const [sections, setSections] = useState<BoqSection[]>([newBoqSection('Materials')]);
  const [overheadsPct, setOverheadsPct] = useState(8);
  const [contingencyPct, setContingencyPct] = useState(5);
  const [marginPct, setMarginPct] = useState(18);
  const [discountPct, setDiscountPct] = useState(0);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [statusMsg, setStatusMsg] = useState<{ kind: 'saved' | 'pushed'; text: string } | null>(null);
  const [importError, setImportError] = useState('');

  /* load latest estimate for the selected tender */
  useEffect(() => {
    setStatusMsg(null);
    setImportError('');
    if (!tenderId) {
      setEstimateId(null);
      setSections([newBoqSection('Materials')]);
      setOverheadsPct(8); setContingencyPct(5); setMarginPct(18); setDiscountPct(0);
      return;
    }
    const est = latestEstimate(tenderId);
    if (est) {
      setEstimateId(est.id);
      setSections(est.sections);
      setOverheadsPct(est.overheadsPct);
      setContingencyPct(est.contingencyPct);
      setMarginPct(est.marginPct);
      setDiscountPct(est.discountPct);
    } else {
      setEstimateId(null);
      setSections([newBoqSection('Materials'), newBoqSection('Labour')]);
      setOverheadsPct(8); setContingencyPct(5); setMarginPct(18); setDiscountPct(0);
    }
  }, [tenderId]); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = useMemo(
    () => computeTotals({ sections, overheadsPct, contingencyPct, marginPct, discountPct }, state.settings.vatRate),
    [sections, overheadsPct, contingencyPct, marginPct, discountPct, state.settings.vatRate],
  );

  const marginHealth = totals.marginOnBid >= 15
    ? { label: 'Healthy margin', tone: 'green' as const }
    : totals.marginOnBid >= 8
      ? { label: 'Thin margin', tone: 'amber' as const }
      : { label: 'Below floor — review pricing', tone: 'red' as const };

  /* section + item mutators (local draft state) */
  const patchSection = (secId: string, patch: Partial<BoqSection>) =>
    setSections((ss) => ss.map((s) => (s.id === secId ? { ...s, ...patch } : s)));
  const patchItem = (secId: string, itemId: string, patch: Partial<BoqItem>) =>
    setSections((ss) =>
      ss.map((s) =>
        s.id === secId ? { ...s, items: s.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)) } : s,
      ),
    );

  const applyTemplate = (name: string) => {
    const secs = TEMPLATES[name];
    if (!secs) return;
    setSections(secs.map((t) => newBoqSection(t)));
    setEstimateId(null);
  };

  const addSection = (title: string) => {
    if (!title) return;
    setSections((ss) => [...ss, newBoqSection(title)]);
  };

  const currentEstimate = (): Estimate => ({
    id: estimateId ?? uid('est'),
    tenderId,
    sections,
    overheadsPct,
    contingencyPct,
    marginPct,
    discountPct,
    status: estimateId ? (extras.estimates.find((e) => e.id === estimateId)?.status ?? 'Draft') : 'Draft',
    createdAt: estimateId ? (extras.estimates.find((e) => e.id === estimateId)?.createdAt ?? nowISO()) : nowISO(),
    updatedAt: nowISO(),
  });

  const save = (): Estimate | null => {
    if (!tender) return null;
    const est = currentEstimate();
    saveEstimate(est, tender.refNo);
    setEstimateId(est.id);
    setStatusMsg({ kind: 'saved', text: `Estimate saved as draft against ${tender.refNo}.` });
    return est;
  };

  const generateQuotation = () => {
    if (!tender) return;
    const est = save() ?? currentEstimate();
    const lines: DocumentLine[] = [];
    sections.forEach((sec) =>
      sec.items
        .filter((it) => it.description.trim() && it.qty > 0)
        .forEach((it) =>
          lines.push({
            id: uid('ln'),
            productId: it.productId,
            description: `${sec.title} — ${it.description}`,
            qty: it.qty,
            unit: it.unit,
            unitPrice: r2(it.rate),
            amount: r2(it.qty * it.rate),
          }),
        ),
    );
    if (totals.overheads > 0) lines.push({ id: uid('ln'), description: `Overheads (${overheadsPct}%)`, qty: 1, unit: 'lot', unitPrice: r2(totals.overheads), amount: r2(totals.overheads) });
    if (totals.contingency > 0) lines.push({ id: uid('ln'), description: `Contingency (${contingencyPct}%)`, qty: 1, unit: 'lot', unitPrice: r2(totals.contingency), amount: r2(totals.contingency) });
    if (totals.margin > 0) lines.push({ id: uid('ln'), description: `Contractor margin (${marginPct}%)`, qty: 1, unit: 'lot', unitPrice: r2(totals.margin), amount: r2(totals.margin) });
    if (totals.discount > 0) lines.push({ id: uid('ln'), description: `Discount (${discountPct}%)`, qty: 1, unit: 'lot', unitPrice: -r2(totals.discount), amount: -r2(totals.discount) });
    if (lines.length === 0) {
      setImportError('Add at least one BOQ item before generating a quotation.');
      return;
    }
    const subtotal = r2(lines.reduce((s, l) => s + l.amount, 0));
    const vatAmount = r2(subtotal * (state.settings.vatRate / 100));
    const docNo = nextDocNumber('FBV-QUO');
    addItem('documents', {
      id: uid('doc'),
      docNo,
      type: 'quotation',
      clientId: tender.clientId,
      tenderId: tender.id,
      issueDate: TODAY,
      dueDate: tender.submissionDeadline,
      status: 'Draft',
      lines,
      subtotal,
      vatAmount,
      total: r2(subtotal + vatAmount),
      amountPaid: 0,
      notes: `Generated from BOQ estimate — ${tender.refNo}`,
      createdAt: nowISO(),
    }, {
      entityRef: docNo,
      details: `Quotation ${docNo} generated from BOQ estimate — ${tender.refNo}`,
      verb: 'Created',
      verbColor: 'grey',
    });
    markEstimatePushed(est.id, docNo, tender.refNo);
    setStatusMsg({ kind: 'pushed', text: `Quotation ${docNo} created as a draft in the Document Center.` });
  };

  const onImport = async (file: File | null) => {
    if (!file) return;
    setImportError('');
    try {
      const secs = await parseBoqFile(file);
      setSections(secs);
      setEstimateId(null);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Could not parse that file.');
    }
  };

  const loadEstimate = (est: Estimate) => {
    setTenderId(est.tenderId);
    setEstimateId(est.id);
    setSections(est.sections);
    setOverheadsPct(est.overheadsPct);
    setContingencyPct(est.contingencyPct);
    setMarginPct(est.marginPct);
    setDiscountPct(est.discountPct);
    setStatusMsg(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <PageEnter>
      <PageHeader
        title="Cost Estimation & BOQ"
        subtitle="Build the Bill of Quantities, derive the bid price and push straight to a Quotation."
      />
      <TenderContextBar tenderId={tenderId} onChange={(id) => { setTenderId(id); }} />

      {/* toolbar */}
      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-app-border bg-app-card p-3 shadow-card">
        <Table2 size={16} className="ml-1 text-app-slate" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-app-slate">Template</span>
        <SelectInput
          options={[
            { value: '', label: 'Start from template…' },
            ...Object.keys(TEMPLATES).map((t) => ({ value: t, label: t })),
          ]}
          value=""
          onChange={(e) => applyTemplate(e.target.value)}
          className="h-9 w-[210px]"
        />
        <div className="mx-1 h-6 w-px bg-app-border" />
        <Btn variant="secondary" size="sm" onClick={downloadTemplate}>
          <FileDown size={14} /> Excel template
        </Btn>
        <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-app-border bg-white px-3 text-[13px] font-semibold text-app-ink transition hover:-translate-y-px hover:brightness-105">
          <FileUp size={14} /> Import BOQ from Excel
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => onImport(e.target.files?.[0] ?? null)} />
        </label>
        <Btn variant="secondary" size="sm" onClick={() => exportBoq(sections, tender?.refNo ?? 'draft')}>
          <FileSpreadsheet size={14} /> Export BOQ .xlsx
        </Btn>
        {importError && <span className="text-xs text-danger">{importError}</span>}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {/* BOQ editor (2fr) */}
        <div className="xl:col-span-2">
          <Reorder.Group axis="y" values={sections} onReorder={setSections} className="flex flex-col gap-4">
            {sections.map((sec) => (
              <SectionCard
                key={sec.id}
                section={sec}
                products={state.products}
                collapsed={Boolean(collapsed[sec.id])}
                onToggle={() => setCollapsed((c) => ({ ...c, [sec.id]: !c[sec.id] }))}
                onPatch={(p) => patchSection(sec.id, p)}
                onPatchItem={(itemId, p) => patchItem(sec.id, itemId, p)}
                onRemove={() => setSections((ss) => ss.filter((s) => s.id !== sec.id))}
              />
            ))}
          </Reorder.Group>

          {/* add section */}
          <div className="mt-4 flex items-center gap-2">
            <SelectInput
              options={[
                { value: '', label: '+ Add section…' },
                ...SECTION_SUGGESTIONS.filter((s) => !sections.some((x) => x.title === s)).map((s) => ({ value: s, label: s })),
              ]}
              value=""
              onChange={(e) => addSection(e.target.value)}
              className="h-9 w-[220px]"
            />
            <span className="text-xs text-app-muted">Sections group the BOQ — drag the grip to reorder.</span>
          </div>

          {statusMsg && (
            <motion.div
              initial={{ y: -12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className={cn(
                'mt-4 flex items-center gap-3 rounded-xl border p-4',
                statusMsg.kind === 'pushed' ? 'border-gold/40 bg-gold-soft' : 'border-success/30 bg-success-soft',
              )}
            >
              <CircleCheck size={18} className={statusMsg.kind === 'pushed' ? 'text-gold' : 'text-success'} />
              <span className="flex-1 text-sm font-medium text-app-ink">{statusMsg.text}</span>
              {statusMsg.kind === 'pushed' && (
                <Link to="/documents" className="text-xs font-semibold text-action hover:underline">Open Document Center →</Link>
              )}
            </motion.div>
          )}

          {/* saved estimates */}
          <Card className="mt-6 p-5">
            <SectionTitle>Saved Estimates</SectionTitle>
            {extras.estimates.length === 0 ? (
              <p className="mt-3 text-sm text-app-muted">No saved estimates yet — pick a tender, build the BOQ and save.</p>
            ) : (
              <table className="mt-3 w-full">
                <thead>
                  <tr className="bg-[#F8FAFC] text-left">
                    <th className="rounded-l-lg px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-app-muted">Tender</th>
                    <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-app-muted">Sections</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-app-muted">Bid Price</th>
                    <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-app-muted">Margin</th>
                    <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-app-muted">Updated</th>
                    <th className="rounded-r-lg px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-app-muted">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {extras.estimates.map((est) => {
                    const t = state.tenders.find((x) => x.id === est.tenderId);
                    const tt = computeTotals(est, state.settings.vatRate);
                    return (
                      <tr key={est.id} onClick={() => loadEstimate(est)} className="cursor-pointer border-t border-[#EEF1F5] transition-colors hover:bg-[#F8FAFC]">
                        <td className="px-3 py-2.5">
                          <span className="font-mono text-xs font-medium text-navy-800">{t?.refNo ?? '—'}</span>
                          <span className="ml-2 text-xs text-app-slate">{t?.title.slice(0, 32) ?? ''}</span>
                        </td>
                        <td className="px-3 py-2.5 text-sm text-app-slate tnum">{est.sections.length}</td>
                        <td className="px-3 py-2.5 text-right text-sm font-semibold text-app-ink tnum">{formatKESCompact(tt.total)}</td>
                        <td className="px-3 py-2.5">
                          <Pill tone={tt.marginOnBid >= 15 ? 'green' : tt.marginOnBid >= 8 ? 'amber' : 'red'}>
                            {tt.marginOnBid.toFixed(1)}%
                          </Pill>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-app-muted tnum">{formatDateTime(est.updatedAt)}</td>
                        <td className="px-3 py-2.5">
                          <Pill tone={est.status === 'Draft' ? 'amber' : 'blue'}>{est.status}</Pill>
                          {est.quotationDocNo && <span className="ml-1.5 font-mono text-[10px] text-app-muted">{est.quotationDocNo}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        {/* Bid Price Builder (1fr, sticky) */}
        <div className="xl:sticky xl:top-[76px] xl:self-start">
          <Card className="p-5">
            <div className="flex items-center gap-2">
              <Calculator size={16} className="text-action" />
              <SectionTitle>Bid Price Builder</SectionTitle>
            </div>
            <div className="mt-4 flex flex-col">
              <SummaryLine index={0} label="Direct Cost" caption="sum of BOQ items" value={totals.direct} />
              <SummaryLine index={1} label="Overheads" pct={overheadsPct} onPct={setOverheadsPct} value={totals.overheads} prefix="+" />
              <SummaryLine index={2} label="Contingency" pct={contingencyPct} onPct={setContingencyPct} value={totals.contingency} prefix="+" />
              <SummaryLine index={3} label="Subtotal" value={totals.subtotal} bold />
              <SummaryLine index={4} label="Margin" pct={marginPct} onPct={setMarginPct} value={totals.margin} prefix="+" />
              <SummaryLine index={5} label="Bid Price (excl. VAT)" value={totals.bidExVat} bold highlight />
              <SummaryLine index={6} label="Discount" pct={discountPct} onPct={setDiscountPct} value={totals.discount} prefix="−" />
              <SummaryLine index={7} label={`VAT ${state.settings.vatRate}%`} value={totals.vat} prefix="+" />
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 8 * 0.06 }}
                className="mt-2 rounded-xl bg-navy-800 p-4"
              >
                <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-white/60">Total incl. VAT — Final Bid Value</div>
                <div className="mt-1 text-[22px] font-bold leading-7 text-white tnum">
                  <TweenNumber value={totals.total} format={(n) => formatKES(n)} />
                </div>
                <div className="mt-1 text-xs text-white/60 tnum">
                  Projected profit {formatKES(totals.profit)} ({totals.marginOnBid.toFixed(1)}% of bid)
                </div>
              </motion.div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-app-muted">Margin health</span>
                <Pill tone={marginHealth.tone}>{marginHealth.label}</Pill>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-2">
              <Btn onClick={save} disabled={!tender}>Save estimate</Btn>
              <Btn variant="gold" onClick={generateQuotation} disabled={!tender}>
                Generate Quotation →
              </Btn>
              <Btn variant="secondary" onClick={() => exportBoq(sections, tender?.refNo ?? 'draft')}>
                <FileSpreadsheet size={14} /> Export .xlsx
              </Btn>
              {!tender && (
                <p className="rounded-xl bg-app-bg p-3 text-xs text-app-muted">
                  Pick a tender above to save the estimate and push it to a quotation.
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </PageEnter>
  );
}

/* ------------------------------------------------------------------ */
/* Summary line                                                        */
/* ------------------------------------------------------------------ */

function SummaryLine({
  index, label, caption, pct, onPct, value, prefix, bold, highlight,
}: {
  index: number;
  label: string;
  caption?: string;
  pct?: number;
  onPct?: (n: number) => void;
  value: number;
  prefix?: string;
  bold?: boolean;
  highlight?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.25 }}
      className={cn(
        'flex items-center justify-between gap-2 border-b border-[#EEF1F5] py-2.5',
        highlight && 'rounded-lg bg-info-soft/60 px-2',
      )}
    >
      <div className="min-w-0">
        <div className={cn('text-[13px]', bold ? 'font-bold text-app-ink' : 'font-medium text-app-slate')}>{label}</div>
        {caption && <div className="text-[11px] text-app-muted">{caption}</div>}
      </div>
      <div className="flex items-center gap-2">
        {pct != null && onPct && (
          <span className="inline-flex h-8 w-[72px] items-center rounded-lg border border-app-border bg-white px-1.5 transition focus-within:border-action">
            <input
              type="number"
              min={0}
              max={100}
              value={pct}
              onChange={(e) => onPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
              className="w-full text-right text-[13px] font-medium text-app-ink outline-none tnum"
            />
            <span className="text-[11px] text-app-muted">%</span>
          </span>
        )}
        <span className={cn('w-[130px] text-right tnum', bold ? 'text-[15px] font-bold text-app-ink' : 'text-[13px] font-semibold text-app-slate')}>
          {prefix}{formatKES(value, { decimals: 0 })}
        </span>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* BOQ section card                                                    */
/* ------------------------------------------------------------------ */

function SectionCard({
  section, products, collapsed, onToggle, onPatch, onPatchItem, onRemove,
}: {
  section: BoqSection;
  products: Product[];
  collapsed: boolean;
  onToggle: () => void;
  onPatch: (p: Partial<BoqSection>) => void;
  onPatchItem: (itemId: string, p: Partial<BoqItem>) => void;
  onRemove: () => void;
}) {
  const controls = useDragControls();
  const subtotal = section.items.reduce((s, it) => s + it.qty * it.rate, 0);
  return (
    <Reorder.Item
      value={section}
      dragListener={false}
      dragControls={controls}
      className="overflow-hidden rounded-xl border border-app-border bg-app-card shadow-card"
      whileDrag={{ scale: 1.01, boxShadow: '0 8px 20px rgba(15,36,56,.14)' }}
    >
      {/* header */}
      <div className="flex items-center gap-2 border-b border-app-border bg-[#F8FAFC] px-3 py-2.5">
        <button
          onPointerDown={(e) => controls.start(e)}
          className="cursor-grab text-app-muted hover:text-app-ink active:cursor-grabbing"
          aria-label="Drag section"
        >
          <GripVertical size={15} />
        </button>
        <button onClick={onToggle} className="text-app-muted transition hover:text-app-ink" aria-label="Collapse section">
          <ChevronDown size={15} className={cn('transition-transform duration-200', collapsed && '-rotate-90')} />
        </button>
        <input
          value={section.title}
          onChange={(e) => onPatch({ title: e.target.value })}
          className="h-8 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-[13px] font-semibold text-app-ink outline-none transition hover:border-app-border focus:border-action focus:bg-white"
        />
        <span className="rounded-full bg-grey-soft px-2 py-0.5 text-[11px] font-semibold text-grey tnum">
          {section.items.length} item{section.items.length === 1 ? '' : 's'}
        </span>
        <span className="w-[130px] text-right text-[13px] font-bold text-app-ink tnum">{formatKES(subtotal, { decimals: 0 })}</span>
        <Btn
          variant="secondary" size="sm"
          onClick={() => onPatch({ items: [...section.items, newBoqItem()] })}
        >
          <Plus size={13} /> Add item
        </Btn>
        <button onClick={onRemove} className="flex h-8 w-8 items-center justify-center rounded-lg text-app-muted transition hover:bg-danger-soft hover:text-danger" aria-label="Remove section">
          <Trash2 size={14} />
        </button>
      </div>

      {/* items */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', duration: 0.25 }}
          >
            <div className="p-3">
              {/* column headers */}
              <div className="mb-1 grid grid-cols-[24px_minmax(0,1fr)_72px_80px_130px_130px_30px] items-center gap-2 px-1">
                <span />
                <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-app-muted">Description</span>
                <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-app-muted">Unit</span>
                <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-app-muted">Qty</span>
                <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-app-muted">Rate (KES)</span>
                <span className="text-right text-[10px] font-semibold uppercase tracking-[0.06em] text-app-muted">Amount</span>
                <span />
              </div>
              <Reorder.Group
                axis="y"
                values={section.items}
                onReorder={(items) => onPatch({ items })}
                className="flex flex-col gap-1.5"
              >
                {section.items.map((it) => (
                  <BoqItemRow
                    key={it.id}
                    item={it}
                    products={products}
                    onPatch={(p) => onPatchItem(it.id, p)}
                    onRemove={() => onPatch({ items: section.items.filter((x) => x.id !== it.id) })}
                  />
                ))}
              </Reorder.Group>
              <button
                onClick={() => onPatch({ items: [...section.items, newBoqItem()] })}
                className="mt-2 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-action transition hover:bg-info-soft"
              >
                <Plus size={13} /> Add row
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Reorder.Item>
  );
}

/* ------------------------------------------------------------------ */
/* BOQ item row (draggable, product combobox)                          */
/* ------------------------------------------------------------------ */

function BoqItemRow({
  item, products, onPatch, onRemove,
}: {
  item: BoqItem;
  products: Product[];
  onPatch: (p: Partial<BoqItem>) => void;
  onRemove: () => void;
}) {
  const controls = useDragControls();
  const [pickerOpen, setPickerOpen] = useState(false);
  const q = item.description.trim().toLowerCase();
  const matches = (q ? products.filter((p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)) : products).slice(0, 6);
  const amount = item.qty * item.rate;

  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      initial={{ y: -8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="grid grid-cols-[24px_minmax(0,1fr)_72px_80px_130px_130px_30px] items-center gap-2 rounded-lg border border-transparent px-1 py-0.5 hover:border-app-border hover:bg-[#F8FAFC]"
      whileDrag={{ scale: 1.01, boxShadow: '0 8px 20px rgba(15,36,56,.14)', backgroundColor: '#ffffff' }}
    >
      <button
        onPointerDown={(e) => controls.start(e)}
        className="cursor-grab text-app-muted hover:text-app-ink active:cursor-grabbing"
        aria-label="Drag item"
      >
        <GripVertical size={14} />
      </button>
      <div className="relative">
        <input
          value={item.description}
          onFocus={() => setPickerOpen(true)}
          onBlur={() => setTimeout(() => setPickerOpen(false), 150)}
          onChange={(e) => onPatch({ description: e.target.value, productId: undefined })}
          placeholder="Description — search Products DB…"
          className={CELL}
        />
        {pickerOpen && matches.length > 0 && (
          <div className="absolute left-0 top-10 z-30 w-[360px] rounded-xl border border-app-border bg-white p-1 shadow-card-hover">
            {matches.map((p, i) => (
              <motion.button
                key={p.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.02 }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onPatch({ description: p.name, unit: p.unit, rate: p.sellingPrice, productId: p.id });
                  setPickerOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-app-bg"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] text-app-ink">{p.name}</span>
                  <span className="block font-mono text-[10px] text-app-muted">{p.code} · {p.unit}</span>
                </span>
                <span className="shrink-0 text-xs font-semibold text-app-ink tnum">{formatKES(p.sellingPrice, { decimals: 0 })}</span>
              </motion.button>
            ))}
          </div>
        )}
      </div>
      <input value={item.unit} onChange={(e) => onPatch({ unit: e.target.value })} className={CELL} />
      <input
        type="number" min={0} value={item.qty}
        onChange={(e) => onPatch({ qty: Math.max(0, Number(e.target.value) || 0) })}
        className={cn(CELL, 'text-right tnum')}
      />
      <input
        type="number" min={0} value={item.rate}
        onChange={(e) => onPatch({ rate: Math.max(0, Number(e.target.value) || 0) })}
        className={cn(CELL, 'text-right tnum')}
      />
      <div className="text-right">
        <motion.span
          key={amount}
          initial={{ backgroundColor: '#E8EFFC' }}
          animate={{ backgroundColor: 'rgba(232,239,252,0)' }}
          transition={{ duration: 0.3 }}
          className="rounded px-1 text-[13px] font-semibold text-app-ink tnum"
        >
          {formatKES(amount, { decimals: 0 })}
        </motion.span>
      </div>
      <button onClick={onRemove} className="flex h-7 w-7 items-center justify-center rounded-lg text-app-muted transition hover:bg-danger-soft hover:text-danger" aria-label="Remove item">
        <Trash2 size={13} />
      </button>
    </Reorder.Item>
  );
}
