/**
 * Step 1 — Upload file: template card (gold-soft border, SheetJS-generated
 * .xlsx / .csv templates) + big dropzone with the upload illustration.
 */
import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Download, FileSpreadsheet, TriangleAlert, X } from 'lucide-react';
import { downloadTemplate, type EntityDef } from './entities';
import { PrimaryButton } from '@/components/masterdata/shared';
import { cn } from '@/lib/utils';

export interface FilePick {
  file: File;
}

export function UploadStep({
  def,
  pickedFile,
  parsing,
  parseError,
  onFile,
  onRemoveFile,
}: {
  def: EntityDef;
  pickedFile: File | null;
  parsing: boolean;
  parseError: string | null;
  onFile: (f: File) => void;
  onRemoveFile: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = '.xlsx,.xls,.csv';

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* ---------------- left: template card ---------------- */}
      <div className="rounded-xl border border-gold bg-gold-soft/50 p-5">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-gold">Step 1 — Start from our template</div>
        <h3 className="text-[15px] font-semibold text-app-ink">Download the {def.label.toLowerCase()} template</h3>
        <p className="mt-2 text-sm leading-6 text-app-slate">
          The template has the exact column headers the system understands, plus two greyed example
          rows you can replace with your own records.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <PrimaryButton icon={Download} onClick={() => downloadTemplate(def, 'xlsx')} className="h-8 px-3 text-xs">
            Download Excel template (.xlsx)
          </PrimaryButton>
          <button
            onClick={() => downloadTemplate(def, 'csv')}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-app-border bg-white px-3 text-xs font-semibold text-app-ink transition hover:brightness-105"
          >
            <FileSpreadsheet size={13} className="text-app-slate" /> .csv variant
          </button>
        </div>
        <p className="mt-4 rounded-lg bg-white/70 px-3 py-2.5 text-xs leading-5 text-app-slate">
          {def.requiredCaption}
        </p>
        <img src="/upload-illustration.svg" alt="" className="mx-auto mt-4 h-32 w-auto opacity-80" />
      </div>

      {/* ---------------- right: dropzone ---------------- */}
      <div>
        <motion.div
          animate={dragOver ? { scale: 1.01, borderColor: '#2563EB' } : { scale: 1, borderColor: '#E4E9F0' }}
          transition={{ duration: 0.2 }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !pickedFile && inputRef.current?.click()}
          className={cn(
            'flex min-h-[260px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed bg-white px-6 py-8 text-center transition-colors',
            dragOver ? 'bg-info-soft/40' : 'hover:border-app-slate',
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = '';
            }}
          />
          <motion.img
            src="/upload-illustration.svg"
            alt=""
            className="h-28 w-auto"
            animate={{ y: [0, -4, 0, 4, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          />
          <p className="mt-4 text-[15px] font-semibold text-app-ink">Drag &amp; drop your Excel file here</p>
          <p className="mt-1 text-sm text-app-slate">
            or <span className="font-semibold text-action">browse your computer</span>
          </p>
          <div className="mt-3 flex items-center gap-1.5">
            {['.xlsx', '.xls', '.csv'].map((ext) => (
              <span key={ext} className="rounded-full bg-grey-soft px-2 py-0.5 font-mono text-[11px] font-medium text-grey">{ext}</span>
            ))}
          </div>
          <p className="mt-2 text-xs text-app-muted">Max 5 MB · first sheet is used</p>
        </motion.div>

        {/* file chip */}
        <AnimatePresence>
          {pickedFile && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mt-3 flex items-center gap-3 rounded-xl border border-app-border bg-white px-4 py-3 shadow-card"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-success-soft text-success">
                <FileSpreadsheet size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-[13px] font-medium text-navy-800">{pickedFile.name}</div>
                <div className="text-xs text-app-muted tnum">{(pickedFile.size / 1024).toFixed(1)} KB</div>
              </div>
              {parsing ? (
                <div className="w-32">
                  <div className="mb-1 text-right text-[11px] text-app-muted">Reading rows…</div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-grey-soft">
                    <div className="skeleton-shimmer h-full w-full" />
                  </div>
                </div>
              ) : (
                <button onClick={(e) => { e.stopPropagation(); onRemoveFile(); }}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-app-muted hover:bg-app-bg hover:text-app-ink"
                  aria-label="Remove file">
                  <X size={15} />
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* error banner */}
        <AnimatePresence>
          {parseError && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-3 flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3"
            >
              <TriangleAlert size={16} className="mt-0.5 shrink-0 text-danger" />
              <div className="flex-1 text-sm text-danger">{parseError}</div>
              <button
                onClick={() => inputRef.current?.click()}
                className="rounded-lg border border-danger/40 bg-white px-2.5 py-1 text-xs font-semibold text-danger transition hover:brightness-105"
              >
                Try another file
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
