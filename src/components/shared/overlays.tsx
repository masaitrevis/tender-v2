import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

function useEsc(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [open, onClose]);
}

function Overlay({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-[rgba(15,36,56,.45)] backdrop-blur-[2px]"
    />
  );
}

/** Centered modal (max-w 560–760px, rounded-2xl). */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 'max-w-[560px]',
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEsc(open, onClose);
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <Overlay onClose={onClose} />
          <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0, transition: { duration: 0.14 } }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className={cn('pointer-events-auto w-full rounded-2xl bg-white shadow-2xl', width)}
            >
              {title != null && (
                <div className="flex items-center justify-between border-b border-app-border px-6 py-4">
                  <h2 className="text-[15px] font-semibold text-app-ink">{title}</h2>
                  <button
                    onClick={onClose}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-app-slate hover:bg-app-bg"
                    aria-label="Close"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
              <div className="max-h-[70vh] overflow-y-auto px-6 py-5">{children}</div>
              {footer && <div className="flex justify-end gap-2 border-t border-app-border px-6 py-4">{footer}</div>}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Right-side drawer (480–880px, full height, spring enter). */
export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  width = 'w-[560px]',
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEsc(open, onClose);
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <Overlay onClose={onClose} />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            className={cn('fixed inset-y-0 right-0 z-50 flex max-w-full flex-col bg-white shadow-2xl', width)}
          >
            <div className="flex items-center justify-between border-b border-app-border px-6 py-4">
              <h2 className="text-[15px] font-semibold text-app-ink">{title}</h2>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-app-slate hover:bg-app-bg"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
            {footer && <div className="flex justify-end gap-2 border-t border-app-border px-6 py-4">{footer}</div>}
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Destructive-confirm dialog (red primary when destructive). */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  destructive = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-[440px]"
      title={
        <span className="flex items-center gap-2">
          {destructive && <AlertTriangle size={16} className="text-danger" />}
          {title}
        </span>
      }
      footer={
        <>
          <button
            onClick={onClose}
            className="h-9 rounded-lg border border-app-border bg-white px-4 text-[13px] font-semibold text-app-ink transition hover:brightness-105"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={cn(
              'h-9 rounded-lg px-4 text-[13px] font-semibold text-white transition hover:-translate-y-px hover:brightness-105 active:scale-[.98]',
              destructive ? 'bg-danger' : 'bg-action',
            )}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-sm leading-6 text-app-slate">{message}</div>
    </Modal>
  );
}
