/** New / Edit Tender drawer (560px, sectioned) — shared by the register and the detail page. */
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import {
  addItem, updateItem, nextDocNumber, nowISO, uid, TODAY, useStore,
} from '@/lib/store';
import type { Tender, TenderStatus } from '@/lib/store';
import {
  Drawer, Field, TextInput, DateInput, CurrencyInput, SelectInput, TextareaInput,
} from '@/components/shared';
import { getExtras, setTenderExtras } from './extras';
import { Btn, SectionTitle } from './ui';

const CATEGORIES = [
  'Medical Supplies', 'Security Systems', 'Mechanical Parts', 'Energy Services',
  'Hospitality', 'Construction Materials', 'Furniture', 'Branding',
  'ICT Equipment', 'Office Supplies', 'Works', 'Services', 'Other',
];

const SECURITY_TYPES = ['None', 'Bid Bond', 'Bank Guarantee', 'Insurance Bond', 'Cash Deposit'];

const STATUSES: TenderStatus[] = ['Open', 'Submitted', 'Under Evaluation', 'Won', 'Lost', 'Cancelled'];

interface FormState {
  title: string;
  clientId: string;
  category: string;
  status: TenderStatus;
  publishedDate: string;
  submissionDeadline: string;
  submittedDate: string;
  value: string;
  bidBondAmount: string;
  securityType: string;
  department: string;
  assignedOfficerId: string;
  winProbability: number;
  competitors: string[];
  notes: string;
}

function blankForm(): FormState {
  return {
    title: '',
    clientId: '',
    category: 'Medical Supplies',
    status: 'Open',
    publishedDate: TODAY,
    submissionDeadline: '',
    submittedDate: '',
    value: '',
    bidBondAmount: '',
    securityType: 'Bid Bond',
    department: '',
    assignedOfficerId: '',
    winProbability: 50,
    competitors: [],
    notes: '',
  };
}

