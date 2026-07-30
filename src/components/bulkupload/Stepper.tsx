/** Wizard stepper — numbered circles + connecting line (design §6.12). */
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export const WIZARD_STEPS = ['Upload', 'Match Columns', 'Check Data', 'Finish'];

export function Stepper({ current }: { current: number }) {
  return (
    <div className="flex items-center">
      {WIZARD_STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={label} className={cn('flex items-center', i < WIZARD_STEPS.length - 1 && 'flex-1')}>
            <div className="flex items-center gap-2.5">
              <motion.div
                initial={false}
                animate={{ scale: active ? 1.08 : 1 }}
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold',
                  done && 'bg-success text-white',
                  active && 'bg-white text-action ring-2 ring-action',
                  !done && !active && 'bg-grey-soft text-grey',
                )}
              >
                {done ? <Check size={15} /> : i + 1}
              </motion.div>
              <span className={cn(
                'whitespace-nowrap text-[13px] font-semibold',
                active ? 'text-app-ink' : done ? 'text-success' : 'text-app-muted',
              )}>
                {label}
              </span>
            </div>
            {i < WIZARD_STEPS.length - 1 && (
              <div className="mx-3 h-px flex-1 bg-app-border">
                <div className={cn('h-px bg-success transition-all duration-300', done ? 'w-full' : 'w-0')} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
