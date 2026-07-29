/**
 * Upload Document modal — the "easy attach" flow.
 * Dropzone (PDF/JPG/PNG, 2 MB cap) → smart metadata form → Save to Vault.
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CloudUpload, FileText, X, AlertTriangle, Check } from 'lucide-react';
import {
  addItem, readFileAsBase64, uid, nowISO, useStore, TODAY,
} from '@/lib/store';
import type { DmsDocument } from '@/lib/store';
import { Modal, Field, TextInput, DateInput, TextareaInput, Toggle } from '@/components/shared';
import { cn } from '@/lib/utils';
import { KINDS, kindMeta, isImage, fileSizeText, type DmsKind } from './dmsTypes';

const ISSUER_SUGGESTIONS = [
  'Kenya Revenue Authority',
  'Nairobi City County',
  'Mombasa County Government',
  'Kisumu County Government',
  'National Construction Authority',
  'Kenya Bureau of Standards',
  'National Treasury — AGPO',
  'Business Registration Service',
  'CIC Insurance Group',
  'Britam Holdings',
  'Jubilee Insurance',
];

interface PickedFile {
  fileName: string;
  fileData: string;
}

export default function UploadModal({
  open,
  onClose,
  onSaved,
  initialKind,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (title: string) => void;
  initialKind?: DmsKind;
}) {
  const state = useStore();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<PickedFile | null>(null);
  const [reading, setReading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [kind, setKind] = useState<DmsKind>('other');
  const [title, setTitle] = useState('');
  const [refNo, setRefNo] = useState('');
  const [issuer, setIssuer] = useState('');
  const [issueDate, setIssueDate] = useState(TODAY);
  const [expiryDate, setExpiryDate] = useState('');
  const [noExpiry, setNoExpiry] = useState(false);
  const [linkedId, setLinkedId] = useState('');
  const [notes, setNotes] = useState('');
  const [titleError, setTitleError] = useState<string | null>(null);

  /* Reset (and preselect kind) each time the modal opens. */
  useEffect(() => {
    if (!open) return;
    const k = initialKind ?? 'other';
    setKind(k);
    setFile(null);
    setFileError(null);
    setTitleError(null);
    setReading(false);
    setTitle(kind === 'other' ? '' : kindMeta(k).label);
    setRefNo('');
    setIssuer(kindMeta(k).defaultIssuer ?? '');
    setIssueDate(TODAY);
    setExpiryDate('');
    setNoExpiry(Boolean(kindMeta(k).noExpiry));
    setLinkedId('');
    setNotes('');
  }, [open, initialKind]);

  const pickKind = (k: DmsKind) => {
    setKind(k);
    const meta = kindMeta(k);
    if (!title || KINDS.some((m) => m.label === title)) setTitle(meta.kind === 'other' ? '' : meta.label);
    if (!issuer || KINDS.some((m) => m.defaultIssuer === issuer)) setIssuer(meta.defaultIssuer ?? '');
    if (meta.noExpiry) {
      setNoExpiry(true);
      setExpiryDate('');
    } else {
      setNoExpiry(false);
    }
  };

  const handleFile = async (f: File | undefined) => {
    if (!f) return;
    setFileError(null);
    setReading(true);
    try {
      const picked = await readFileAsBase64(f);
      setFile(picked);
      if (!title) setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '));
    } catch (e) {
      setFile(null);
      setFileError(e instanceof Error ? e.message : 'Could not read that file. Please try again.');
    } finally {
      setReading(false);
    }
  };

  const save = () => {
    if (!title.trim()) {
      setTitleError('Please give the document a name, e.g. "Tax Compliance Certificate".');
      return;
    }
    const meta = kindMeta(kind);
    const linkedTender = state.tenders.find((t) => t.id === linkedId);
    const linkedDoc = state.documents.find((d) => d.id === linkedId);
    const linkedText = linkedTender
      ? `Linked to tender ${linkedTender.refNo}`
      : linkedDoc
        ? `Linked to ${linkedDoc.docNo}`
        : '';
    const doc: DmsDocument = {
      id: uid('dms'),
      docType: meta.docType,
      refNo: refNo.trim() || `FBV-DMS-${String(state.dms.length + 1).padStart(3, '0')}`,
      title: title.trim(),
      issuer: issuer.trim() || meta.defaultIssuer || '—',
      issueDate: issueDate || TODAY,
      expiryDate: noExpiry ? undefined : expiryDate || undefined,
      fileName: file?.fileName ?? '',
      fileData: file?.fileData ?? '',
      version: 'v1.0',
      notes: [notes.trim(), linkedText].filter(Boolean).join(' · ') || undefined,
      createdAt: nowISO(),
    };
    addItem('dms', doc, {
      details: `${doc.title} saved to vault — ${doc.expiryDate ? `expiry tracked (${doc.expiryDate})` : 'no expiry'}`,
      verb: 'Uploaded',
      verbColor: 'gold',
      text: `${doc.title} saved — ${doc.expiryDate ? 'expiry tracked' : 'added to vault'}`,
    });
    onSaved(doc.title);
    onClose();
  };

  const linkedOptions = [
    ...state.tenders.map((t) => ({ id: t.id, label: `${t.refNo} — ${t.title}` })),
    ...state.documents
      .filter((d) => d.type === 'contract')
      .map((d) => ({ id: d.id, label: `${d.docNo} — Contract` })),
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-[640px]"
      title="Upload Document"
      footer={
        <>
          <button
            onClick={onClose}
            className="h-9 rounded-lg border border-app-border bg-white px-4 text-[13px] font-semibold text-app-ink transition hover:brightness-105"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={reading}
            className="h-9 rounded-lg bg-action px-4 text-[13px] font-semibold text-white transition hover:-translate-y-px hover:bg-action-hover active:scale-[.98] disabled:opacity-50"
          >
            Save to Vault
          </button>
        </>
      }
    >
      {/* 1 — Dropzone */}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg"
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void handleFile(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          'relative overflow-hidden rounded-xl border-2 border-dashed p-5 text-center transition-colors',
          dragOver ? 'border-action bg-info-soft/60' : 'border-app-border bg-[#F8FAFC]',
        )}
      >
        <img src="/empty-docs.svg" alt="" className="pointer-events-none absolute -right-4 -top-4 h-24 w-24 opacity-[.08]" />
        <AnimatePresence mode="wait">
          {file ? (
            <motion.div
              key="file"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="flex items-center gap-3 text-left"
            >
              {isImage(file.fileName) ? (
                <img
                  src={`data:image/png;base64,${file.fileData}`}
                  alt=""
                  className="h-14 w-14 rounded-lg border border-app-border bg-white object-contain p-1"
                />
              ) : (
                <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-[#E4EBF4] text-navy-800">
                  <FileText size={22} />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-app-ink">{file.fileName}</div>
                <div className="text-xs text-app-muted">{fileSizeText(file.fileData)} · ready to save</div>
              </div>
              <button
                onClick={() => setFile(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-app-muted hover:bg-danger-soft hover:text-danger"
                title="Remove file"
              >
                <X size={15} />
              </button>
            </motion.div>
          ) : (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <CloudUpload size={28} className={cn('mx-auto', dragOver ? 'text-action' : 'text-app-muted')} />
              <p className="mt-2 text-[13px] font-medium text-app-ink">
                Drop the document here or{' '}
                <button type="button" onClick={() => inputRef.current?.click()} className="font-semibold text-action underline underline-offset-2">
                  browse
                </button>
              </p>
              <p className="mt-1 text-xs text-app-muted">PDF, JPG or PNG, max 2 MB</p>
              {reading && (
                <div className="mx-auto mt-3 h-1.5 w-48 overflow-hidden rounded-full bg-app-border">
                  <motion.div
                    className="h-full bg-action"
                    initial={{ x: '-100%' }}
                    animate={{ x: '100%' }}
                    transition={{ repeat: Infinity, duration: 0.9, ease: 'easeInOut' }}
                    style={{ width: '50%' }}
                  />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        {fileError && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-left text-xs font-medium text-warning"
          >
            <AlertTriangle size={14} className="mt-px shrink-0" />
            {fileError}
          </motion.div>
        )}
      </div>

      {/* 2 — Document type icon grid */}
      <div className="mt-5">
        <div className="mb-2 text-[13px] font-medium text-app-ink">Document Type</div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {KINDS.filter((k) => k.kind !== 'other').map((m) => {
            const active = kind === m.kind;
            return (
              <motion.button
                key={m.kind}
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={() => pickKind(m.kind)}
                className={cn(
                  'relative flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-[11px] font-semibold transition',
                  active ? 'border-action bg-info-soft text-action' : 'border-app-border bg-white text-app-slate hover:border-action/40',
                )}
              >
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${m.color}18`, color: m.color }}
                >
                  <m.icon size={16} />
                </span>
                {m.label}
                <AnimatePresence>
                  {active && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-action text-white"
                    >
                      <Check size={11} strokeWidth={3} />
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            );
          })}
        </div>
        <AnimatePresence>
          {kindMeta(kind).hint && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-2 inline-flex rounded-full bg-success-soft px-2.5 py-1 text-[11px] font-semibold text-success"
            >
              {kindMeta(kind).hint}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 3 — Metadata */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Document Name" required error={titleError ?? undefined} className="sm:col-span-2">
          <TextInput value={title} onChange={(e) => { setTitle(e.target.value); setTitleError(null); }} placeholder="e.g. Tax Compliance Certificate" />
        </Field>
        <Field label="Reference / Certificate No">
          <TextInput className="font-mono" value={refNo} onChange={(e) => setRefNo(e.target.value)} placeholder="TCC-KRA-2026-1188" />
        </Field>
        <Field label="Issuer">
          <TextInput list="dms-issuers" value={issuer} onChange={(e) => setIssuer(e.target.value)} placeholder="KRA, County Government…" />
          <datalist id="dms-issuers">
            {ISSUER_SUGGESTIONS.map((i) => (
              <option key={i} value={i} />
            ))}
          </datalist>
        </Field>
        <Field label="Issue Date">
          <DateInput value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
        </Field>
        <Field label="Expiry Date" hint={noExpiry ? 'This document will always show as valid' : 'Leave blank if unknown'}>
          <DateInput value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} disabled={noExpiry} />
        </Field>
        <div className="sm:col-span-2 -mt-1">
          <Toggle checked={noExpiry} onChange={(v) => { setNoExpiry(v); if (v) setExpiryDate(''); }} label="This document doesn't expire (e.g. CR12, KRA PIN)" />
        </div>
        <Field label="Linked record (optional)" className="sm:col-span-2" hint="Attach a bid bond to its tender, or a signed contract to its record">
          <select
            value={linkedId}
            onChange={(e) => setLinkedId(e.target.value)}
            className="h-[38px] w-full appearance-none rounded-lg border border-app-border bg-white px-3 text-sm text-app-ink outline-none transition focus:border-action focus:ring-2 focus:ring-[rgba(37,99,235,.25)]"
          >
            <option value="">None</option>
            {linkedOptions.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <TextareaInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything worth remembering — renewal contacts, conditions…" rows={2} />
        </Field>
      </div>
    </Modal>
  );
}
