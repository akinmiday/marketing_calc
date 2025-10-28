import { Currency } from '../types'

export const fmt = (v: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(Number.isFinite(v) ? v : 0)

export const toBase = (amount: number, curr: Currency, base: Currency, usdRate: number) => {
  const a = Number.isFinite(amount) ? amount : 0
  const rate = Number.isFinite(usdRate) && usdRate > 0 ? usdRate : 1
  if (base === 'NGN') return curr === 'NGN' ? a : a * rate
  return curr === 'USD' ? a : a / rate
}

export const formatWithConversion = (currency: Currency, amount: number, usdRate: number) => {
  const value = Number.isFinite(amount) ? amount : 0
  const primary = `${currency} ${fmt(value)}`
  if (currency === 'USD' && Number.isFinite(usdRate) && usdRate > 0) {
    const converted = value * usdRate
    return `${primary} (NGN ${fmt(converted)})`
  }
  return primary
}
