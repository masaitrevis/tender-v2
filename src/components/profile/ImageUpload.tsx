/**
 * Image upload tile with live preview — logo / signature / stamp / director signatures.
 * Uses the store's `readFileAsBase64` (2 MB cap) and shows the store's friendly
 * rejection message verbatim on oversize files.
 */
import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ImagePlus, RefreshCw, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import { readFileAsBase64 } from '@/lib/store';
import { cn } from '@/lib/utils';

export default function ImageUpload({
  value,
  onChange,
  label,
  hint,
  previewClass = 'h-20',
  accept = 'image/png,image/jpeg,image/svg+xml',
  compact = false,
  icon,
}: {
  value?: string; // base64 (no data: prefix)
  onChange: (base64: string | undefined) => void;
  label: string;
  hint?: string;
  previewClass?: string;
  accept?: string;
  compact?: boolean;
  icon?: ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const { fileData } = await readFileAsBase64(file);
      onChange(fileData);
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 1600);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file. Please try again.');
    }
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
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
          'relative overflow-hidden rounded-xl border-2 border-dashed transition-colors',
          dragOver ? 'border-action bg-info-soft/50' : 'border-app-border bg-white',
          compact ? 'p-3' : 'p-4',
        )}
      >
        <div className="flex items-center gap-4">
          {/* Preview */}
          <div
            className={cn(
              'flex shrink-0 items-center justify-center rounded-lg border border-app-border bg-[repeating-conic-gradient(#F2F4F7_0%_25%,#FFFFFF_0%_50%)] bg-[length:16px_16px]',
              compact ? 'h-14 w-24' : 'h-24 w-28',
            )}
          >
            <AnimatePresence mode="wait">
              {value ? (
                <motion.div
                  key="img"
                  initial={{ scale: 0.92, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.92, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="relative flex h-full w-full items-center justify-center"
                >
                  <img
                    src={`data:image/png;base64,${value}`}
                    alt={label}
                    className={cn('max-h-full max-w-full rounded-md bg-white object-contain p-1', previewClass)}
                  />
                  {justSaved && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -right-1.5 -top-1.5 rounded-full bg-success text-white"
                    >
                      <CheckCircle2 size={16} />
                    </motion.span>
                  )}
                </motion.div>
              ) : (
                <motion.span
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-app-muted"
                >
                  {icon ?? <ImagePlus size={compact ? 18 : 24} />}
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          {/* Copy + actions */}
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-app-ink">{label}</div>
            {hint && <div className="mt-0.5 text-xs leading-4 text-app-muted">{hint}</div>}
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-app-border bg-white px-3 text-xs font-semibold text-app-ink transition hover:-translate-y-px hover:brightness-105 active:scale-[.98]"
              >
                {value ? <RefreshCw size={13} /> : <ImagePlus size={13} />}
                {value ? 'Replace' : 'Upload'}
              </button>
              {value && (
                <button
                  type="button"
                  onClick={() => onChange(undefined)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-danger transition hover:bg-danger-soft"
                >
                  <X size={13} />
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs font-medium text-warning"
          >
            <AlertTriangle size={14} className="mt-px shrink-0" />
            {error}
          </motion.div>
        )}
      </div>
    </div>
  );
}
