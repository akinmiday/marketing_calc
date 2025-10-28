import { motion } from 'framer-motion'
import { Allocation, Currency, ExtraCost } from '../types'
import { Plus, Trash2, Percent } from 'lucide-react'
import NumberInput from './NumberInput'

export default function ExtrasEditor({
  extras,
  baseCurrency,
  onAdd,
  onUpdate,
  onRemove,
}: {
  extras: ExtraCost[]
  baseCurrency: Currency
  onAdd: () => void
  onUpdate: (id: string, patch: Partial<ExtraCost>) => void
  onRemove: (id: string) => void
}) {
  return (
    <div className="space-y-4">
      {extras.map((e) => (
        <motion.div key={e.id} layout className="rounded-2xl border bg-white p-3 md:p-4 shadow-soft">
          {/* Row A: label / type / allocation */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
            <div className="md:col-span-6 min-w-0">
              <label className="grid gap-1 w-full">
                <span className="text-xs text-slate-600">Label</span>
                <input
                  className="w-full min-w-0 rounded-md border px-3 py-2"
                  placeholder="e.g., Shipping, Duty"
                  value={e.label}
                  onChange={(ev) => onUpdate(e.id, { label: ev.target.value })}
                />
              </label>
            </div>
            <div className="md:col-span-3 min-w-0">
              <label className="grid gap-1 w-full">
                <span className="text-xs text-slate-600">Type</span>
                <select
                  className="w-full min-w-0 rounded-md border bg-white px-3 py-2"
                  value={e.kind}
                  onChange={(ev) => onUpdate(e.id, { kind: ev.target.value as 'amount' | 'percent' })}
                >
                  <option value="amount">Amount</option>
                  <option value="percent">Percent</option>
                </select>
              </label>
            </div>
            <div className="md:col-span-3 min-w-0">
              <label className="grid gap-1 w-full">
                <span className="text-xs text-slate-600">Allocation</span>
                <select
                  className="w-full min-w-0 rounded-md border bg-white px-3 py-2"
                  value={e.allocation}
                  onChange={(ev) => onUpdate(e.id, { allocation: ev.target.value as Allocation })}
                >
                  <option value="per-order">Per order</option>
                  <option value="per-unit">Per unit</option>
                </select>
              </label>
            </div>
          </div>

          {/* Row B: amount+currency OR percent; remove button sits on its own row on mobile */}
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-12 md:items-end">
            {e.kind === 'amount' ? (
              <>
                <div className="md:col-span-6 min-w-0">
                  <label className="grid gap-1 w-full">
                    <span className="text-xs text-slate-600">Amount</span>
                    <NumberInput value={e.amount} onChange={(v)=>onUpdate(e.id,{ amount:v })} placeholder="0" />
                  </label>
                </div>
                <div className="md:col-span-3 min-w-0">
                  <label className="grid gap-1 w-full">
                    <span className="text-xs text-slate-600">Currency</span>
                    <select
                      className="w-full min-w-0 rounded-md border bg-white px-3 py-2"
                      value={e.currency || baseCurrency}
                      onChange={(ev) => onUpdate(e.id, { currency: ev.target.value as Currency })}
                    >
                      <option value="NGN">NGN</option>
                      <option value="USD">USD</option>
                    </select>
                  </label>
                </div>
              </>
            ) : (
              <>
                <div className="md:col-span-9 min-w-0">
                  <label className="grid gap-1 w-full">
                    <span className="text-xs text-slate-600">Percent</span>
                    <div className="flex items-center rounded-md border px-3 py-2">
                      <Percent className="mr-2 h-4 w-4 text-slate-500" />
                      <div className="flex-1 min-w-0">
                        <NumberInput value={e.percent} onChange={(v)=>onUpdate(e.id,{ percent:v })} placeholder="0" maxFractionDigits={2} />
                      </div>
                      <span className="ml-2 text-sm text-slate-500">%</span>
                    </div>
                  </label>
                  <div className="mt-1 text-[11px] text-slate-500">
                    Per‑unit applies to <span className="font-medium">unit price</span>; Per‑order applies to <span className="font-medium">total revenue</span>.
                  </div>
                </div>
              </>
            )}

            {/* Remove button column - always its own place */}
            <div className="md:col-span-3 flex justify-end">
              <button
                className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-red-50 hover:text-red-700"
                onClick={() => onRemove(e.id)}
                aria-label={`Remove ${e.label}`}
              >
                <Trash2 className="h-4 w-4" /> Remove
              </button>
            </div>
          </div>
        </motion.div>
      ))}
      <div className="pt-1">
        <button
          className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-medium shadow-soft hover:bg-slate-50"
          onClick={onAdd}
        >
          <Plus className="h-4 w-4" /> Add extra cost
        </button>
      </div>
    </div>
  )
}
