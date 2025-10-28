import clsx from 'clsx'
import { PropsWithChildren } from 'react'

export default function Field({
  label,
  children,
  className = '',
  hint,
}: PropsWithChildren<{ label: string; className?: string; hint?: string }>) {
  return (
    <label className={clsx('flex min-w-0 flex-col gap-1 text-sm text-slate-700', className)}>
      <span className="min-h-[1.5rem] text-xs font-semibold tracking-wide text-slate-500 leading-tight">
        {label}
      </span>
      {children}
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
    </label>
  )
}
