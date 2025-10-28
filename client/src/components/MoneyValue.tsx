import clsx from 'clsx'
import { fmt } from '../utils/currency'
import type { Currency } from '../types'

type MoneyValueProps = {
  currency: Currency
  amount: number
  usdRate: number
  align?: 'start' | 'end'
  className?: string
  primaryClassName?: string
  secondaryClassName?: string
  noWrap?: boolean
}

export default function MoneyValue({
  currency,
  amount,
  usdRate,
  align = 'end',
  className = '',
  primaryClassName = '',
  secondaryClassName = 'text-xs text-slate-500',
  noWrap = false,
}: MoneyValueProps) {
  const value = Number.isFinite(amount) ? amount : 0
  const primary = `${currency} ${fmt(value)}`
  const showSecondary = currency === 'USD' && Number.isFinite(usdRate) && usdRate > 0
  const secondary = showSecondary ? `NGN ${fmt(value * usdRate)}` : null

  return (
    <span
      className={clsx(
        'inline-flex min-w-0 max-w-full flex-col leading-tight',
        noWrap
          ? 'whitespace-nowrap overflow-x-auto sm:overflow-visible'
          : 'whitespace-normal break-words',
        align === 'start' ? 'items-start text-left' : 'items-end text-right',
        className,
      )}
    >
      <span className={clsx('block max-w-full', primaryClassName)}>{primary}</span>
      {secondary && <span className={clsx('block max-w-full', secondaryClassName)}>{secondary}</span>}
    </span>
  )
}
