/** Tab 4 — Directors & Signatories: repeatable director cards with signature uploads. */
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { PenLine, Plus, Trash2 } from 'lucide-react';
import { SectionCard, PF, BIG_INPUT } from './tabShared';
import type { Director } from './profileExtras';
import type { StructuralTabProps } from './BankTab';
import { DIRECTOR_ROLES, initialsOf } from './profileExtras';
import { uid } from '@/lib/store';
import { ConfirmDialog, EmptyState, Toggle } from '@/components/shared';
import ImageUpload from './ImageUpload';

const AVATAR_COLORS = ['#2563EB', '#16A34A', '#C9A227', '#7C3AED', '#D97706', '#DC2626'];

export default function DirectorsTab({ profile: p, onStructural }: StructuralTabProps) {
  const [removeId, setRemoveId] = useState<string | null>(null);

  const setDirectors = (directors: Director[]) => onStructural({ directors });
  const patch = (id: string, patchObj: Partial<Director>) =>
    setDirectors(p.directors.map((d) => (d.id === id ? { ...d, ...patchObj } : d)));

  const addDirector = () =>
    setDirectors([
      ...p.directors,
      { id: uid('dir'), name: '', idNumber: '', role: 'Director', phone: '', email: '', canSign: false },
    ]);

  return (
    <div className="space-y-4">
      <SectionCard
        title="Directors & signatories"
        intro="Directors listed here can be picked as signatories when you generate documents — their saved signature is placed automatically."
      >
        {p.directors.length === 0 ? (
          <EmptyState
            image="/empty-docs.svg"
            title="No directors yet"
            hint="Add your first director — their signature can then be placed on quotations and contracts."
          />
        ) : (
          <div className="space-y-4">
            <AnimatePresence initial={false}>
              {p.directors.map((d, i) => (
                <motion.div
                  key={d.id}
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 34 }}
                  className="overflow-hidden"
                >
                  <div className="rounded-xl border border-app-border bg-white p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span
                          className="flex h-10 w-10 items-center justify-center rounded-full text-[13px] font-bold text-white"
                          style={{ backgroundColor: AVATAR_COLORS[i % AVATAR_COLORS.length] }}
                        >
                          {initialsOf(d.name || 'New Director')}
                        </span>
                        <div>
                          <div className="text-[14px] font-semibold text-app-ink">{d.name || 'New director'}</div>
                          <div className="text-xs text-app-muted">{d.role}</div>
                        </div>
                        {d.canSign && (
                          <span className="rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-success">
                            Can sign
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setRemoveId(d.id)}
                        title="Remove director"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-app-muted transition hover:bg-danger-soft hover:text-danger"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <PF label="Full Name">
                        <input className={BIG_INPUT} value={d.name} onChange={(e) => patch(d.id, { name: e.target.value })} placeholder="e.g. Caroline Wanjiru" />
                      </PF>
                      <PF label="ID / Passport No">
                        <input className={`${BIG_INPUT} font-mono`} value={d.idNumber} onChange={(e) => patch(d.id, { idNumber: e.target.value })} placeholder="23456789" />
                      </PF>
                      <PF label="Role">
                        <select className={BIG_INPUT} value={d.role} onChange={(e) => patch(d.id, { role: e.target.value })}>
                          {DIRECTOR_ROLES.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </PF>
                      <PF label="Phone">
                        <input className={BIG_INPUT} value={d.phone} onChange={(e) => patch(d.id, { phone: e.target.value })} placeholder="+254 722 345 678" />
                      </PF>
                      <PF label="Email" className="sm:col-span-2">
                        <input className={BIG_INPUT} type="email" value={d.email} onChange={(e) => patch(d.id, { email: e.target.value })} placeholder="director@fbv.co.ke" />
                      </PF>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                      <ImageUpload
                        compact
                        icon={<PenLine size={18} />}
                        label="Signature"
                        hint="PNG or JPG, max 2 MB — white background works best"
                        previewClass="h-12"
                        value={d.signatureData}
                        onChange={(data) => patch(d.id, { signatureData: data })}
                      />
                      <div className="pb-1">
                        <Toggle
                          checked={d.canSign}
                          onChange={(v) => patch(d.id, { canSign: v })}
                          label="Can sign documents"
                        />
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        <button
          type="button"
          onClick={addDirector}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-app-border py-3.5 text-[13px] font-semibold text-app-slate transition hover:border-action hover:text-action"
        >
          <Plus size={15} />
          Add director
        </button>
      </SectionCard>

      <ConfirmDialog
        open={removeId != null}
        onClose={() => setRemoveId(null)}
        onConfirm={() => {
          if (removeId) setDirectors(p.directors.filter((d) => d.id !== removeId));
        }}
        title="Remove director?"
        message="They will no longer be available as a document signatory. This does not affect documents already generated."
        confirmLabel="Remove"
        destructive
      />
    </div>
  );
}
