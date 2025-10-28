import { useEffect, useState } from 'react'

function formatWithCommas(n: number, maxFrac?: number) {
  if (!Number.isFinite(n)) return ''
  const [int, frac = ''] = String(n).split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return frac && maxFrac !== 0 ? `${grouped}.${frac}` : grouped
}

export default function NumberInput({
  value,
  onChange,
  min,
  step,
  placeholder,
  emptyWhenZero = true,
  maxFractionDigits = 2,
  integer = false,
}: {
  value: number | undefined
  onChange: (v: number) => void
  min?: number
  step?: number
  placeholder?: string
  emptyWhenZero?: boolean
  maxFractionDigits?: number
  integer?: boolean
}) {
  const initial = value === 0 && emptyWhenZero ? '' : (value ?? '')
  const [text, setText] = useState<string>(initial as string)

  useEffect(() => {
    const v = value
    const s = (v === 0 && emptyWhenZero) ? '' : (v === undefined ? '' : String(v))
    if (s !== text) setText(s)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, emptyWhenZero])

  const parse = (t: string) => {
    const clean = t.replace(/,/g, '')
    const num = Number(clean)
    return Number.isNaN(num) ? undefined : num
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = e.target.value
    setText(t)
    if (t === '' || t === '-' || t === '.' || t === '-.') return
    const num = parse(t)
    if (num !== undefined) onChange(num)
  }

  const handleBlur = () => {
    if (text === '' || text === '-' || text === '.' || text === '-.') {
      if (!emptyWhenZero) onChange(0)
      setText(emptyWhenZero ? '' : '0')
      return
    }
    const num = parse(text)
    if (num !== undefined) {
      const rounded = integer ? Math.trunc(num) : Number(num.toFixed(maxFractionDigits))
      onChange(rounded)
      setText(formatWithCommas(rounded, integer ? 0 : maxFractionDigits))
    } else {
      setText(emptyWhenZero ? '' : '0')
    }
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      className="h-12 w-full rounded-lg border px-3 text-base font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-600/30"
      value={text}
      onChange={handleChange}
      onBlur={handleBlur}
      min={min as any}
      step={step ?? 0.01 as any}
      placeholder={placeholder}
    />
  )
}
