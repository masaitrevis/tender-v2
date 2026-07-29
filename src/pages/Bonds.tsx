/**
 * Bid Bond & Performance Security Tracker — /bonds
 * Cash tied up in tender securities: active bonds, cash at risk, releases, extensions.
 */
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Landmark, Lock, Unlock, Clock, Plus, Download, MoreHorizontal, Building2, ShieldCheck, Paperclip,
} from 'lucide-react';
import {
  useStore, addItem, updateItem, uid, daysUntil, nextDocNumber, nowISO, readFileAsBase64,
  type Bond,
} from '@/lib/store';
import { formatKES, formatKESCompact, formatDate } from '@/lib/format';
import {
  PageHeader, StatChip, Pill, ExpiryBadge, Modal, EmptyState,
  Field, TextInput, DateInput, CurrencyInput, SelectInput,
} from '@/components/shared';
import { BTN_PRIMARY, BTN_SECONDARY, Card, downloadCSV, useToasts } from '@/components/trackers/ui';
import { cn } from '@/lib/utils';

const isBank = (issuer: string) => /bank/i.test(issuer);

export default function Bonds() {
  const s = useStore();
  const toasts = useToasts();
  const [addOpen, setAddOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [extendFor, setExtendFor] = useState<Bond | null>(null);
  const [extendDate, setExtendDate] = useState('');

  const stats = useMemo(() => {
    const active = s.bonds.filter((b) => b.status === 'Active');
    const cashAtRisk = active.reduce((a, b) => a + b.amount, 0);
    const expiring = active.filter((b) => daysUntil(b.expiryDate) <= 30).length;
    const releasedYtd = s.bonds
      .filter((b) => b.status === 'Released' && b.issueDate.slice(0, 4) === String(s.settings.docYear))
      .reduce((a, b) => a + b.amount, 0);
    return { active: active.length, cashAtRisk, expiring, releasedYtd };
  }, [s]);

  const markReleased = (b: Bond) => {
    updateItem('bonds', b.id, { status: 'Released' }, {
      action: 'Updated', entity: 'Bond', entityRef: b.refNo,
      details: `${b.kind} ${b.refNo} released — ${formatKES(b.amount)} freed`, verb: 'Released', verbColor: 'green',
    });
    toasts.push(`${b.refNo} released — cash at risk reduced by ${formatKESCompact(b.amount)}`);
    setMenuFor(null);
  };

  const saveExtension = () => {
    if (!extendFor || !extendDate) return;
    const old = extendFor.expiryDate;
    updateItem('bonds', extendFor.id, { expiryDate: extendDate, status: 'Active' }, {
      action: 'Updated', entity: 'Bond', entityRef: extendFor.refNo,
      details: `Bond expiry extended ${formatDate(old)} → ${formatDate(extendDate)}`, verb: 'Extended', verbColor: 'blue',
    });
    toasts.push(`${extendFor.refNo} extended to ${formatDate(extendDate)}`);
    setExtendFor(null);
    setExtendDate('');
  };

  const exportCsv = () => {
    downloadCSV(
      'fbv-bonds.csv',
      ['Bond No', 'Tender', 'Kind', 'Issuer', 'Amount (KES)', 'Issue Date', 'Expiry Date', 'Status'],
      s.bonds.map((b) => [b.refNo, b.tenderTitle, b.kind, b.issuer, b.amount, b.issueDate, b.expiryDate, b.status]),
    );
    toasts.push(`Exported ${s.bonds.length} bonds to CSV`);
  };

  return (
    <div className="px-7 pb-8 pt-6">
      {toasts.node}
      <PageHeader
        title="Bid Bond Tracker"
        subtitle="Cash tied up in tender securities."
        actions={
          <>
            <button onClick={exportCsv} className={BTN_SECONDARY}>
              <Download size={15} /> Export CSV
            </button>
            <button onClick={() => setAddOpen(true)} className={BTN_PRIMARY}>
              <Plus size={15} /> New Bond
            </button>
          </>
        }
      />

      {/* Stats */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { icon: <Landmark size={17} />, value: stats.active, label: 'Active Bonds', variant: 'blue' as const },
          { icon: <Lock size={17} />, value: formatKESCompact(stats.cashAtRisk), label: 'Cash at Risk', variant: 'navy' as const },
          { icon: <Clock size={17} />, value: stats.expiring, label: 'Expiring ≤30d', variant: 'amber' as const },
          { icon: <Unlock size={17} />, value: formatKESCompact(stats.releasedYtd), label: 'Released YTD', variant: 'green' as const },
        ].map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: i * 0.05, ease: 'easeOut' }}>
            <StatChip icon={c.icon} value={c.value} label={c.label} variant={c.variant} />
          </motion.div>
        ))}
      </div>

      <Card className="overflow-visible">
        {s.bonds.length === 0 ? (
          <EmptyState title="No bonds recorded" hint="Bid bonds and performance securities you register will appear here." action={
            <button onClick={() => setAddOpen(true)} className={BTN_PRIMARY}><Plus size={15} /> New Bond</button>
          } />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app-border bg-[#F8FAFC] text-left">
                {['Bond No', 'Tender', 'Issuer', 'Amount', 'Issue Date', 'Expiry Date', 'Status', ''].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-app-muted first:rounded-tl-xl last:rounded-tr-xl">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.bonds.map((b, i) => (
                <motion.tr
                  key={b.id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(i * 0.02, 0.3) }}
                  className="h-14 border-b border-[#EEF1F5] last:border-0 hover:bg-[#F8FAFC]"
                >
                  <td className="px-4 font-mono text-[13px] font-medium text-navy-800">{b.refNo}</td>
                  <td className="max-w-[260px] px-4">
                    <div className="truncate font-semibold text-app-ink">{b.tenderTitle}</div>
                    <div className="truncate text-xs text-app-muted">{b.kind}</div>
                  </td>
                  <td className="px-4">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-app-bg px-2.5 py-1 text-xs font-medium text-app-slate">
                      {isBank(b.issuer) ? <Building2 size={12} /> : <ShieldCheck size={12} />}
                      {b.issuer}
                    </span>
                  </td>
                  <td className="px-4 text-right font-semibold text-app-ink tnum">{formatKES(b.amount)}</td>
                  <td className="px-4 text-app-slate tnum">{formatDate(b.issueDate)}</td>
                  <td className="px-4">
                    <div className="flex items-center gap-2">
                      <span className="text-app-slate tnum">{formatDate(b.expiryDate)}</span>
                      {b.status === 'Active' && <ExpiryBadge date={b.expiryDate} showDays={false} />}
                    </div>
                  </td>
                  <td className="px-4"><Pill status={b.status} /></td>
                  <td className="relative px-4">
                    <button
                      onClick={() => setMenuFor(menuFor === b.id ? null : b.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-app-muted hover:bg-app-bg"
                      aria-label="Bond actions"
                    >
                      <MoreHorizontal size={16} />
                    </button>
                    {menuFor === b.id && (
                      <div
                        className="absolute right-4 top-10 z-20 w-44 rounded-xl border border-app-border bg-white p-1 shadow-card-hover"
                        onMouseLeave={() => setMenuFor(null)}
                      >
                        {b.status === 'Active' && (
                          <>
                            <button onClick={() => markReleased(b)} className="w-full rounded-lg px-3 py-2 text-left text-[13px] text-app-ink hover:bg-app-bg">
                              Mark Released
                            </button>
                            <button
                              onClick={() => { setExtendFor(b); setExtendDate(b.expiryDate); setMenuFor(null); }}
                              className="w-full rounded-lg px-3 py-2 text-left text-[13px] text-app-ink hover:bg-app-bg"
                            >
                              Extend
                            </button>
                          </>
                        )}
                        <Link to="/tenders" className="block rounded-lg px-3 py-2 text-[13px] text-app-ink hover:bg-app-bg">
                          View Tender
                        </Link>
                      </div>
                    )}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <p className="mt-3 text-xs text-app-muted">
        Expiring bonds automatically raise CRITICAL / WARNING entries in the Deadline Tracker and the Needs Attention bell.
      </p>

      <NewBondModal open={addOpen} onClose={() => setAddOpen(false)} onSaved={(ref) => toasts.push(`Bond ${ref} registered`)} />

      {/* Extend modal */}
      <Modal
        open={extendFor != null}
        onClose={() => setExtendFor(null)}
        title={`Extend ${extendFor?.refNo ?? ''}`}
        footer={
          <>
            <button onClick={() => setExtendFor(null)} className={BTN_SECONDARY}>Cancel</button>
            <button onClick={saveExtension} disabled={!extendDate} className={BTN_PRIMARY}>Save Extension</button>
          </>
        }
      >
        <Field label="New expiry date" required hint={extendFor ? `Current expiry: ${formatDate(extendFor.expiryDate)}` : undefined}>
          <DateInput value={extendDate} onChange={(e) => setExtendDate(e.target.value)} />
        </Field>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* New Bond modal                                                       */
/* ------------------------------------------------------------------ */

function NewBondModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (ref: string) => void }) {
  const s = useStore();
  const [tenderId, setTenderId] = useState('');
  const [kind, setKind] = useState<Bond['kind']>('Bid Bond');
  const [issuerType, setIssuerType] = useState<'bank' | 'insurance'>('bank');
  const [issuer, setIssuer] = useState('');
  const [amount, setAmount] = useState('');
  const [issueDate, setIssueDate] = useState(nowISO().slice(0, 10));
  const [expiryDate, setExpiryDate] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const eligibleTenders = s.tenders.filter((t) => t.status === 'Open' || t.status === 'Submitted');
  const bondNo = nextDocNumber('FBV-BND');

  const save = async () => {
    if (!issuer.trim()) return setError('Issuer name is required');
    if (!amount || Number(amount) <= 0) return setError('Amount must be a positive number');
    if (!expiryDate) return setError('Expiry date is required');
    const tender = s.tenders.find((t) => t.id === tenderId);
    const bond: Bond = {
      id: uid('bnd'),
      refNo: bondNo,
      tenderId: tender?.id,
      tenderTitle: tender?.title ?? 'Unlinked security',
      kind,
      issuer: issuer.trim(),
      amount: Number(amount),
      issueDate,
      expiryDate,
      status: 'Active',
    };
    addItem('bonds', bond, {
      action: 'Created', entity: 'Bond', entityRef: bondNo,
      details: `${kind} ${bondNo} registered — ${issuer.trim()} (${formatKES(Number(amount))})`, verb: 'Created', verbColor: 'grey',
    });
    // Optional scan → DMS vault
    if (file) {
      try {
        const { fileName, fileData } = await readFileAsBase64(file);
        addItem('dms', {
          id: uid('dms'),
          docType: 'other',
          refNo: bondNo,
          title: `${kind} — ${bondNo}`,
          issuer: issuer.trim(),
          issueDate,
          expiryDate,
          fileName,
          fileData,
          version: 'v1.0',
          notes: `Bid bond scan attached from Bond Tracker (${bond.tenderTitle})`,
          createdAt: nowISO(),
        }, {
          action: 'Created', entity: 'Business Document', entityRef: bondNo,
          details: `Bond scan filed to DMS vault — ${fileName}`, verb: 'Uploaded', verbColor: 'navy',
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not read the attachment');
        return;
      }
    }
    onSaved(bondNo);
    setTenderId(''); setIssuer(''); setAmount(''); setExpiryDate(''); setFile(null); setError('');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Bond / Security"
      width="max-w-[620px]"
      footer={
        <>
          <button onClick={onClose} className={BTN_SECONDARY}>Cancel</button>
          <button onClick={save} className={BTN_PRIMARY}>Register Bond</button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Bond No">
            <TextInput value={bondNo} readOnly className="bg-app-bg font-mono" />
          </Field>
          <Field label="Security type" required>
            <SelectInput
              value={kind}
              onChange={(e) => setKind(e.target.value as Bond['kind'])}
              options={[
                { value: 'Bid Bond', label: 'Bid Bond' },
                { value: 'Performance Bond', label: 'Performance Bond' },
                { value: 'Advance Payment Guarantee', label: 'Advance Payment Guarantee' },
              ]}
            />
          </Field>
        </div>
        <Field label="Tender" hint="Only open or submitted tenders are listed.">
          <SelectInput
            value={tenderId}
            onChange={(e) => setTenderId(e.target.value)}
            options={[{ value: '', label: '— Not linked —' }, ...eligibleTenders.map((t) => ({ value: t.id, label: `${t.refNo} — ${t.title}` }))]}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Issuer type" required>
            <div className="flex gap-2">
              {(['bank', 'insurance'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setIssuerType(t)}
                  className={cn(
                    'flex h-[38px] flex-1 items-center justify-center gap-1.5 rounded-lg border text-[13px] font-semibold capitalize transition',
                    issuerType === t ? 'border-action bg-info-soft text-info' : 'border-app-border bg-white text-app-slate hover:bg-app-bg',
                  )}
                >
                  {t === 'bank' ? <Building2 size={14} /> : <ShieldCheck size={14} />}
                  {t}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Issuer name" required error={error === 'Issuer name is required' ? error : undefined}>
            <TextInput value={issuer} onChange={(e) => setIssuer(e.target.value)} placeholder={issuerType === 'bank' ? 'e.g. KCB Bank Kenya' : 'e.g. CIC Insurance Group'} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Amount" required error={error === 'Amount must be a positive number' ? error : undefined}>
            <CurrencyInput value={amount} onChange={setAmount} />
          </Field>
          <Field label="Issue date" required>
            <DateInput value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </Field>
          <Field label="Expiry date" required error={error === 'Expiry date is required' ? error : undefined}>
            <DateInput value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Attachment (scan → DMS vault)" hint="Optional — PDF/image, max 2 MB. Filed as a business document.">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} className={BTN_SECONDARY}>
              <Paperclip size={14} /> {file ? 'Change file' : 'Choose file'}
            </button>
            <span className="truncate text-xs text-app-muted">{file ? file.name : 'No file selected'}</span>
            <input ref={fileRef} type="file" accept=".pdf,image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
        </Field>
        {error && !['Issuer name is required', 'Amount must be a positive number', 'Expiry date is required'].includes(error) && (
          <p className="text-xs text-danger">{error}</p>
        )}
      </div>
    </Modal>
  );
}
