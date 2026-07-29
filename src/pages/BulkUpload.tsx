/**
 * Bulk Upload Centre — /bulk-upload ⭐ v2.0 flagship.
 * 4-step Excel import wizard (template → upload → map → validate → summary)
 * per bulk-upload.md, plus import history and per-entity export.
 */
import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, CircleCheck, Download, FileSpreadsheet, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useStore, mutateStore, nowISO } from '@/lib/store';
import { PageHeader, NewPill, Pill } from '@/components/shared';
import {
  PrimaryButton, SecondaryButton, ToastStack, useToasts, markImportedRows,
} from '@/components/masterdata/shared';
import {
  ENTITIES, ENTITY_ORDER, autoMapColumns, buildPatch, buildRecord,
  downloadAllData, downloadAllTemplates, downloadTemplate, parseSpreadsheet,
  splitGrid, unmappedRequired, validateRows, rowStatus,
  type ColumnMap, type EntityKey, type RawValue, type ValidatedRow,
} from '@/components/bulkupload/entities';
import { appendHistory, lastImportCaption, loadHistory, type ImportRecord } from '@/components/bulkupload/history';
import { Stepper } from '@/components/bulkupload/Stepper';
import { UploadStep } from '@/components/bulkupload/UploadStep';
import { MapStep } from '@/components/bulkupload/MapStep';
import { CheckStep, type DupStrategy } from '@/components/bulkupload/CheckStep';
import { ImportDone, ImportProgress, type ImportSummary } from '@/components/bulkupload/FinishStep';
import { ExportCard, HowItWorks } from '@/components/bulkupload/RightRail';
import { HistoryTable } from '@/components/bulkupload/HistoryTable';
import { cn } from '@/lib/utils';

type ImportPhase = 'idle' | 'running' | 'done';

