import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

/** Empty state with generated SVG illustration, title, hint and optional CTA. */
export function EmptyState({
  image = '/empty-box.svg',
  title,
  hint,
  action,
}: {
  image?: string; // '/empty-box.svg' or '/empty-docs.svg'
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="flex flex-col items-center justify-center px-6 py-14 text-center"
    >
      <img src={image} alt="" className="h-44 w-auto opacity-90" />
      <h3 className="mt-5 text-[15px] font-semibold text-app-ink">{title}</h3>
      {hint && <p className="mt-1 max-w-sm text-sm text-app-slate">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </motion.div>
  );
}
