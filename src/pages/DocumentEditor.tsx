/**
 * Document Editor — /documents/new/:type (all six types) and edit via ?edit=<id>.
 * Two-pane split: form left, live A4 LetterheadDoc preview right, native print.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams, Navigate } from 'react-router-dom';
import { AnimatePresence, animate, motion } from 'framer-motion';
import {
  ArrowLeft, ArrowRight, Ban, Check, ChevronDown, ChevronUp, FilePlus2,
  Lock, Paperclip, Plus, Printer, Send, Stamp, Trash2, X,
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import type { Approval, DocType, FbvDocument } from '@/lib/store';
import {
  addItem, getState, mutateStore, nextDocNumber, nowISO, readFileAsBase64,
  removeItem, uid, updateItem, useStore, TODAY,
} from '@/lib/store';
import { formatKES, vatAmount } from '@/lib/format';
import {
  CurrencyInput, DateInput, Field, Pill, SelectInput, TextInput, TextareaInput,
} from '@/components/shared';
import { cn } from '@/lib/utils';
import { Combobox } from '@/components/documents/Combobox';
import {
  DOC_META, DOC_STATUS_TONE, NEXT_STAGE, buildConvertedDoc, canConvert,
  docDisplayStatus, isLocked,
} from '@/components/documents/docConfig';
import {
  DEFAULT_TERMS, PENALTY_CLAUSES, getDocExtras, setDocExtras,
} from '@/components/documents/extras';
import type { DocExtras } from '@/components/documents/extras';
import {
  LetterheadDoc, partyLabelFor, resolveParty, useDocPrinter,
} from '@/components/documents/LetterheadDoc';
import type { LetterDoc } from '@/components/documents/LetterheadDoc';

interface EditableLine {
  id: string;
  productId?: string;
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
}

/* ---------------- number tween (totals, 300ms) ---------------- */
function Tween({ value, format, className }: { value: number; format: (n: number) => string; className?: string }) {
  const [display, setDisplay] = useState(value);
  const current = useRef(value);
  useEffect(() => {
    const c = animate(current.current, value, {
      duration: 0.3,
      ease: 'easeOut',
      onUpdate: (v) => {
        current.current = v;
        setDisplay(v);
      },
    });
    return () => c.stop();
  }, [value]);
  return <span className={className}>{format(display)}</span>;
}

const newLine = (): EditableLine => ({ id: uid('ln'), description: '', qty: 1, unit: 'pcs', unitPrice: 0 });

