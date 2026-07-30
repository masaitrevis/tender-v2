/**
 * Company Profile — /profile ⭐ v2.0 flagship.
 * Tabbed "easy editor" with autosave, image uploads (logo/signature/stamp),
 * repeatable bank accounts & directors, and a live mini-A4 letterhead preview.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Building2, Landmark, Wallet, Users, Palette, CircleCheck, CloudOff,
  Loader2, Eye, EyeOff, Printer, ZoomIn, ZoomOut,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useStore, getState, mutateStore, storageUsage } from '@/lib/store';
import type { CompanyProfile } from '@/lib/store';
import { Modal, PageHeader } from '@/components/shared';
import { cn } from '@/lib/utils';
import {
  getFullProfile, pickScalars, pickStructural, isValidKraPin,
  type FullProfile,
} from '@/components/profile/profileExtras';
import LetterheadPreview from '@/components/profile/LetterheadPreview';
import CompanyTab from '@/components/profile/CompanyTab';
import TaxTab from '@/components/profile/TaxTab';
import BankTab from '@/components/profile/BankTab';
import DirectorsTab from '@/components/profile/DirectorsTab';
import BrandingTab from '@/components/profile/BrandingTab';

type TabKey = 'company' | 'tax' | 'bank' | 'directors' | 'branding';

const TABS: Array<{ key: TabKey; label: string; icon: LucideIcon }> = [
  { key: 'company', label: 'Company Details', icon: Building2 },
  { key: 'tax', label: 'Tax & Registration', icon: Landmark },
  { key: 'bank', label: 'Bank & M-Pesa', icon: Wallet },
  { key: 'directors', label: 'Directors & Signatories', icon: Users },
  { key: 'branding', label: 'Branding & Logo', icon: Palette },
];

const TAB_LABEL: Record<TabKey, string> = {
  company: 'Company Details',
  tax: 'Tax & Registration',
  bank: 'Bank & M-Pesa',
  directors: 'Directors & Signatories',
  branding: 'Branding & Logo',
};

type SaveState = 'saved' | 'saving' | 'error';

function timeNow(): string {
  return new Date().toTimeString().slice(0, 5);
}

/** Persist a profile patch with a tab-scoped audit entry. */
function saveProfilePatch(patch: Partial<FullProfile>, tabLabel: string) {
  mutateStore(
    (d) => {
      Object.assign(d.profile, patch as Partial<CompanyProfile>);
    },
    {
      action: 'Updated',
      entity: 'Company Profile',
      entityRef: 'FBV',
      details: `Updated company profile — ${tabLabel}`,
      verb: 'Updated',
      verbColor: 'blue',
      text: `Updated company profile — ${tabLabel}`,
    },
  );
}

