/** Tab 3 — Bank & M-Pesa: repeatable bank accounts + M-Pesa payment details. */
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Landmark, Plus, Smartphone, Star, Trash2 } from 'lucide-react';
import { SectionCard, PF, BIG_INPUT } from './tabShared';
import type { BankAccount, FullProfile, MpesaType } from './profileExtras';
import { KENYAN_BANKS } from './profileExtras';
import { uid } from '@/lib/store';
import { ConfirmDialog } from '@/components/shared';
import { cn } from '@/lib/utils';

export interface StructuralTabProps {
  profile: FullProfile;
  onStructural: (patch: Partial<FullProfile>) => void;
}

const MPESA_OPTIONS: Array<{ value: MpesaType; label: string }> = [
  { value: 'paybill', label: 'Paybill' },
  { value: 'till', label: 'Till Number (Buy Goods)' },
  { value: 'sendmoney', label: 'Send Money' },
];

export default function BankTab({ profile: p, onStructural }: StructuralTabProps) {
  const [removeId, setRemoveId] = useState<string | null>(null);

  const setAccounts = (accounts: BankAccount[]) => onStructural({ bankAccounts: accounts });

  const patchAccount = (id: string, patch: Partial<BankAccount>) =>
    setAccounts(p.bankAccounts.map((a) => (a.id === id ? { ...a, ...patch } : a)));

  const setPrimary = (id: string) =>
    setAccounts(p.bankAccounts.map((a) => ({ ...a, primary: a.id === id })));

  const addAccount = () =>
    setAccounts([
      ...p.bankAccounts,
      { id: uid('bank'), bankName: '', branch: '', accountName: p.name, accountNumber: '', swift: '', primary: p.bankAccounts.length === 0 },
    ]);

  const confirmRemove = () => {
    if (!removeId) return;
    const remaining = p.bankAccounts.filter((a) => a.id !== removeId);
    if (remaining.length > 0 && !remaining.some((a) => a.primary)) remaining[0].primary = true;
    setAccounts(remaining);
  };

  return (
    <div className="space-y-4">
      <SectionCard
        title="Bank accounts"
        intro="Customers see these details in the Payment box on invoices. Star the account you use most."
      >
        <div className="space-y-4">
          <AnimatePresence initial={false}>
            {p.bankAccounts.map((a) => (
              <motion.div
                key={a.id}
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 34 }}
                className="overflow-hidden"
              >
                <div className={cn('rounded-xl border p-4', a.primary ? 'border-gold bg-gold-soft/30' : 'border-app-border bg-white')}>
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[13px] font-semibold text-app-ink">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#E4EBF4] text-navy-800">
                        <Landmark size={14} />
                      </span>
                      {a.bankName || 'New bank account'}
                      {a.primary && (
                        <span className="rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-navy-950">
                          On invoices
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <motion.button
                        type="button"
                        whileTap={{ scale: 1.25 }}
                        animate={{ scale: 1 }}
                        onClick={() => setPrimary(a.id)}
                        title="Use this one on invoices"
                        className={cn(
                          'flex h-8 w-8 items-center justify-center rounded-lg transition',
                          a.primary ? 'text-gold' : 'text-app-muted hover:bg-app-bg hover:text-gold',
                        )}
                      >
                        <Star size={16} fill={a.primary ? 'currentColor' : 'none'} />
                      </motion.button>
                      <button
                        type="button"
                        onClick={() => setRemoveId(a.id)}
                        title="Remove account"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-app-muted transition hover:bg-danger-soft hover:text-danger"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <PF label="Bank Name">
                      <select className={BIG_INPUT} value={a.bankName} onChange={(e) => patchAccount(a.id, { bankName: e.target.value })}>
                        <option value="">Choose a bank…</option>
                        {KENYAN_BANKS.map((b) => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    </PF>
                    <PF label="Branch">
                      <input className={BIG_INPUT} value={a.branch} onChange={(e) => patchAccount(a.id, { branch: e.target.value })} placeholder="Moi Avenue Branch" />
                    </PF>
                    <PF label="Account Name">
                      <input className={BIG_INPUT} value={a.accountName} onChange={(e) => patchAccount(a.id, { accountName: e.target.value })} placeholder="Future Bright Ventures Ltd" />
                    </PF>
                    <PF label="Account Number">
                      <input className={`${BIG_INPUT} font-mono`} value={a.accountNumber} onChange={(e) => patchAccount(a.id, { accountNumber: e.target.value })} placeholder="1284567890" />
                    </PF>
                    <PF label="SWIFT (optional)">
                      <input className={`${BIG_INPUT} font-mono uppercase`} value={a.swift} onChange={(e) => patchAccount(a.id, { swift: e.target.value.toUpperCase() })} placeholder="KCBLKENX" />
                    </PF>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          <button
            type="button"
            onClick={addAccount}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-app-border py-3.5 text-[13px] font-semibold text-app-slate transition hover:border-action hover:text-action"
          >
            <Plus size={15} />
            Add another bank account
          </button>
        </div>
      </SectionCard>

      <SectionCard title="M-Pesa" intro="Customers will see these details in the Payment box on invoices.">
        <div className="mb-4 flex flex-wrap gap-2">
          {MPESA_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => onStructural({ mpesa: { ...p.mpesa, type: o.value } })}
              className={cn(
                'inline-flex h-9 items-center gap-2 rounded-lg border px-3.5 text-[13px] font-semibold transition',
                p.mpesa.type === o.value
                  ? 'border-action bg-info-soft text-action'
                  : 'border-app-border bg-white text-app-slate hover:border-action/50',
              )}
            >
              <Smartphone size={14} />
              {o.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <PF label={p.mpesa.type === 'paybill' ? 'Paybill Number' : p.mpesa.type === 'till' ? 'Till Number' : 'Phone Number'}>
            <input
              className={`${BIG_INPUT} font-mono`}
              value={p.mpesa.number}
              onChange={(e) => onStructural({ mpesa: { ...p.mpesa, number: e.target.value.replace(/\D/g, '') } })}
              placeholder={p.mpesa.type === 'sendmoney' ? '0700 123 456' : 'e.g. 522118'}
              inputMode="numeric"
            />
          </PF>
          <PF label="Account Name">
            <input
              className={BIG_INPUT}
              value={p.mpesa.accountName}
              onChange={(e) => onStructural({ mpesa: { ...p.mpesa, accountName: e.target.value } })}
              placeholder="Future Bright Ventures Ltd"
            />
          </PF>
        </div>
      </SectionCard>

      <ConfirmDialog
        open={removeId != null}
        onClose={() => setRemoveId(null)}
        onConfirm={confirmRemove}
        title="Remove bank account?"
        message="This account will no longer appear on your invoices. You can add it back any time."
        confirmLabel="Remove"
        destructive
      />
    </div>
  );
}
