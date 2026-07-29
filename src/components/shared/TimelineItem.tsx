import { motion } from 'framer-motion';
import { formatDateTime } from '@/lib/format';
import type { ActivityEntry } from '@/lib/store';
import { cn } from '@/lib/utils';

const VERB_DOT: Record<ActivityEntry['verbColor'], string> = {
  grey: 'bg-grey',
  blue: 'bg-info',
  navy: 'bg-navy-800',
  green: 'bg-success',
  gold: 'bg-gold',
  red: 'bg-danger',
};

/** Activity feed item: colored verb dot + mono ref + text + timestamp + user. */
export function TimelineItem({ entry, index = 0 }: { entry: ActivityEntry; index?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25, delay: index * 0.05 }}
      className="flex gap-3 py-3"
    >
      <div className="flex flex-col items-center pt-1.5">
        <span className={cn('h-2.5 w-2.5 rounded-full ring-4 ring-white', VERB_DOT[entry.verbColor])} />
        <span className="mt-1 w-px flex-1 bg-app-border" />
      </div>
      <div className="min-w-0 flex-1 pb-2">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[13px] font-semibold text-app-ink">{entry.verb}</span>
          <span className="font-mono text-xs font-medium text-navy-800">{entry.ref}</span>
        </div>
        <p className="mt-0.5 truncate text-sm text-app-slate">{entry.text}</p>
        <p className="mt-1 text-xs text-app-muted tnum">
          {formatDateTime(entry.timestamp)} · {entry.user}
        </p>
      </div>
    </motion.div>
  );
}