export default function BulkUpload() {
  const state = useStore();
  const [params, setParams] = useSearchParams();
  const { toasts, push, dismiss } = useToasts();

  const entityParam = params.get('entity');
  const entity: EntityKey = (ENTITY_ORDER as string[]).includes(entityParam ?? '') ? (entityParam as EntityKey) : 'products';
  const def = ENTITIES[entity];

  /* ---------------- wizard state ---------------- */
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [crash, setCrash] = useState<string | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [sheet, setSheet] = useState('');
  const [firstRowHeaders, setFirstRowHeaders] = useState(true);
  const [rows, setRows] = useState<RawValue[][]>([]);
  const [mapping, setMapping] = useState<ColumnMap[]>([]);
  const [validated, setValidated] = useState<ValidatedRow[]>([]);
  const [skipProblems, setSkipProblems] = useState(true);
  const [dupStrategy, setDupStrategy] = useState<DupStrategy>('skip');
  const [updateFilledOnly, setUpdateFilledOnly] = useState(false);

  /* ---------------- import state ---------------- */
  const [phase, setPhase] = useState<ImportPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [lastOutcomes, setLastOutcomes] = useState<{ row: number; status: 'added' | 'updated' | 'skipped' | 'failed'; detail: string }[]>([]);

  /* ---------------- history ---------------- */
  const [history, setHistory] = useState<ImportRecord[]>(() => loadHistory());
  const [flashHistoryId, setFlashHistoryId] = useState<string | null>(null);

  const gridRef = useRef<RawValue[][]>([]);

  const resetWizard = (keepEntity = true) => {
    setStep(0);
    setFile(null);
    setParsing(false);
    setParseError(null);
    setCrash(null);
    setSheetNames([]);
    setSheet('');
    setFirstRowHeaders(true);
    setRows([]);
    setMapping([]);
    setValidated([]);
    setSkipProblems(true);
    setDupStrategy('skip');
    setUpdateFilledOnly(false);
    setPhase('idle');
    setProgress(0);
    setSummary(null);
    setLastOutcomes([]);
    if (!keepEntity) {
      params.delete('entity');
      setParams(params, { replace: true });
    }
  };

  const selectEntity = (k: EntityKey) => {
    setParams({ entity: k }, { replace: true });
    resetWizard();
  };

  /* ---------------- file intake ---------------- */
  const applyGrid = (grid: RawValue[][], headersOn: boolean) => {
    const { rows: dataRows } = splitGrid(grid, headersOn);
    const { headers } = splitGrid(grid, headersOn);
    setRows(dataRows);
    setMapping(autoMapColumns(headers, dataRows, def));
  };

  const onFile = async (f: File) => {
    setFile(f);
    setParsing(true);
    setParseError(null);
    setCrash(null);
    try {
      const [parsed] = await Promise.all([
        parseSpreadsheet(f),
        new Promise((r) => setTimeout(r, 600)), // let the "Reading rows…" state breathe
      ]);
      gridRef.current = parsed.grid;
      setSheetNames(parsed.sheetNames);
      setSheet(parsed.sheet);
      applyGrid(parsed.grid, true);
      setStep(1);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const FRIENDLY = [/isn't supported/i, /limit is 5 MB/i, /couldn't find any rows/i, /couldn't find any sheets/i];
      if (FRIENDLY.some((re) => re.test(msg))) {
        setParseError(msg);
      } else {
        setCrash(msg); // unexpected parse crash → friendly full-card error
      }
    } finally {
      setParsing(false);
    }
  };

  const onSheetChange = async (s: string) => {
    setSheet(s);
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { cellDates: true });
      const grid = XLSX.utils.sheet_to_json<RawValue[]>(wb.Sheets[s], { header: 1, defval: '', raw: true });
      gridRef.current = grid;
      applyGrid(grid, firstRowHeaders);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
    }
  };

  const onToggleHeaders = (v: boolean) => {
    setFirstRowHeaders(v);
    try {
      applyGrid(gridRef.current, v);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
    }
  };

  /* ---------------- step transitions ---------------- */
  const missingRequired = useMemo(() => unmappedRequired(mapping, def), [mapping, def]);

  const goCheck = () => {
    setValidated(validateRows(def, mapping, rows, state));
    setStep(2);
  };

  /* ---------------- import ---------------- */
  const startImport = () => {
    setPhase('running');
    setProgress(0);

    // plan outcomes
    type Plan =
      | { kind: 'add'; row: ValidatedRow }
      | { kind: 'update'; row: ValidatedRow; existingId: string }
      | { kind: 'skip'; row: ValidatedRow; reason: string }
      | { kind: 'fail'; row: ValidatedRow; reason: string };

    const plan: Plan[] = validated.map((r) => {
      const s = rowStatus(r);
      if (s === 'problem') {
        return skipProblems
          ? { kind: 'skip', row: r, reason: r.issues.map((i) => i.message).join('; ') }
          : { kind: 'fail', row: r, reason: r.issues.map((i) => i.message).join('; ') };
      }
      if (s === 'duplicate') {
        return dupStrategy === 'skip'
          ? { kind: 'skip', row: r, reason: `Duplicate of ${r.dup!.code}` }
          : { kind: 'update', row: r, existingId: r.dup!.existingId };
      }
      return { kind: 'add', row: r };
    });

    const toAdd = plan.filter((p): p is Extract<Plan, { kind: 'add' }> => p.kind === 'add');
    const toUpdate = plan.filter((p): p is Extract<Plan, { kind: 'update' }> => p.kind === 'update');
    const total = plan.length;

    // animate progress through the rows (chunked for big files)
    const duration = Math.min(Math.max(total * 4, 800), 3000);
    const tick = 50;
    const steps = Math.max(1, Math.round(duration / tick));
    let i = 0;
    const timer = window.setInterval(() => {
      i += 1;
      setProgress(Math.round((i / steps) * total));
      if (i >= steps) {
        window.clearInterval(timer);
        commit();
      }
    }, tick);

    function commit() {
      const newRecords = toAdd.map((p) => buildRecord(def, p.row.raw)) as unknown as Record<string, unknown>[];
      const patches = toUpdate.map((p) => ({ id: p.existingId, patch: buildPatch(def, p.row.raw, updateFilledOnly) }));

      mutateStore((draft) => {
        const list = draft[def.plural] as unknown as ({ id: string } & Record<string, unknown>)[];
        newRecords.forEach((r) => list.unshift(r as never));
        patches.forEach(({ id, patch }) => {
          const idx = list.findIndex((x) => x.id === id);
          if (idx >= 0) {
            Object.entries(patch).forEach(([k, v]) => {
              if (v === undefined) return;
              if (updateFilledOnly && v === '') return; // "Update only filled cells"
              (list[idx] as Record<string, unknown>)[k] = v;
            });
          }
        });
      }, {
        action: 'Imported',
        entity: def.label,
        entityRef: file?.name ?? 'spreadsheet',
        details: `Bulk import: ${def.label} — ${newRecords.length} added, ${patches.length} updated by Admin User`,
        verb: 'Imported',
        verbColor: 'gold',
        text: `Bulk import: ${def.label} — ${newRecords.length} added, ${patches.length} updated, ${plan.filter((p) => p.kind === 'skip').length} skipped`,
      });

      const outcomes = plan.map((p) => ({
        row: p.row.index,
        status: (p.kind === 'add' ? 'added' : p.kind === 'update' ? 'updated' : p.kind === 'skip' ? 'skipped' : 'failed') as 'added' | 'updated' | 'skipped' | 'failed',
        detail:
          p.kind === 'add' ? 'Added as a new record'
            : p.kind === 'update' ? `Updated existing ${p.row.dup?.code ?? ''}`
              : (p as { reason?: string }).reason ?? '',
      }));

      const rec: ImportRecord = {
        id: `imp-${Date.now().toString(36)}`,
        fileName: file?.name ?? 'spreadsheet.xlsx',
        entity,
        rows: total,
        added: newRecords.length,
        updated: patches.length,
        skipped: plan.filter((p) => p.kind === 'skip').length,
        failed: plan.filter((p) => p.kind === 'fail').length,
        by: 'Admin User',
        date: nowISO(),
        outcomes: outcomes.slice(0, 500),
      };
      setHistory(appendHistory(rec));
      setFlashHistoryId(rec.id);
      markImportedRows(entity, [
        ...newRecords.map((r) => String(r.id)),
        ...patches.map((p) => p.id),
      ]);

      setSummary({ added: rec.added, updated: rec.updated, skipped: rec.skipped, failed: rec.failed, total });
      setLastOutcomes(outcomes);
      setPhase('done');
      push('success', `Import complete — ${rec.added} added, ${rec.updated} updated`);
    }
  };

  /* ---------------- reports ---------------- */
  const downloadReport = (fileName: string, outcomes: { row: number; status: string; detail: string }[], sourceRows?: ValidatedRow[]) => {
    const mapped = mapping.filter((m) => m.fieldKey);
    const headers = ['Row', 'Outcome', 'Detail', ...mapped.map((m) => def.fields.find((f) => f.key === m.fieldKey)?.header ?? m.header)];
    const data = outcomes.map((o) => {
      const src = sourceRows?.find((r) => r.index === o.row);
      const vals = mapped.map((m) => {
        const v = src?.raw[m.fieldKey];
        if (v == null) return '';
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        return String(v);
      });
      return [o.row, o.status, o.detail, ...vals];
    });
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    ws['!cols'] = headers.map((h, i) => ({ wch: Math.max(10, Math.min(36, Math.max(String(h).length, ...data.map((d) => String(d[i] ?? '').length)) + 2)) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Import report');
    XLSX.writeFile(wb, fileName, { compression: true });
  };

  const onDownloadHistoryReport = (r: ImportRecord) => {
    if (r.outcomes && r.outcomes.length > 0 && r.entity === entity && lastOutcomes.length > 0) {
      downloadReport(`fbv-import-report-${r.id}.xlsx`, r.outcomes, validated);
    } else {
      downloadReport(`fbv-import-report-${r.id}.xlsx`, r.outcomes ?? [
        { row: 0, status: 'summary', detail: `${r.added} added · ${r.updated} updated · ${r.skipped} skipped · ${r.failed} failed` },
      ]);
    }
  };

  /* ---------------- header actions ---------------- */
  const [tplMenuOpen, setTplMenuOpen] = useState(false);

  const counts: Record<EntityKey, number> = {
    products: state.products.length,
    suppliers: state.suppliers.length,
    clients: state.clients.length,
    employees: state.employees.length,
  };

  return (
    <div className="px-7 pt-6 pb-10">
      <PageHeader
        title="Bulk Upload Centre"
        subtitle="Import or export products, suppliers, clients and employees in bulk using Excel files."
        actions={
          <>
            <div className="relative">
              <SecondaryButton icon={ChevronDown} onClick={() => setTplMenuOpen((v) => !v)}>
                Download all templates
              </SecondaryButton>
              <AnimatePresence>
                {tplMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.98 }}
                    transition={{ duration: 0.15 }}
                    onMouseLeave={() => setTplMenuOpen(false)}
                    className="absolute right-0 top-10 z-20 w-56 origin-top rounded-xl border border-app-border bg-white p-1 shadow-card-hover"
                  >
                    <button
                      onClick={() => { setTplMenuOpen(false); downloadAllTemplates(); }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-semibold text-app-ink hover:bg-app-bg"
                    >
                      <FileSpreadsheet size={14} className="text-gold" /> All 4 sheets (.xlsx)
                    </button>
                    {ENTITY_ORDER.map((k) => (
                      <button
                        key={k}
                        onClick={() => { setTplMenuOpen(false); downloadTemplate(ENTITIES[k], 'xlsx'); }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] text-app-ink hover:bg-app-bg"
                      >
                        {(() => { const I = ENTITIES[k].icon; return <I size={14} className="text-app-slate" />; })()}
                        {ENTITIES[k].label} template
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <SecondaryButton icon={Download} onClick={() => downloadAllData(state)}>Export all data</SecondaryButton>
          </>
        }
      />

      {/* gold NEW pill under the title */}
      <div className="-mt-4 mb-5 flex items-center gap-2">
        <NewPill />
        <span className="text-xs text-app-muted">v2.0 flagship — fully client-side via SheetJS</span>
      </div>

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        {/* ================= main column ================= */}
        <div>
          {/* Section A — entity selector */}
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {ENTITY_ORDER.map((k, i) => {
              const d = ENTITIES[k];
              const selected = k === entity;
              return (
                <motion.button
                  key={k}
                  layout
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: i * 0.06, layout: { duration: 0.2 } }}
                  onClick={() => selectEntity(k)}
                  className={cn(
                    'relative rounded-xl border-2 bg-app-card p-4 text-left shadow-card transition-all duration-150 hover:-translate-y-0.5 hover:shadow-card-hover',
                    selected ? 'border-action bg-info-soft/50' : 'border-app-border',
                  )}
                >
                  <AnimatePresence>
                    {selected && (
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                        transition={{ type: 'spring', duration: 0.3 }}
                        className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-action text-white"
                      >
                        <CircleCheck size={13} />
                      </motion.span>
                    )}
                  </AnimatePresence>
                  <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', selected ? 'bg-info-soft text-info' : 'bg-grey-soft text-grey')}>
                    <d.icon size={17} />
                  </span>
                  <div className="mt-2.5 text-[13px] font-semibold text-app-ink">{d.label}</div>
                  <div className="mt-0.5 text-lg font-bold text-app-ink tnum">{counts[k]} records</div>
                  <div className="mt-1 truncate text-[11px] text-app-muted">{lastImportCaption(history, k)}</div>
                </motion.button>
              );
            })}
          </div>

          {/* Section B — wizard card */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.1 }}
            className="rounded-xl border border-app-border bg-app-card p-6 shadow-card"
          >
            <div className="mb-6">
              <Stepper current={step} />
            </div>

            {crash ? (
              /* friendly full-card crash state */
              <div className="flex flex-col items-center py-10 text-center">
                <img src="/empty-box.svg" alt="" className="h-40 w-auto opacity-90" />
                <h3 className="mt-4 text-[15px] font-semibold text-app-ink">Something in that file confused us</h3>
                <p className="mt-1 max-w-sm text-sm text-app-slate">
                  The file opened, but we couldn't make sense of its contents.
                </p>
                <details className="mt-3 max-w-md rounded-lg bg-app-bg px-3 py-2 text-left text-xs text-app-muted">
                  <summary className="cursor-pointer font-semibold">Technical details</summary>
                  <p className="mt-1">{crash}</p>
                </details>
                <PrimaryButton icon={Upload} onClick={() => resetWizard()} className="mt-5">
                  Try another file
                </PrimaryButton>
              </div>
            ) : (
              <>
                {step === 0 && (
                  <UploadStep
                    def={def}
                    pickedFile={file}
                    parsing={parsing}
                    parseError={parseError}
                    onFile={onFile}
                    onRemoveFile={() => { setFile(null); setParseError(null); }}
                  />
                )}
                {step === 1 && (
                  <MapStep
                    def={def}
                    mapping={mapping}
                    onChange={setMapping}
                    sheetNames={sheetNames}
                    sheet={sheet}
                    onSheetChange={onSheetChange}
                    firstRowHeaders={firstRowHeaders}
                    onToggleHeaders={onToggleHeaders}
                  />
                )}
                {step === 2 && (
                  <CheckStep
                    def={def}
                    rows={validated}
                    mapping={mapping}
                    skipProblems={skipProblems}
                    onSkipProblems={setSkipProblems}
                    dupStrategy={dupStrategy}
                    onDupStrategy={setDupStrategy}
                    updateFilledOnly={updateFilledOnly}
                    onUpdateFilledOnly={setUpdateFilledOnly}
                  />
                )}
                {step === 3 && phase === 'running' && <ImportProgress current={progress} total={(summary?.total ?? validated.length) || 1} />}
                {step === 3 && phase === 'done' && summary && (
                  <ImportDone
                    def={def}
                    summary={summary}
                    onDownloadReport={() => downloadReport(`fbv-import-report-${def.key}.xlsx`, lastOutcomes, validated)}
                    onReset={() => resetWizard()}
                  />
                )}

                {/* wizard footer */}
                {!(step === 3 && phase !== 'idle') && (
                  <div className="mt-6 flex items-center justify-between border-t border-app-border pt-4">
                    <button
                      onClick={() => (step === 0 ? resetWizard() : setStep(step - 1))}
                      disabled={step === 0}
                      className="h-9 rounded-lg px-4 text-[13px] font-semibold text-app-slate transition hover:bg-app-bg hover:text-app-ink disabled:opacity-40"
                    >
                      Back
                    </button>
                    {step === 0 && (
                      <span className="text-xs text-app-muted">Upload a file to continue automatically</span>
                    )}
                    {step === 1 && (
                      <span title={missingRequired.length > 0 ? 'Match all required columns first' : undefined}>
                        <PrimaryButton onClick={goCheck} disabled={missingRequired.length > 0}>
                          Continue
                        </PrimaryButton>
                      </span>
                    )}
                    {step === 2 && (
                      <PrimaryButton icon={Upload} onClick={() => { setStep(3); startImport(); }}>
                        Start Import
                      </PrimaryButton>
                    )}
                  </div>
                )}
              </>
            )}
          </motion.div>
        </div>

        {/* ================= right rail ================= */}
        <div className="space-y-6">
          <HowItWorks />
          <ExportCard />
        </div>
      </div>

      {/* Section D — import history */}
      <div className="mt-8">
        <HistoryTable
          records={history}
          flashId={flashHistoryId}
          onDownloadReport={onDownloadHistoryReport}
          onRerun={(r) => { selectEntity(r.entity); }}
        />
      </div>

      {/* a11y hint for NEW styling */}
      <div className="mt-4 flex items-center gap-2 text-xs text-app-muted">
        <Pill tone="gold">Tip</Pill>
        Bulk-imported rows flash gold when you return to the {def.label.toLowerCase()} page.
      </div>

      <ToastStack toasts={toasts} dismiss={dismiss} />
    </div>
  );
}