export function TenderFormDrawer({
  open,
  onClose,
  tender,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  tender?: Tender | null;
  onSaved?: (tenderId: string, runEligibility: boolean) => void;
}) {
  const state = useStore();
  const editing = Boolean(tender);
  const refNo = useMemo(
    () => (tender ? tender.refNo : nextDocNumber('FBV-TND')),
    [tender, open], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const [form, setForm] = useState<FormState>(blankForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tagDraft, setTagDraft] = useState('');

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setTagDraft('');
    if (tender) {
      const ex = getExtras().tenders[tender.id] ?? {};
      setForm({
        title: tender.title,
        clientId: tender.clientId,
        category: tender.category,
        status: tender.status,
        publishedDate: tender.publishedDate,
        submissionDeadline: tender.submissionDeadline,
        submittedDate: ex.submittedDate ?? '',
        value: String(tender.value),
        bidBondAmount: ex.bidBondAmount != null ? String(ex.bidBondAmount) : '',
        securityType: ex.securityType ?? 'Bid Bond',
        department: ex.department ?? '',
        assignedOfficerId: ex.assignedOfficerId ?? '',
        winProbability: ex.winProbability ?? 50,
        competitors: ex.competitors ?? [],
        notes: tender.notes ?? '',
      });
    } else {
      setForm(blankForm());
    }
  }, [open, tender]);

  const set = <K extends keyof FormState>(key: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: v }));

  const addCompetitor = (raw: string) => {
    const name = raw.trim().replace(/,+$/, '');
    if (!name) return;
    setForm((f) => (f.competitors.includes(name) ? f : { ...f, competitors: [...f.competitors, name] }));
    setTagDraft('');
  };

  const departments = useMemo(
    () => Array.from(new Set(state.employees.map((e) => e.department))),
    [state.employees],
  );

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = 'Tender name is required.';
    if (!form.clientId) e.clientId = 'Please choose a client.';
    if (!form.submissionDeadline) e.submissionDeadline = 'Closing date is required.';
    if (form.value === '' || Number.isNaN(Number(form.value)) || Number(form.value) < 0)
      e.value = 'Value must be a number (KES).';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = (runEligibility: boolean) => {
    if (!validate()) return;
    const extrasPatch = {
      department: form.department || undefined,
      assignedOfficerId: form.assignedOfficerId || undefined,
      winProbability: form.winProbability,
      competitors: form.competitors,
      bidBondAmount: form.bidBondAmount === '' ? undefined : Number(form.bidBondAmount),
      securityType: form.securityType === 'None' ? undefined : form.securityType,
      submittedDate: form.submittedDate || undefined,
    };
    if (tender) {
      updateItem(
        'tenders',
        tender.id,
        {
          title: form.title.trim(),
          clientId: form.clientId,
          category: form.category,
          status: form.status,
          value: Number(form.value) || 0,
          publishedDate: form.publishedDate,
          submissionDeadline: form.submissionDeadline,
          notes: form.notes.trim() || undefined,
        },
        {
          entityRef: tender.refNo,
          details: `Updated tender — ${tender.refNo} (${form.title.trim()})`,
          verb: 'Updated',
          verbColor: 'blue',
        },
      );
      setTenderExtras(tender.id, extrasPatch);
      onSaved?.(tender.id, runEligibility);
    } else {
      const id = uid('tnd');
      addItem(
        'tenders',
        {
          id,
          refNo,
          title: form.title.trim(),
          clientId,
          category: form.category,
          status: 'Open',
          value: Number(form.value) || 0,
          publishedDate: form.publishedDate || TODAY,
          submissionDeadline: form.submissionDeadline,
          notes: form.notes.trim() || undefined,
          createdAt: nowISO(),
        },
        {
          entityRef: refNo,
          details: `Created tender — ${refNo} (${form.title.trim()})`,
          verb: 'Created',
          verbColor: 'grey',
        },
      );
      setTenderExtras(id, extrasPatch);
      onSaved?.(id, runEligibility);
    }
    onClose();
  };

  const clientId = form.clientId;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={editing ? `Edit Tender — ${tender?.refNo}` : 'New Tender'}
      footer={
        <>
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          {!editing && (
            <Btn variant="secondary" onClick={() => save(true)}>Save & run Eligibility Check</Btn>
          )}
          <Btn onClick={() => save(false)}>Save Tender</Btn>
        </>
      }
    >
      {/* Basics */}
      <SectionTitle>Basics</SectionTitle>
      <div className="mt-3 grid grid-cols-2 gap-4">
        <Field label="Tender No" hint="Auto-assigned">
          <TextInput value={refNo} disabled className="font-mono text-[13px] text-app-slate" />
        </Field>
        <Field label="Category">
          <SelectInput
            options={CATEGORIES.map((c) => ({ value: c, label: c }))}
            value={form.category}
            onChange={(e) => set('category', e.target.value)}
          />
        </Field>
        <Field label="Tender Name" required error={errors.title} className="col-span-2">
          <TextInput
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="e.g. Supply & Delivery of Medical Consumables"
          />
        </Field>
        <Field label="Client" required error={errors.clientId} className="col-span-2">
          <SelectInput
            options={[
              { value: '', label: 'Select a client…' },
              ...state.clients.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })),
            ]}
            value={clientId}
            onChange={(e) => set('clientId', e.target.value)}
          />
        </Field>
        {editing && (
          <Field label="Status" className="col-span-2">
            <SelectInput
              options={STATUSES.map((s) => ({ value: s, label: s }))}
              value={form.status}
              onChange={(e) => set('status', e.target.value as TenderStatus)}
            />
          </Field>
        )}
      </div>

      {/* Dates */}
      <SectionTitle className="mt-6">Dates</SectionTitle>
      <div className="mt-3 grid grid-cols-3 gap-4">
        <Field label="Opening Date">
          <DateInput value={form.publishedDate} onChange={(e) => set('publishedDate', e.target.value)} />
        </Field>
        <Field label="Closing Date" required error={errors.submissionDeadline}>
          <DateInput value={form.submissionDeadline} onChange={(e) => set('submissionDeadline', e.target.value)} />
        </Field>
        <Field label="Submission Date" hint="Actual submission">
          <DateInput value={form.submittedDate} onChange={(e) => set('submittedDate', e.target.value)} />
        </Field>
      </div>

      {/* Commercials */}
      <SectionTitle className="mt-6">Commercials</SectionTitle>
      <div className="mt-3 grid grid-cols-2 gap-4">
        <Field label="Tender Value" required error={errors.value}>
          <CurrencyInput value={form.value} onChange={(v) => set('value', v)} />
        </Field>
        <Field label="Bid Bond Amount">
          <CurrencyInput value={form.bidBondAmount} onChange={(v) => set('bidBondAmount', v)} />
        </Field>
        <Field label="Security Type" className="col-span-2">
          <SelectInput
            options={SECURITY_TYPES.map((s) => ({ value: s, label: s }))}
            value={form.securityType}
            onChange={(e) => set('securityType', e.target.value)}
          />
        </Field>
      </div>

      {/* Assignment */}
      <SectionTitle className="mt-6">Assignment</SectionTitle>
      <div className="mt-3 grid grid-cols-2 gap-4">
        <Field label="Department">
          <SelectInput
            options={[{ value: '', label: '—' }, ...departments.map((d) => ({ value: d, label: d }))]}
            value={form.department}
            onChange={(e) => set('department', e.target.value)}
          />
        </Field>
        <Field label="Assigned Officer">
          <SelectInput
            options={[
              { value: '', label: 'Unassigned' },
              ...state.employees.map((e) => ({ value: e.id, label: `${e.name} — ${e.role}` })),
            ]}
            value={form.assignedOfficerId}
            onChange={(e) => set('assignedOfficerId', e.target.value)}
          />
        </Field>
        <Field label={`Win Probability — ${form.winProbability}%`} className="col-span-2">
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={form.winProbability}
            onChange={(e) => set('winProbability', Number(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-full outline-none transition-all duration-150"
            style={{
              background: `linear-gradient(to right, #2563EB ${form.winProbability}%, #E4E9F0 ${form.winProbability}%)`,
            }}
          />
        </Field>
        <Field label="Competitors" hint="Press Enter to add" className="col-span-2">
          <div className="rounded-lg border border-app-border bg-white px-2 py-2 transition focus-within:border-action focus-within:ring-2 focus-within:ring-[rgba(37,99,235,.25)]">
            <div className="flex flex-wrap items-center gap-1.5">
              {form.competitors.map((c) => (
                <motion.span
                  key={c}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.15 }}
                  className="inline-flex items-center gap-1 rounded-full bg-grey-soft px-2.5 py-1 text-xs font-medium text-app-ink"
                >
                  {c}
                  <button
                    type="button"
                    onClick={() => set('competitors', form.competitors.filter((x) => x !== c))}
                    className="text-app-muted hover:text-danger"
                    aria-label={`Remove ${c}`}
                  >
                    <X size={12} />
                  </button>
                </motion.span>
              ))}
              <input
                value={tagDraft}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v.endsWith(',')) addCompetitor(v);
                  else setTagDraft(v);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCompetitor(tagDraft);
                  } else if (e.key === 'Backspace' && !tagDraft && form.competitors.length) {
                    set('competitors', form.competitors.slice(0, -1));
                  }
                }}
                onBlur={() => addCompetitor(tagDraft)}
                placeholder={form.competitors.length ? '' : 'e.g. Crown Healthcare Ltd'}
                className="min-w-[140px] flex-1 px-1 py-1 text-sm text-app-ink outline-none placeholder:text-app-muted"
              />
            </div>
          </div>
        </Field>
      </div>

      {/* Notes */}
      <SectionTitle className="mt-6">Notes</SectionTitle>
      <div className="mt-3">
        <TextareaInput
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          placeholder="Pre-bid meeting outcomes, clarifications, strategy notes…"
          rows={4}
        />
      </div>
    </Drawer>
  );
}