export default function DocumentEditor() {
  const { type } = useParams<{ type: string }>();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');
  const navigate = useNavigate();
  const state = useStore();
  const printer = useDocPrinter();

  const docType = (DOC_META as Record<string, unknown>)[type ?? ''] ? (type as DocType) : null;

  /* ---------------- form state ---------------- */
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [clientId, setClientId] = useState('');
  const [tenderId, setTenderId] = useState('');
  const [issueDate, setIssueDate] = useState(TODAY);
  const [dueDate, setDueDate] = useState('');
  const [lines, setLines] = useState<EditableLine[]>([newLine()]);
  const [extras, setExtras] = useState<DocExtras>(() => getDocExtras(undefined));
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [zoom, setZoom] = useState<'fit' | number>('fit');

  const existing = useMemo(
    () => (editId ? state.documents.find((d) => d.id === editId) : undefined),
    [editId, state.documents],
  );

  /* Load an existing document into the form (once per id). */
  useEffect(() => {
    if (!docType) return;
    const key = editId ?? `new:${docType}`;
    if (loadedFor === key) return;
    if (editId) {
      const doc = getState().documents.find((d) => d.id === editId);
      if (!doc) return; // handled below by not-found guard
      setClientId(doc.clientId);
      setTenderId(doc.tenderId ?? '');
      setIssueDate(doc.issueDate);
      setDueDate(doc.dueDate ?? '');
      setLines(doc.lines.map((l) => ({ id: l.id, productId: l.productId, description: l.description, qty: l.qty, unit: l.unit, unitPrice: l.unitPrice })));
      setExtras(getDocExtras(doc.id));
    } else {
      setClientId('');
      setTenderId('');
      setIssueDate(TODAY);
      setDueDate('');
      setLines([newLine()]);
      setExtras(getDocExtras(undefined));
    }
    setLoadedFor(key);
  }, [docType, editId, loadedFor]);

  const meta = docType ? DOC_META[docType] : null;
  const isReceipt = docType === 'receipt';
  const isContract = docType === 'contract';
  const isPO = docType === 'purchase-order';
  const locked = existing ? isLocked(existing) : false;
  const display = existing ? docDisplayStatus(existing, state.approvals) : ('Draft' as const);
  const pendingApproval = useMemo(
    () => (existing ? state.approvals.find((a) => a.notes === `doc:${existing.id}` && a.status === 'Pending') : undefined),
    [existing, state.approvals],
  );

  const docNo = existing?.docNo
    ?? (docType ? nextDocNumber(state.settings.docPrefixes[docType] ?? 'FBV-DOC') : '');

  /* ---------------- parties & tenders ---------------- */
  const partyOptions = useMemo(() => {
    if (isPO) {
      return state.suppliers.map((s) => ({ value: s.id, label: s.name, caption: `${s.code} · ${s.category}` }));
    }
    return state.clients.map((c) => ({ value: c.id, label: c.name, caption: `${c.code} · ${c.type}` }));
  }, [isPO, state.suppliers, state.clients]);

  const tenderOptions = useMemo(
    () => state.tenders
      .filter((t) => !clientId || t.clientId === clientId)
      .map((t) => ({ value: t.id, label: t.refNo, caption: `${t.title} · ${t.status}` })),
    [state.tenders, clientId],
  );

  const productOptions = useMemo(
    () => state.products.map((p) => ({
      value: p.id,
      label: p.name,
      caption: `${p.code} · ${formatKES(isPO ? p.costPrice : p.sellingPrice)} / ${p.unit}`,
    })),
    [state.products, isPO],
  );

  /* ---------------- totals ---------------- */
  const totals = useMemo(() => {
    const subtotal = Math.round(lines.reduce((s, l) => s + l.qty * l.unitPrice, 0) * 100) / 100;
    const discount = extras.discountType === 'percent'
      ? Math.round(subtotal * (extras.discountValue / 100) * 100) / 100
      : Math.min(extras.discountValue || 0, subtotal);
    const net = subtotal - discount;
    const vat = isReceipt ? 0 : vatAmount(net, state.settings.vatRate);
    return { subtotal, discount, net, vat, total: Math.round((net + vat) * 100) / 100 };
  }, [lines, extras.discountType, extras.discountValue, isReceipt, state.settings.vatRate]);

  /* ---------------- letterhead payload (live preview + print) ---------------- */
  const letter: LetterDoc | null = useMemo(() => {
    if (!docType) return null;
    const s = getState();
    return {
      type: docType,
      docNo,
      issueDate,
      dueDate: dueDate || undefined,
      party: resolveParty(s, docType, clientId),
      partyLabel: partyLabelFor(docType),
      tenderRef: tenderId ? s.tenders.find((t) => t.id === tenderId)?.refNo : undefined,
      lines: lines.map((l) => ({ ...l, amount: Math.round(l.qty * l.unitPrice * 100) / 100 })),
      subtotal: totals.subtotal,
      discountAmount: totals.discount,
      vat: totals.vat,
      total: totals.total,
      terms: extras.terms,
      contract: isContract ? extras.contract : undefined,
    };
  }, [docType, docNo, issueDate, dueDate, clientId, tenderId, lines, totals, extras, isContract]);

  const previewSig = JSON.stringify(letter);

  /* ---------------- mutations ---------------- */
  function assembleDoc(status: FbvDocument['status'], id: string, no: string): FbvDocument {
    return {
      id,
      docNo: no,
      type: docType as DocType,
      clientId,
      tenderId: tenderId || undefined,
      issueDate,
      dueDate: dueDate || undefined,
      status,
      lines: lines
        .filter((l) => l.description.trim() || l.qty * l.unitPrice > 0)
        .map((l) => ({ ...l, amount: Math.round(l.qty * l.unitPrice * 100) / 100 })),
      subtotal: totals.subtotal,
      vatAmount: totals.vat,
      total: totals.total,
      amountPaid: existing?.amountPaid ?? 0,
      convertedFromId: existing?.convertedFromId,
      notes: extras.terms !== DEFAULT_TERMS ? extras.terms : existing?.notes,
      createdAt: existing?.createdAt ?? nowISO(),
    };
  }

  function validate(): string | null {
    if (!clientId) return `Please select a ${isPO ? 'supplier' : 'client'} first.`;
    const real = lines.filter((l) => l.description.trim() && l.qty > 0);
    if (real.length === 0) return 'Add at least one line item with a description and quantity.';
    if (!issueDate) return 'Please set the document date.';
    return null;
  }

  /** Save (create or update). Returns the document id, or null on validation failure. */
  function saveDraft(quiet = false): string | null {
    const err = validate();
    if (err) {
      toast.error(err);
      return null;
    }
    const s = getState();
    let id = existing?.id;
    if (id) {
      const doc = assembleDoc(existing!.status, id, existing!.docNo);
      updateItem('documents', id, doc, {
        action: 'Updated', entity: meta!.label, entityRef: doc.docNo,
        details: `Updated ${meta!.label} — ${doc.docNo} (${formatKES(doc.total)})`,
        verb: 'Updated', verbColor: 'blue',
      });
    } else {
      id = uid('doc');
      const no = nextDocNumber(s.settings.docPrefixes[docType!] ?? 'FBV-DOC', s.settings.docYear, s);
      const doc = assembleDoc('Draft', id, no);
      addItem('documents', doc, {
        action: 'Created', entity: meta!.label, entityRef: no,
        details: `Created ${meta!.label} — ${no} for ${resolveParty(s, docType!, clientId)?.name ?? ''} (${formatKES(doc.total)})`,
        verb: 'Created', verbColor: 'grey',
      });
      navigate(`/documents/new/${docType}?edit=${id}`, { replace: true });
    }
    persistExtras(id);
    pushMilestones(id);
    if (!quiet) toast.success(`${existing ? 'Updated' : 'Saved'} ${docNo || ''} as draft`);
    return id;
  }

  function persistExtras(id: string) {
    setDocExtras(id, extras);
  }

  /** Contract milestones quick-add feeds the Contract Milestones collection. */
  function pushMilestones(docId: string) {
    if (!isContract) return;
    const doc = getState().documents.find((d) => d.id === docId);
    if (!doc) return;
    const fresh = extras.contract.milestones.filter((m) => !m.pushed && m.title.trim());
    if (fresh.length === 0) return;
    fresh.forEach((m) => {
      addItem('milestones', {
        id: uid('mil'),
        contractId: docId,
        contractTitle: doc.lines[0]?.description ?? doc.docNo,
        clientId,
        title: m.title,
        dueDate: m.dueDate || doc.dueDate || TODAY,
        amount: m.amount || undefined,
        status: 'Pending',
      }, {
        action: 'Created', entity: 'Contract Milestone', entityRef: m.title,
        details: `Milestone "${m.title}" added from ${doc.docNo}`,
        verb: 'Created', verbColor: 'grey',
      });
    });
    const updated: DocExtras = {
      ...extras,
      contract: {
        ...extras.contract,
        milestones: extras.contract.milestones.map((m) =>
          fresh.some((f) => f.id === m.id) ? { ...m, pushed: true } : m),
      },
    };
    setExtras(updated);
    setDocExtras(docId, updated);
  }

  function submitForApproval() {
    const id = saveDraft(true) ?? existing?.id;
    if (!id) return;
    const s = getState();
    const doc = s.documents.find((d) => d.id === id);
    if (!doc) return;
    const partyName = resolveParty(s, docType!, doc.clientId)?.name ?? '';
    const apr: Approval = {
      id: uid('apr'),
      refNo: nextDocNumber('FBV-APR', s.settings.docYear, s),
      type: meta!.label,
      title: `${doc.docNo} — ${meta!.label} to ${partyName}`,
      amount: doc.total,
      requestedBy: 'Admin User',
      requestedAt: nowISO(),
      status: 'Pending',
      notes: `doc:${doc.id}`,
    };
    mutateStore((draft) => {
      draft.approvals.unshift(apr);
      const d = draft.documents.find((x) => x.id === id);
      if (d) d.status = 'Sent';
    }, {
      action: 'Submitted', entity: meta!.label, entityRef: doc.docNo,
      details: `Submitted ${doc.docNo} for approval (${apr.refNo})`,
      verb: 'Submitted', verbColor: 'blue',
      text: `${meta!.label} ${doc.docNo} sent to the Approvals queue`,
    });
    toast.success(`${doc.docNo} submitted for approval`);
  }

  function approveDoc() {
    if (!existing || !pendingApproval) return;
    updateItem('approvals', pendingApproval.id, {
      status: 'Approved', decidedBy: 'Admin User', decidedAt: nowISO(),
    }, {
      action: 'Approved', entity: meta!.label, entityRef: existing.docNo,
      details: `Approved ${meta!.label} — ${existing.docNo}`,
      verb: 'Approved', verbColor: 'green',
    });
    toast.success(`${existing.docNo} approved — ready to issue`);
  }

  function issueDoc() {
    if (!existing) return;
    updateItem('documents', existing.id, { status: 'Issued' }, {
      action: 'Issued', entity: meta!.label, entityRef: existing.docNo,
      details: `Issued ${meta!.label} — ${existing.docNo} (${formatKES(existing.total)})`,
      verb: 'Issued', verbColor: 'navy',
    });
    toast.success(`${existing.docNo} issued`);
  }

  function convertDoc() {
    if (!existing || !docType) return;
    const target = NEXT_STAGE[docType];
    if (!target) return;
    const s = getState();
    const newDoc = buildConvertedDoc(s, existing, target);
    addItem('documents', newDoc, {
      action: 'Created', entity: DOC_META[target].label, entityRef: newDoc.docNo,
      details: `Converted ${existing.docNo} → ${newDoc.docNo}`,
      verb: 'Converted', verbColor: 'blue',
      text: `${DOC_META[target].label} ${newDoc.docNo} created from ${existing.docNo}`,
    });
    const src = getDocExtras(existing.id);
    setDocExtras(newDoc.id, {
      ...getDocExtras(newDoc.id),
      discountType: src.discountType, discountValue: src.discountValue, terms: src.terms,
    });
    toast.success(`${DOC_META[target].label} ${newDoc.docNo} created from ${existing.docNo}`);
    navigate(`/documents/new/${target}?edit=${newDoc.id}`);
  }

  function printCurrent() {
    if (!letter) return;
    toast.success(`Opening print dialog for ${docNo}…`);
    printer.request(letter, state.profile);
  }

  async function attachFile(file: File | undefined) {
    if (!file || !existing) return;
    try {
      const { fileName, fileData } = await readFileAsBase64(file);
      addItem('dms', {
        id: uid('dms'),
        docType: 'other',
        refNo: existing.docNo,
        title: fileName,
        issuer: 'Future Bright Ventures Ltd',
        issueDate: TODAY,
        fileName,
        fileData,
        version: 'v1.0',
        notes: `Attachment for ${existing.docNo}`,
        createdAt: nowISO(),
      }, {
        action: 'Created', entity: 'Business Document', entityRef: fileName,
        details: `Attached ${fileName} to ${existing.docNo}`,
        verb: 'Uploaded', verbColor: 'blue',
      });
      toast.success(`${fileName} attached (linked in Business Documents)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not read that file.');
    }
  }

  /* ---------------- guards ---------------- */
  if (!docType || !meta) return <Navigate to="/documents" replace />;
  if (editId && !existing && state.documents.length > 0) {
    return <Navigate to="/documents" replace />;
  }

  const lineCount = lines.filter((l) => l.description.trim() || l.qty * l.unitPrice > 0).length;
  const attachments = existing ? state.dms.filter((x) => x.refNo === existing.docNo) : [];
  const inputDisabled = locked;

  /* ================================ RENDER ================================ */
  return (
    <div className="px-7 pt-6 pb-10">
      <Toaster position="top-right" richColors toastOptions={{ duration: 4000 }} />
      {printer.portal}

      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="mb-5 flex flex-wrap items-center gap-3"
      >
        <button
          onClick={() => navigate('/documents')}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-app-border bg-white px-3 text-[13px] font-semibold text-app-ink transition hover:-translate-y-px hover:brightness-105"
        >
          <ArrowLeft size={15} /> Document Center
        </button>
        <div>
          <h1 className="text-[22px] font-bold text-app-ink">
            {existing ? meta.label : `New ${meta.label}`}
          </h1>
        </div>
        <span className={cn('flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-semibold', meta.tile)}>
          <meta.icon size={14} /> {meta.label}
        </span>
        <Pill tone={DOC_STATUS_TONE[display]} pulse={display === 'Overdue'}>{display}</Pill>
        {locked && (
          <span className="flex items-center gap-1 text-xs font-medium text-app-muted">
            <Lock size={13} /> Issued documents are locked — request a change via Approvals.
          </span>
        )}
      </motion.div>

      <div className="grid items-start gap-6 xl:grid-cols-[55fr_45fr]">
        {/* ============================ FORM PANE ============================ */}
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="min-w-0"
        >
          {/* 1 — Header block */}
          <div className="rounded-xl border border-app-border bg-app-card p-5 shadow-card">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Doc No" hint={existing ? undefined : 'Auto-assigned on save'}>
                <div className="flex h-[38px] items-center gap-2 rounded-lg border border-app-border bg-app-bg px-3">
                  <Lock size={13} className="shrink-0 text-app-muted" />
                  <span className="font-mono text-[13px] font-semibold text-navy-800">{docNo}</span>
                </div>
              </Field>
              <Field label="Currency">
                <div className="flex h-[38px] items-center gap-2 rounded-lg border border-app-border bg-app-bg px-3">
                  <Lock size={13} className="shrink-0 text-app-muted" />
                  <span className="text-sm text-app-slate">KES — Kenyan Shilling</span>
                </div>
              </Field>
              <Field label={isPO ? 'Supplier' : 'Client'} required className="col-span-2">
                <Combobox
                  options={partyOptions}
                  value={clientId}
                  onChange={(v) => {
                    setClientId(v);
                    setTenderId('');
                  }}
                  placeholder={isPO ? 'Search suppliers…' : 'Search clients…'}
                  disabled={inputDisabled}
                />
              </Field>
              {!isPO && (
                <Field label="Linked Tender" hint="Filtered by the selected client" className="col-span-2">
                  <Combobox
                    options={tenderOptions}
                    value={tenderId}
                    onChange={setTenderId}
                    placeholder={clientId ? 'Link a tender (optional)…' : 'Select a client first'}
                    disabled={inputDisabled || !clientId}
                    allowClear
                  />
                </Field>
              )}
              <Field label="Date" required>
                <DateInput value={issueDate} onChange={(e) => setIssueDate(e.target.value)} disabled={inputDisabled} />
              </Field>
              <Field label={docType === 'quotation' ? 'Valid Until' : isPO ? 'Delivery By' : 'Due Date'}>
                <DateInput value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={inputDisabled} />
              </Field>
            </div>
          </div>

          {/* 2 — Lines editor */}
          <div className="mt-4 rounded-xl border border-app-border bg-app-card p-5 shadow-card">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-app-ink">Line Items</h3>
              <span className="text-xs text-app-muted tabular-nums">
                {lineCount} line{lineCount === 1 ? '' : 's'}
              </span>
            </div>

            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {lines.map((l, idx) => {
                  const amount = Math.round(l.qty * l.unitPrice * 100) / 100;
                  return (
                    <motion.div
                      key={l.id}
                      layout="position"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2, delay: idx * 0.03 }}
                      className="rounded-lg border border-app-border bg-white p-3"
                    >
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <TextInput
                            value={l.description}
                            onChange={(e) => setLines((xs) => xs.map((x) => (x.id === l.id ? { ...x, description: e.target.value } : x)))}
                            placeholder="Description of goods or services…"
                            disabled={inputDisabled}
                          />
                        </div>
                        <div className="w-56 shrink-0">
                          <Combobox
                            options={productOptions}
                            value={l.productId ?? ''}
                            onChange={(v) => {
                              const p = state.products.find((x) => x.id === v);
                              if (!p) return;
                              setLines((xs) => xs.map((x) => (x.id === l.id
                                ? {
                                    ...x,
                                    productId: p.id,
                                    description: p.name,
                                    unit: p.unit,
                                    unitPrice: isPO ? p.costPrice : p.sellingPrice,
                                  }
                                : x)));
                            }}
                            placeholder="Pick product…"
                            searchPlaceholder="Search products…"
                            disabled={inputDisabled}
                            allowClear
                          />
                        </div>
                        <div className="flex shrink-0 flex-col gap-0.5">
                          <button
                            type="button"
                            disabled={inputDisabled || idx === 0}
                            onClick={() => setLines((xs) => {
                              const arr = [...xs];
                              [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
                              return arr;
                            })}
                            className="flex h-[18px] w-7 items-center justify-center rounded text-app-muted transition hover:bg-app-bg disabled:opacity-30"
                            aria-label="Move line up"
                          >
                            <ChevronUp size={13} />
                          </button>
                          <button
                            type="button"
                            disabled={inputDisabled || idx === lines.length - 1}
                            onClick={() => setLines((xs) => {
                              const arr = [...xs];
                              [arr[idx + 1], arr[idx]] = [arr[idx], arr[idx + 1]];
                              return arr;
                            })}
                            className="flex h-[18px] w-7 items-center justify-center rounded text-app-muted transition hover:bg-app-bg disabled:opacity-30"
                            aria-label="Move line down"
                          >
                            <ChevronDown size={13} />
                          </button>
                        </div>
                        <button
                          type="button"
                          disabled={inputDisabled || lines.length === 1}
                          onClick={() => setLines((xs) => xs.filter((x) => x.id !== l.id))}
                          className="flex h-[38px] w-8 shrink-0 items-center justify-center rounded-lg text-app-muted transition hover:bg-danger-soft hover:text-danger disabled:opacity-30"
                          aria-label="Delete line"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                      <div className="mt-2 flex flex-wrap items-end gap-2">
                        <Field label="Qty" className="w-20">
                          <TextInput
                            type="number"
                            min={0}
                            value={l.qty}
                            disabled={inputDisabled}
                            onChange={(e) => setLines((xs) => xs.map((x) => (x.id === l.id ? { ...x, qty: Math.max(0, Number(e.target.value) || 0) } : x)))}
                            className="tnum"
                          />
                        </Field>
                        <Field label="Unit" className="w-24">
                          <TextInput
                            value={l.unit}
                            disabled={inputDisabled}
                            onChange={(e) => setLines((xs) => xs.map((x) => (x.id === l.id ? { ...x, unit: e.target.value } : x)))}
                          />
                        </Field>
                        <Field label="Unit Price" className="w-44">
                          <CurrencyInput
                            value={l.unitPrice}
                            disabled={inputDisabled}
                            onChange={(v) => setLines((xs) => xs.map((x) => (x.id === l.id ? { ...x, unitPrice: Math.max(0, Number(v) || 0) } : x)))}
                          />
                        </Field>
                        {!isReceipt && (
                          <span className="mb-[9px] inline-flex items-center rounded-full bg-info-soft px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-info">
                            VAT 16%
                          </span>
                        )}
                        <div className="ml-auto pb-[3px] text-right">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-app-muted">Amount</div>
                          <div className="text-sm font-bold tabular-nums text-app-ink">{formatKES(amount)}</div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>

            {!inputDisabled && (
              <button
                type="button"
                onClick={() => setLines((xs) => [...xs, newLine()])}
                className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-app-border text-[13px] font-semibold text-app-slate transition hover:border-action hover:text-action"
              >
                <Plus size={15} /> Add line
              </button>
            )}
          </div>

          {/* 3 — Totals card */}
          <div className="mt-4 rounded-xl border border-app-border bg-app-card p-5 shadow-card">
            <div className="ml-auto w-full max-w-[360px] space-y-2">
              <div className="flex items-center justify-between text-sm text-app-slate">
                <span>Subtotal</span>
                <Tween value={totals.subtotal} format={formatKES} className="tabular-nums font-medium text-app-ink" />
              </div>
              <div className="flex items-center justify-between gap-2 text-sm text-app-slate">
                <span className="flex items-center gap-1.5">
                  Discount
                  <span className="flex overflow-hidden rounded-md border border-app-border">
                    {(['amount', 'percent'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        disabled={inputDisabled}
                        onClick={() => setExtras((x) => ({ ...x, discountType: m }))}
                        className={cn(
                          'px-2 py-0.5 text-[10px] font-bold uppercase',
                          extras.discountType === m ? 'bg-navy-800 text-white' : 'bg-white text-app-muted',
                        )}
                      >
                        {m === 'amount' ? 'KES' : '%'}
                      </button>
                    ))}
                  </span>
                </span>
                <span className="w-40">
                  <CurrencyInput
                    value={extras.discountValue}
                    disabled={inputDisabled}
                    onChange={(v) => setExtras((x) => ({ ...x, discountValue: Math.max(0, Number(v) || 0) }))}
                  />
                </span>
              </div>
              {!isReceipt && (
                <div className="flex items-center justify-between text-sm text-app-slate">
                  <span>VAT 16%</span>
                  <Tween value={totals.vat} format={formatKES} className="tabular-nums font-medium text-app-ink" />
                </div>
              )}
              <div className="flex items-center justify-between border-t-2 border-app-ink pt-2">
                <span className="text-[13px] font-bold uppercase tracking-[0.04em] text-navy-800">
                  Grand Total KES
                </span>
                <Tween
                  value={totals.total}
                  format={formatKES}
                  className="text-xl font-bold tabular-nums text-navy-800"
                />
              </div>
            </div>
          </div>

          {/* 4 — Contract variant fields */}
          {isContract && (
            <div className="mt-4 rounded-xl border border-app-border bg-app-card p-5 shadow-card">
              <h3 className="mb-3 text-[15px] font-semibold text-app-ink">Contract Details</h3>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Contract Period — Start">
                  <DateInput
                    value={extras.contract.startDate}
                    disabled={inputDisabled}
                    onChange={(e) => setExtras((x) => ({ ...x, contract: { ...x.contract, startDate: e.target.value } }))}
                  />
                </Field>
                <Field label="Contract Period — End">
                  <DateInput
                    value={extras.contract.endDate}
                    disabled={inputDisabled}
                    onChange={(e) => setExtras((x) => ({ ...x, contract: { ...x.contract, endDate: e.target.value } }))}
                  />
                </Field>
                <Field label="Penalty Clause" className="col-span-2">
                  <SelectInput
                    value={extras.contract.penalty}
                    disabled={inputDisabled}
                    onChange={(e) => setExtras((x) => ({ ...x, contract: { ...x.contract, penalty: e.target.value } }))}
                    options={PENALTY_CLAUSES.map((p) => ({ value: p, label: p }))}
                  />
                </Field>
                <Field label="Signatory — Future Bright Ventures" hint="Directors from Company Profile / employees">
                  <TextInput
                    value={extras.contract.signatoryFbv}
                    disabled={inputDisabled}
                    onChange={(e) => setExtras((x) => ({ ...x, contract: { ...x.contract, signatoryFbv: e.target.value } }))}
                    list="fbv-signatories"
                  />
                </Field>
                <Field label="Signatory — Client">
                  <TextInput
                    value={extras.contract.signatoryClient}
                    disabled={inputDisabled}
                    onChange={(e) => setExtras((x) => ({ ...x, contract: { ...x.contract, signatoryClient: e.target.value } }))}
                    placeholder="Client's authorized signatory"
                  />
                </Field>
              </div>
              <datalist id="fbv-signatories">
                {state.employees.map((e) => (
                  <option key={e.id} value={e.name}>{e.role}</option>
                ))}
              </datalist>

              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[13px] font-medium text-app-ink">Milestones</span>
                  <span className="text-xs text-app-muted">Feeds Contract Milestones on save</span>
                </div>
                <div className="space-y-2">
                  {extras.contract.milestones.map((m) => (
                    <div key={m.id} className="flex items-end gap-2">
                      <Field label="Title" className="flex-1">
                        <TextInput
                          value={m.title}
                          disabled={inputDisabled || m.pushed}
                          onChange={(e) => setExtras((x) => ({
                            ...x,
                            contract: {
                              ...x.contract,
                              milestones: x.contract.milestones.map((y) => (y.id === m.id ? { ...y, title: e.target.value } : y)),
                            },
                          }))}
                          placeholder="e.g. Phase 1 delivery"
                        />
                      </Field>
                      <Field label="Due" className="w-36">
                        <DateInput
                          value={m.dueDate}
                          disabled={inputDisabled || m.pushed}
                          onChange={(e) => setExtras((x) => ({
                            ...x,
                            contract: {
                              ...x.contract,
                              milestones: x.contract.milestones.map((y) => (y.id === m.id ? { ...y, dueDate: e.target.value } : y)),
                            },
                          }))}
                        />
                      </Field>
                      <Field label="Amount" className="w-40">
                        <CurrencyInput
                          value={m.amount}
                          disabled={inputDisabled || m.pushed}
                          onChange={(v) => setExtras((x) => ({
                            ...x,
                            contract: {
                              ...x.contract,
                              milestones: x.contract.milestones.map((y) => (y.id === m.id ? { ...y, amount: Math.max(0, Number(v) || 0) } : y)),
                            },
                          }))}
                        />
                      </Field>
                      <button
                        type="button"
                        disabled={inputDisabled}
                        onClick={() => setExtras((x) => ({
                          ...x,
                          contract: { ...x.contract, milestones: x.contract.milestones.filter((y) => y.id !== m.id) },
                        }))}
                        className="flex h-[38px] w-8 items-center justify-center rounded-lg text-app-muted transition hover:bg-danger-soft hover:text-danger disabled:opacity-30"
                        aria-label="Remove milestone"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                  {!inputDisabled && (
                    <button
                      type="button"
                      onClick={() => setExtras((x) => ({
                        ...x,
                        contract: {
                          ...x.contract,
                          milestones: [...x.contract.milestones, { id: uid('mil'), title: '', dueDate: '', amount: 0 }],
                        },
                      }))}
                      className="flex h-9 items-center gap-1.5 rounded-lg border border-app-border bg-white px-3 text-[13px] font-semibold text-app-ink transition hover:brightness-105"
                    >
                      <Plus size={14} /> Add milestone
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 5 — Extras (collapsible) */}
          <div className="mt-4 rounded-xl border border-app-border bg-app-card shadow-card">
            <button
              type="button"
              onClick={() => setExtrasOpen((v) => !v)}
              className="flex w-full items-center justify-between px-5 py-4 text-left"
            >
              <span className="text-[15px] font-semibold text-app-ink">Terms, Reference &amp; Attachments</span>
              <ChevronDown size={16} className={cn('text-app-muted transition-transform', extrasOpen && 'rotate-180')} />
            </button>
            {extrasOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
                className="space-y-4 border-t border-app-border px-5 py-4"
              >
                <Field label="Terms &amp; Notes">
                  <TextareaInput
                    value={extras.terms}
                    disabled={inputDisabled}
                    onChange={(e) => setExtras((x) => ({ ...x, terms: e.target.value }))}
                    rows={3}
                  />
                </Field>
                <Field label="Internal Reference" hint="Not printed on the document">
                  <TextInput
                    value={extras.internalRef}
                    disabled={inputDisabled}
                    onChange={(e) => setExtras((x) => ({ ...x, internalRef: e.target.value }))}
                    placeholder="e.g. COST-CENTRE-04"
                  />
                </Field>
                <Field label="Attachments" hint="Saved into Business Documents, linked to this doc (2 MB cap)">
                  {existing ? (
                    <div>
                      <label
                        className={cn(
                          'flex h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-app-border text-app-slate transition hover:border-action hover:text-action',
                          inputDisabled && 'pointer-events-none opacity-50',
                        )}
                      >
                        <Paperclip size={16} />
                        <span className="text-xs font-medium">Browse files to attach</span>
                        <input type="file" className="hidden" onChange={(e) => { void attachFile(e.target.files?.[0]); e.target.value = ''; }} />
                      </label>
                      {attachments.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {attachments.map((a) => (
                            <li key={a.id} className="flex items-center justify-between rounded-lg bg-app-bg px-3 py-1.5 text-xs text-app-ink">
                              <span className="flex items-center gap-2 truncate">
                                <Paperclip size={12} className="shrink-0 text-app-muted" /> {a.fileName}
                              </span>
                              {!inputDisabled && (
                                <button
                                  type="button"
                                  onClick={() => removeItem('dms', a.id, {
                                    action: 'Deleted', entity: 'Business Document', entityRef: a.fileName,
                                    details: `Removed attachment ${a.fileName} from ${existing.docNo}`,
                                    verb: 'Deleted', verbColor: 'red',
                                  })}
                                  className="ml-2 shrink-0 text-app-muted transition hover:text-danger"
                                  aria-label="Remove attachment"
                                >
                                  <X size={13} />
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-lg bg-app-bg px-3 py-2 text-xs text-app-muted">
                      Save the document first to attach files.
                    </div>
                  )}
                </Field>
              </motion.div>
            )}
          </div>

          {/* 6 — Sticky footer */}
          <div className="sticky bottom-4 z-20 mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-app-border bg-white/95 p-3 shadow-card-hover backdrop-blur">
            {!locked && (
              <button
                onClick={() => saveDraft()}
                className="flex h-9 items-center gap-2 rounded-lg border border-app-border bg-white px-4 text-[13px] font-semibold text-app-ink transition hover:-translate-y-px hover:brightness-105 active:scale-[.98]"
              >
                <FilePlus2 size={15} /> Save Draft
              </button>
            )}
            {!locked && display === 'Draft' && (
              <button
                onClick={submitForApproval}
                className="flex h-9 items-center gap-2 rounded-lg bg-action px-4 text-[13px] font-semibold text-white transition hover:-translate-y-px hover:bg-action-hover active:scale-[.98]"
              >
                <Send size={15} /> Submit for Approval
              </button>
            )}
            {!locked && display === 'Submitted' && (
              <>
                <span className="text-xs font-medium text-app-muted">In the Approvals queue{pendingApproval ? ` (${pendingApproval.refNo})` : ''}.</span>
                <button
                  onClick={approveDoc}
                  className="flex h-9 items-center gap-2 rounded-lg bg-success px-4 text-[13px] font-semibold text-white transition hover:-translate-y-px hover:brightness-105 active:scale-[.98]"
                >
                  <Check size={15} /> Approve Document
                </button>
              </>
            )}
            {!locked && (display === 'Approved' || display === 'Sent') && (
              <button
                onClick={issueDoc}
                className="flex h-9 items-center gap-2 rounded-lg bg-navy-800 px-4 text-[13px] font-semibold text-white transition hover:-translate-y-px hover:brightness-105 active:scale-[.98]"
              >
                <Stamp size={15} /> Issue Document
              </button>
            )}
            {locked && display !== 'Cancelled' && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-app-muted">
                <Ban size={13} /> Editing locked for {display.toLowerCase()} documents.
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={printCurrent}
                className="flex h-9 items-center gap-2 rounded-lg border border-app-border bg-white px-4 text-[13px] font-semibold text-app-ink transition hover:-translate-y-px hover:brightness-105 active:scale-[.98]"
              >
                <Printer size={15} /> Print / PDF
              </button>
              {existing && canConvert(existing, state.approvals) && NEXT_STAGE[docType] && (
                <button
                  onClick={convertDoc}
                  className="flex h-9 items-center gap-2 rounded-lg bg-gold px-4 text-[13px] font-semibold text-navy-950 transition hover:-translate-y-px hover:brightness-105 active:scale-[.98]"
                >
                  Convert → {DOC_META[NEXT_STAGE[docType] as DocType].label} <ArrowRight size={15} />
                </button>
              )}
            </div>
          </div>
        </motion.div>

        {/* ============================ PREVIEW PANE ============================ */}
        <PreviewPane letter={letter} profile={state.profile} zoom={zoom} setZoom={setZoom} previewSig={previewSig} />
      </div>
    </div>
  );
}

/* ---------------- live A4 preview pane ---------------- */
function PreviewPane({
  letter,
  profile,
  zoom,
  setZoom,
  previewSig,
}: {
  letter: LetterDoc | null;
  profile: ReturnType<typeof useStore>['profile'];
  zoom: 'fit' | number;
  setZoom: (z: 'fit' | number) => void;
  previewSig: string;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(0.62);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setFitScale(Math.min(1, (el.clientWidth - 48) / 794));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = zoom === 'fit' ? fitScale : zoom;
  const pct = Math.round(scale * 100);

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="sticky top-6 min-w-0"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[13px] font-semibold text-app-slate">Live A4 Preview</span>
        <div className="flex items-center gap-1 rounded-lg border border-app-border bg-white p-1 shadow-card">
          <button
            onClick={() => setZoom(Math.max(0.3, Math.round((scale - 0.1) * 10) / 10))}
            className="h-6 w-6 rounded text-app-slate transition hover:bg-app-bg"
            aria-label="Zoom out"
          >
            −
          </button>
          <span className="w-12 text-center text-xs font-semibold tabular-nums text-app-ink">{pct}%</span>
          <button
            onClick={() => setZoom(Math.min(1.5, Math.round((scale + 0.1) * 10) / 10))}
            className="h-6 w-6 rounded text-app-slate transition hover:bg-app-bg"
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            onClick={() => setZoom('fit')}
            className={cn('h-6 rounded px-2 text-[11px] font-semibold transition', zoom === 'fit' ? 'bg-navy-800 text-white' : 'text-app-slate hover:bg-app-bg')}
          >
            Fit
          </button>
          <button
            onClick={() => setZoom(1)}
            className={cn('h-6 rounded px-2 text-[11px] font-semibold transition', zoom === 1 ? 'bg-navy-800 text-white' : 'text-app-slate hover:bg-app-bg')}
          >
            100%
          </button>
        </div>
      </div>
      <div
        ref={canvasRef}
        className="max-h-[calc(100dvh-170px)] overflow-auto rounded-xl bg-[#E4E9F0] p-6"
      >
        {letter && (
          <motion.div
            key={previewSig}
            initial={{ opacity: 0.6 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            style={{ height: 1123 * scale + 8, width: 794 * scale }}
            className="mx-auto overflow-hidden rounded-sm"
          >
            <LetterheadDoc doc={letter} profile={profile} scale={scale} />
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