export default function Profile() {
  const storeProfile = useStore().profile;

  const [form, setForm] = useState<FullProfile>(() => getFullProfile(getState().profile));
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [structuralDirty, setStructuralDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [savedAt, setSavedAt] = useState<string>(timeNow());
  const [activeTab, setActiveTab] = useState<TabKey>('company');
  const [railOpen, setRailOpen] = useState(true);
  const [previewModal, setPreviewModal] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  const formRef = useRef(form);
  formRef.current = form;
  const tabRef = useRef(activeTab);
  tabRef.current = activeTab;
  const timerRef = useRef<number | undefined>(undefined);

  /* Re-sync if the store profile is replaced externally (e.g. Settings reseed). */
  const prevProfile = useRef(storeProfile);
  useEffect(() => {
    if (prevProfile.current !== storeProfile) {
      prevProfile.current = storeProfile;
      if (dirty.size === 0 && !structuralDirty && saveState !== 'saving') {
        setForm(getFullProfile(storeProfile));
      }
    }
  }, [storeProfile, dirty.size, structuralDirty, saveState]);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const saveScalars = () => {
    try {
      saveProfilePatch(pickScalars(formRef.current), TAB_LABEL[tabRef.current]);
      setDirty(new Set());
      setSavedAt(timeNow());
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  };

  const scheduleAutosave = () => {
    setSaveState('saving');
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(saveScalars, 800);
  };

  const onScalar = <K extends keyof FullProfile>(key: K, value: FullProfile[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty((d) => new Set(d).add(String(key)));
    scheduleAutosave();
  };

  const onStructural = (patch: Partial<FullProfile>) => {
    setForm((f) => ({ ...f, ...patch }));
    setStructuralDirty(true);
  };

  const saveStructural = () => {
    const primary = form.bankAccounts.find((b) => b.primary) ?? form.bankAccounts[0];
    saveProfilePatch(
      {
        ...pickStructural(form),
        // keep the store's flat bank fields in sync with the primary account
        ...(primary
          ? { bankName: primary.bankName, bankBranch: primary.branch, bankAccount: primary.accountNumber, bankSwift: primary.swift }
          : {}),
      },
      TAB_LABEL[tabRef.current],
    );
    setStructuralDirty(false);
    setSavedAt(timeNow());
    setSaveState('saved');
  };

  const discardStructural = () => {
    const fresh = getFullProfile(storeProfile);
    setForm((f) => ({ ...f, ...pickStructural(fresh) }));
    setStructuralDirty(false);
  };

  /* Tab completion dots: green = all required filled, amber = gaps. */
  const completion = useMemo<Record<TabKey, boolean>>(
    () => ({
      company: Boolean(form.name && form.phone && form.email && form.address && form.city),
      tax: isValidKraPin(form.kraPin) && Boolean(form.regNo),
      bank: form.bankAccounts.some((a) => a.primary && a.bankName && a.accountNumber),
      directors: form.directors.some((d) => d.name.trim()),
      branding: Boolean(form.logoData),
    }),
    [form],
  );

  const storageFull = storageUsage().ratio > 0.98;

  const printTestPage = () => {
    const p = form;
    const w = window.open('', '_blank', 'width=900,height=1200');
    if (!w) return;
    const logo = p.logoData ? `data:image/png;base64,${p.logoData}` : `${window.location.origin}/logo.svg`;
    const bank = p.bankAccounts.find((b) => b.primary) ?? p.bankAccounts[0];
    w.document.write(`<!doctype html><html><head><title>Letterhead test — ${p.name}</title>
      <style>
        body{font-family:Inter,Arial,sans-serif;margin:0;color:#1A2B3C}
        .band{background:${p.accentColor};color:#fff;padding:40px 48px 24px;display:flex;justify-content:space-between;gap:24px}
        .band img{width:80px;height:80px;border-radius:12px;background:#fff;padding:4px}
        .name{font-size:30px;font-weight:700}.tag{font-style:italic;opacity:.85;margin-top:4px}
        .addr{font-size:12px;text-align:right;line-height:1.7;opacity:.9}
        .rule{height:5px;background:#C9A227}
        .body{padding:48px}.meta{display:flex;justify-content:space-between;font-size:13px;color:#5B6B7C;margin-bottom:32px}
        .box{border:1px dashed #E4E9F0;border-radius:8px;background:#F8FAFC;padding:60px;text-align:center;color:#8494A7;font-size:13px}
        .pay{border:1px solid #E4E9F0;border-radius:8px;margin-top:32px;font-size:13px}
        .pay h4{margin:0;background:#F8FAFC;padding:10px 20px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#5B6B7C;border-bottom:1px solid #E4E9F0}
        .pay div{padding:14px 20px}
        .foot{text-align:center;font-style:italic;color:#8494A7;font-size:12px;padding:24px;border-top:3px solid ${p.accentColor}}
        @page{size:A4;margin:0}
      </style></head><body>
      <div class="band">
        <div style="display:flex;gap:20px;align-items:center">
          <img src="${logo}" alt="logo"/>
          <div><div class="name">${p.name}</div><div class="tag">${p.tagline}</div></div>
        </div>
        <div class="addr">${p.address}<br/>${p.city}, ${p.country}<br/>${p.poBox}<br/>${p.phone}<br/>${p.email}</div>
      </div>
      ${p.goldRule ? '<div class="rule"></div>' : ''}
      <div class="body">
        <div class="meta"><span>KRA PIN: <b>${p.kraPin}</b></span><span>Reg No: <b>${p.regNo}</b></span><span>VAT: <b>${p.vatNo ?? '—'}</b></span></div>
        <div class="box">Letterhead print test — your document content appears here</div>
        <div class="pay"><h4>Payment Details</h4><div>
          Bank: ${bank?.bankName ?? p.bankName} · Branch: ${bank?.branch ?? p.bankBranch}<br/>
          Account Name: ${bank?.accountName ?? p.name} · Account No: ${bank?.accountNumber ?? p.bankAccount}
          ${p.mpesa.number ? `<br/>M-Pesa ${p.mpesa.type === 'paybill' ? 'Paybill' : p.mpesa.type === 'till' ? 'Till' : 'Send Money'}: ${p.mpesa.number}` : ''}
        </div></div>
      </div>
      <div class="foot">${p.footerText}</div>
      <script>window.onload=function(){window.print()}<\/script>
      </body></html>`);
    w.document.close();
  };

  const previewWidth = zoomed ? 780 : 560;

  return (
    <div className="px-7 pb-28 pt-6">
      <PageHeader
        title="Company Profile"
        subtitle="This information appears on your quotations, invoices and other documents."
        actions={
          <>
            {/* Autosave indicator */}
            <AnimatePresence mode="wait">
              {saveState === 'saving' && (
                <motion.span
                  key="saving"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="inline-flex h-9 items-center gap-2 rounded-full bg-info-soft px-3.5 text-[13px] font-semibold text-info"
                >
                  <Loader2 size={14} className="animate-spin" />
                  Saving…
                </motion.span>
              )}
              {saveState === 'saved' && (
                <motion.span
                  key="saved"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="inline-flex h-9 items-center gap-2 rounded-full bg-success-soft px-3.5 text-[13px] font-semibold text-success"
                >
                  <CircleCheck size={15} />
                  All changes saved · {savedAt}
                </motion.span>
              )}
              {saveState === 'error' && (
                <motion.button
                  key="error"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  onClick={saveScalars}
                  className="inline-flex h-9 items-center gap-2 rounded-full bg-warning-soft px-3.5 text-[13px] font-semibold text-warning transition hover:brightness-105"
                >
                  <CloudOff size={15} />
                  Couldn't save — Retry
                </motion.button>
              )}
            </AnimatePresence>
            <button
              onClick={() => setPreviewModal(true)}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-app-border bg-white px-4 text-[13px] font-semibold text-app-ink transition hover:-translate-y-px hover:brightness-105 active:scale-[.98]"
            >
              <Eye size={15} />
              Preview Letterhead
            </button>
          </>
        }
      />

      <div className="flex items-start gap-6">
        {/* Left tab rail */}
        <aside className="sticky top-6 w-60 shrink-0 rounded-xl border border-app-border bg-app-card p-2 shadow-card">
          {TABS.map((t) => {
            const active = activeTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={cn(
                  'relative mb-0.5 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] font-medium transition-colors',
                  active ? 'bg-[#E4EBF4] text-navy-800' : 'text-app-slate hover:bg-app-bg hover:text-app-ink',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="profile-tab-bar"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                    className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-action"
                  />
                )}
                <t.icon size={17} className="shrink-0" />
                <span className="flex-1 leading-tight">{t.label}</span>
                <span
                  className={cn('h-2 w-2 shrink-0 rounded-full', completion[t.key] ? 'bg-success' : 'bg-warning')}
                  title={completion[t.key] ? 'Complete' : 'Some details missing'}
                />
              </button>
            );
          })}
          <div className="mt-2 border-t border-app-border px-3 pt-3 text-[11px] leading-4 text-app-muted">
            Changes save automatically as you type. New bank accounts and directors are saved with the bar at the bottom.
          </div>
        </aside>

        {/* Main form column */}
        <div className="min-w-0 max-w-[720px] flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            >
              {activeTab === 'company' && <CompanyTab profile={form} dirty={dirty} onScalar={onScalar} />}
              {activeTab === 'tax' && <TaxTab profile={form} dirty={dirty} onScalar={onScalar} />}
              {activeTab === 'bank' && <BankTab profile={form} onStructural={onStructural} />}
              {activeTab === 'directors' && <DirectorsTab profile={form} onStructural={onStructural} />}
              {activeTab === 'branding' && <BrandingTab profile={form} dirty={dirty} onScalar={onScalar} />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Right live preview rail (≥1280px) */}
        <aside className={cn('sticky top-6 hidden w-[300px] shrink-0 xl:block', !railOpen && 'xl:hidden')}>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-app-slate">
              Live letterhead preview
            </span>
            <button
              onClick={() => setRailOpen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-app-muted hover:bg-white"
              title="Hide preview"
            >
              <EyeOff size={14} />
            </button>
          </div>
          <LetterheadPreview profile={form} width={300} />
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => setPreviewModal(true)}
              className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-app-border bg-white text-xs font-semibold text-app-ink transition hover:brightness-105"
            >
              <ZoomIn size={13} /> Open full preview
            </button>
            <button
              onClick={printTestPage}
              className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-app-border bg-white text-xs font-semibold text-app-ink transition hover:brightness-105"
            >
              <Printer size={13} /> Print test page
            </button>
          </div>
          {storageFull && (
            <div className="mt-3 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
              Browser storage is almost full — images may fail to save. Free up space in Settings.
            </div>
          )}
        </aside>
      </div>

      {/* Floating preview pill (below 1280px, or whenever the rail is hidden) */}
      <div className={cn('fixed bottom-6 right-6 z-30', railOpen && 'xl:hidden')}>
        <button
          onClick={() => {
            if (window.innerWidth >= 1280) setRailOpen(true);
            else setPreviewModal(true);
          }}
          className="flex h-11 items-center gap-2 rounded-full bg-navy-800 px-4 text-[13px] font-semibold text-white shadow-card-hover transition hover:-translate-y-0.5 hover:brightness-110"
        >
          <Eye size={16} />
          Preview
        </button>
      </div>

      {/* Sticky save bar for structural edits */}
      <AnimatePresence>
        {structuralDirty && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-app-border bg-white px-5 py-3 shadow-card-hover"
          >
            <span className="text-[13px] font-medium text-app-ink">You have unsaved changes</span>
            <button
              onClick={discardStructural}
              className="h-9 rounded-lg border border-app-border bg-white px-4 text-[13px] font-semibold text-app-ink transition hover:brightness-105"
            >
              Discard
            </button>
            <button
              onClick={saveStructural}
              className="h-9 rounded-lg bg-action px-4 text-[13px] font-semibold text-white transition hover:-translate-y-px hover:bg-action-hover active:scale-[.98]"
            >
              Save changes
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full letterhead preview modal */}
      <Modal
        open={previewModal}
        onClose={() => setPreviewModal(false)}
        width="max-w-[860px]"
        title={
          <span className="flex items-center gap-3">
            Letterhead preview
            <span className="text-xs font-normal text-app-muted">This is how your documents look to clients</span>
          </span>
        }
        footer={
          <>
            <button
              onClick={() => setZoomed((z) => !z)}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-app-border bg-white px-4 text-[13px] font-semibold text-app-ink transition hover:brightness-105"
            >
              {zoomed ? <ZoomOut size={15} /> : <ZoomIn size={15} />}
              {zoomed ? 'Zoom out' : 'Zoom in'}
            </button>
            <button
              onClick={printTestPage}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-action px-4 text-[13px] font-semibold text-white transition hover:-translate-y-px hover:bg-action-hover active:scale-[.98]"
            >
              <Printer size={15} />
              Print test page
            </button>
          </>
        }
      >
        <div className="flex justify-center overflow-x-auto rounded-xl bg-app-bg p-4">
          <LetterheadPreview profile={form} width={previewWidth} />
        </div>
      </Modal>
    </div>
  );
}
