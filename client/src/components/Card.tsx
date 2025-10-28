import { PropsWithChildren, ReactNode } from 'react'

type CardProps = PropsWithChildren<{
  title: ReactNode
  subtitle?: ReactNode
  /** Optional right-side header content (e.g., buttons). Wraps on mobile to avoid overlap. */
  actions?: ReactNode
  /** Optional extra classes for the outer card */
  className?: string
  /** Optional extra classes for the body wrapper */
  bodyClassName?: string
}>

export default function Card({
  title,
  subtitle,
  actions,
  children,
  className = '',
  bodyClassName = '',
}: CardProps) {
  return (
    <div className={`rounded-2xl border bg-white p-5 shadow-soft ${className}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {/* Title & Subtitle */}
        <div className="min-w-0">
          <h2 className="text-lg font-semibold truncate">{title}</h2>
          {subtitle && (
            <p className="mt-1 text-sm text-slate-600">
              {subtitle}
            </p>
          )}
        </div>

        {/* Right-side actions (wrap on small screens) */}
        {actions && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {actions}
          </div>
        )}
      </div>

      <div className={`mt-4 ${bodyClassName}`}>
        {children}
      </div>
    </div>
  )
}
