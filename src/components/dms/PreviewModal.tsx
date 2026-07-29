/**
 * View / Preview modal for a vault document: full preview (image zoom / PDF
 * embed / graceful fallback), metadata rail, replace (version bump), print,
 * download and delete.
 */
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Download, RefreshCw, Printer, Trash2, FileText, AlertTriangle, FileUp,
} from 'lucide-react';
import {
  readFileAsBase64, removeItem, updateItem,
} from '@/lib/store';
import type { DmsDocument } from '@/lib/store';
import { ConfirmDialog, ExpiryBadge, Modal, Pill } from '@/components/shared';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  bumpVersion, downloadDoc, fileSizeText, isImage, isPdf, kindForDoc, kindMeta, mimeOf, openObjectUrl,
} from './dmsTypes';

export default function PreviewModal({
  doc,
  onClose,
  onDeleted,
  onReplaced,
}: {
  doc: DmsDocument | null;
  onClose: () => void;
  onDeleted: (title: string) => void;
  onReplaced: (doc: DmsDocument) => void;
}) {
  const replaceRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [zoomFit, setZoomFit] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [replaceError, setReplaceError] = useState<string | null>(null);

  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = doc ? openObjectUrl(doc) : null;
    setUrl(u);
    setZoomFit(true);
    setReplaceError(null);
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [doc]);

  if (!doc) return null;
  const kind = kindMeta(kindForDoc(doc));
  const nextVersion = bumpVersion(doc.version);

  const handleReplace = async (f: File | undefined) => {
    if (!f) return;
    setReplaceError(null);
    try {
      const { fileName, fileData } = await readFileAsBase64(f);
      updateItem(
        'dms',
        doc.id,
        { fileName, fileData, version: nextVersion },
        {
          action: 'Updated',
          details: `Replaced file on ${doc.title} — now ${nextVersion}`,
          verb: 'Replaced',
          verbColor: 'blue',
          text: `${doc.title} file replaced (${nextVersion})`,
        },
      );
      onReplaced({ ...doc, fileName, fileData, version: nextVersion });
    } catch (e) {
      setReplaceError(e instanceof Error ? e.message : 'Could not read that file. Please try again.');
    }
  };

  const printDoc = () => {
    if (isPdf(doc.fileName) && iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.focus();
      iframeRef.current.contentWindow.print();
      return;
    }
    const dataUrl = doc.fileData ? `data:${mimeOf(doc.fileName)};base64,${doc.fileData}` : null;
    if (!dataUrl) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>${doc.title}</title></head><body style="margin:0"><img src="${dataUrl}" style="width:100%" onload="window.print()"/></body></html>`);
    w.document.close();
  };

  return (
    <>
      <Modal
        open={doc != null}
        onClose={onClose}
        width="max-w-[860px]"
        title={
          <span className="flex flex-wrap items-center gap-2">
            <Pill tone="navy">{kind.label}</Pill>
            <span>{doc.title}</span>
            <span className="font-mono text-xs font-medium text-app-muted">{doc.refNo}</span>
            <span className="rounded-full bg-grey-soft px-2 py-0.5 font-mono text-[11px] font-semibold text-grey">{doc.version}</span>
          </span>
        }
        footer={
          <>
            <button
              onClick={() => setConfirmDelete(true)}
              className="mr-auto inline-flex h-9 items-center gap-2 rounded-lg px-3 text-[13px] font-semibold text-danger transition hover:bg-danger-soft"
            >
              <Trash2 size={15} />
              Delete
            </button>
            <button
              onClick={() => doc.fileData && downloadDoc(doc)}
              disabled={!doc.fileData}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-app-border bg-white px-4 text-[13px] font-semibold text-app-ink transition hover:brightness-105 disabled:opacity-50"
            >
              <Download size={15} />
              Download
            </button>
            <button
              onClick={() => replaceRef.current?.click()}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-app-border bg-white px-4 text-[13px] font-semibold text-app-ink transition hover:brightness-105"
            >
              <RefreshCw size={15} />
              Replace file ({nextVersion})
            </button>
            <button
              onClick={printDoc}
              disabled={!doc.fileData}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-action px-4 text-[13px] font-semibold text-white transition hover:-translate-y-px hover:bg-action-hover active:scale-[.98] disabled:opacity-50"
            >
              <Printer size={15} />
              Print
            </button>
          </>
        }
      >
        <input
          ref={replaceRef}
          type="file"
          accept="application/pdf,image/png,image/jpeg"
          className="hidden"
          onChange={(e) => {
            void handleReplace(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        {replaceError && (
          <div className="mb-3 flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs font-medium text-warning">
            <AlertTriangle size={14} className="mt-px shrink-0" />
            {replaceError}
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_240px]">
          {/* Preview pane */}
          <motion.div
            key={`${doc.id}-${doc.version}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="flex min-h-[320px] items-center justify-center overflow-hidden rounded-xl border border-app-border bg-[#F8FAFC]"
          >
            {url && isImage(doc.fileName) ? (
              <button
                onClick={() => setZoomFit((z) => !z)}
                className={cn('block w-full cursor-zoom-in overflow-auto', !zoomFit && 'cursor-zoom-out')}
                title={zoomFit ? 'Click to zoom to 100%' : 'Click to fit'}
              >
                <img
                  src={url}
                  alt={doc.title}
                  className={cn(zoomFit ? 'max-h-[420px] w-full object-contain' : 'w-[200%] max-w-none')}
                />
              </button>
            ) : url && isPdf(doc.fileName) ? (
              <iframe ref={iframeRef} src={url} title={doc.title} className="h-[420px] w-full" />
            ) : (
              <div className="flex flex-col items-center px-6 py-12 text-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#E4EBF4] text-navy-800">
                  <FileText size={28} />
                </span>
                <p className="mt-4 text-[13px] font-semibold text-app-ink">
                  {doc.fileData ? 'Preview not available for this file type' : 'No file attached yet'}
                </p>
                <p className="mt-1 max-w-xs text-xs text-app-muted">
                  {doc.fileData
                    ? 'Download it to view the contents.'
                    : 'Attach the scanned document so it is always one click away during a tender.'}
                </p>
                {!doc.fileData && (
                  <button
                    onClick={() => replaceRef.current?.click()}
                    className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-action px-4 text-[13px] font-semibold text-white transition hover:bg-action-hover"
                  >
                    <FileUp size={15} />
                    Attach file
                  </button>
                )}
              </div>
            )}
          </motion.div>

          {/* Meta rail */}
          <div className="space-y-3 text-sm">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-app-slate">Issuer</div>
              <div className="mt-0.5 text-app-ink">{doc.issuer}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-app-slate">Issue date</div>
              <div className="mt-0.5 text-app-ink tnum">{formatDate(doc.issueDate)}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-app-slate">Expiry</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-app-ink tnum">{doc.expiryDate ? formatDate(doc.expiryDate) : '—'}</span>
                <ExpiryBadge date={doc.expiryDate} />
              </div>
            </div>
            {doc.fileName && (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-app-slate">File</div>
                <div className="mt-0.5 break-all text-[13px] text-app-ink">{doc.fileName}</div>
                <div className="text-xs text-app-muted">{fileSizeText(doc.fileData)}</div>
              </div>
            )}
            {doc.notes && (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-app-slate">Notes</div>
                <div className="mt-0.5 text-[13px] leading-5 text-app-slate">{doc.notes}</div>
              </div>
            )}
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-app-slate">Version history</div>
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-1 flex items-center justify-between rounded-lg border border-app-border px-3 py-2"
              >
                <span className="font-mono text-xs font-semibold text-navy-800">{doc.version}</span>
                <span className="text-xs text-app-muted">current</span>
              </motion.div>
              <p className="mt-1.5 text-xs text-app-muted">
                Replacing the file bumps the version ({nextVersion}) and logs it in the audit trail.
              </p>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          removeItem('dms', doc.id, {
            details: `Deleted ${doc.title} from the vault`,
            text: `${doc.title} removed from Business Documents`,
          });
          onDeleted(doc.title);
          onClose();
        }}
        title="Delete permanently?"
        message={`"${doc.title}" will be removed from the vault. This won't affect tracker history or past audit entries.`}
        confirmLabel="Delete"
        destructive
      />
    </>
  );
}
