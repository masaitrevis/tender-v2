import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/* FormKit basics: labeled input / select / date / currency / phone / textarea / toggle. */

const INPUT =
  'h-[38px] w-full rounded-lg border border-app-border bg-white px-3 text-sm text-app-ink outline-none transition placeholder:text-app-muted focus:border-action focus:ring-2 focus:ring-[rgba(37,99,235,.25)]';

export function Field({
  label,
  error,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 flex items-center gap-1 text-[13px] font-medium text-app-ink">
        {label}
        {required && <span className="text-danger">*</span>}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-danger">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-app-muted">{hint}</span>
      ) : null}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(INPUT, props.className)} />;
}

export function DateInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input type="date" {...props} className={cn(INPUT, 'tnum', props.className)} />;
}

/** Currency input with a fixed KES prefix. */
export function CurrencyInput({
  value,
  onChange,
  placeholder = '0.00',
  className,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> & {
  value: string | number;
  onChange: (v: string) => void;
}) {
  return (
    <div className={cn('flex h-[38px] items-center overflow-hidden rounded-lg border border-app-border bg-white transition focus-within:border-action focus-within:ring-2 focus-within:ring-[rgba(37,99,235,.25)]', className)}>
      <span className="border-r border-app-border bg-app-bg px-3 py-2 font-mono text-[13px] font-medium text-app-slate">KES</span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step="0.01"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-full w-full px-3 text-sm text-app-ink outline-none tnum placeholder:text-app-muted"
        {...rest}
      />
    </div>
  );
}

/** Phone input with a fixed +254 prefix. */
export function PhoneInput({
  value,
  onChange,
  className,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> & {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className={cn('flex h-[38px] items-center overflow-hidden rounded-lg border border-app-border bg-white transition focus-within:border-action focus-within:ring-2 focus-within:ring-[rgba(37,99,235,.25)]', className)}>
      <span className="border-r border-app-border bg-app-bg px-3 py-2 text-[13px] font-medium text-app-slate">+254</span>
      <input
        type="tel"
        value={value}
        placeholder="700 000 000"
        onChange={(e) => onChange(e.target.value.replace(/[^\d\s]/g, ''))}
        className="h-full w-full px-3 text-sm text-app-ink outline-none placeholder:text-app-muted"
        {...rest}
      />
    </div>
  );
}

export function SelectInput({
  options,
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select {...props} className={cn(INPUT, 'appearance-none pr-8', className)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function TextareaInput(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      rows={3}
      {...props}
      className={cn(
        'w-full rounded-lg border border-app-border bg-white px-3 py-2 text-sm text-app-ink outline-none transition placeholder:text-app-muted focus:border-action focus:ring-2 focus:ring-[rgba(37,99,235,.25)]',
        props.className,
      )}
    />
  );
}

/** Simple toggle switch. */
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2"
    >
      <span
        className={cn(
          'relative h-5 w-9 rounded-full transition-colors',
          checked ? 'bg-action' : 'bg-app-border',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all',
            checked ? 'left-[18px]' : 'left-0.5',
          )}
        />
      </span>
      {label && <span className="text-[13px] font-medium text-app-ink">{label}</span>}
    </button>
  );
}
