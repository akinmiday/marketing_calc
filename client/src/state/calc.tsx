import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { CalcInput, Currency, ExtraCost, ProductInput } from '../types'

const KEY = 'mc:calcstate:v1'

export type CalcState = CalcInput

type Ctx = {
  state: CalcState
  set: <K extends keyof CalcState>(key: K, value: CalcState[K]) => void
  setExtras: (fn: (prev: ExtraCost[]) => ExtraCost[]) => void
  setProducts: (fn: (prev: ProductInput[]) => ProductInput[]) => void
  updateProduct: (id: string, patch: Partial<ProductInput>) => void
  addProduct: () => void
  removeProduct: (id: string) => void
}

const makeProduct = (seed?: Partial<ProductInput>): ProductInput => ({
  id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2),
  name: '',
  quantity: 0,
  unitSellPrice: 0,
  unitSupplierCost: 0,
  unitProductionOverhead: 0,
  markupPct: 0,
  ...seed,
})

const defaultState: CalcState = {
  baseCurrency: 'NGN',
  usdRate: 1,
  products: [makeProduct()],
  extras: [],
  targetMarginPct: 0,
}

const CalcContext = createContext<Ctx | null>(null)

function load(): CalcState {
  try {
    const s = localStorage.getItem(KEY)
    if (!s) return defaultState
    const parsed = JSON.parse(s)
    if (!parsed || typeof parsed !== 'object') return defaultState

    const legacyProduct = {
      name: parsed.productName || '',
      quantity: parsed.quantity || 0,
      unitSellPrice: parsed.unitSellPrice || 0,
      unitSupplierCost: parsed.unitSupplierCost || 0,
      unitProductionOverhead: parsed.unitProductionOverhead || 0,
      markupPct: parsed.markupPct || 0,
    }

    const haveProducts = Array.isArray(parsed.products) && parsed.products.length > 0
    const products: ProductInput[] = haveProducts
      ? parsed.products.map((p: any) =>
          makeProduct({
            id: p?.id,
            name: p?.name || '',
            quantity: Number.isFinite(p?.quantity) ? p.quantity : 0,
            unitSellPrice: Number.isFinite(p?.unitSellPrice) ? p.unitSellPrice : 0,
            unitSupplierCost: Number.isFinite(p?.unitSupplierCost) ? p.unitSupplierCost : 0,
            unitProductionOverhead: Number.isFinite(p?.unitProductionOverhead) ? p.unitProductionOverhead : 0,
            markupPct: Number.isFinite(p?.markupPct) ? p.markupPct : 0,
          }),
        )
      : [makeProduct(legacyProduct)]

    return {
      ...defaultState,
      ...parsed,
      products,
    }
  } catch {
    return defaultState
  }
}

function save(st: CalcState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(st))
  } catch {}
}

export function CalcProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<CalcState>(load())

  useEffect(() => { save(state) }, [state])

  const ctx = useMemo<Ctx>(() => ({
    state,
    set: (key, value) => setState((prev) => ({ ...prev, [key]: value })),
    setExtras: (fn) => setState((prev) => ({ ...prev, extras: fn(prev.extras) })),
    setProducts: (fn) => setState((prev) => ({ ...prev, products: fn(prev.products) })),
    updateProduct: (id, patch) =>
      setState((prev) => ({
        ...prev,
        products: prev.products.map((prod) => (prod.id === id ? { ...prod, ...patch } : prod)),
      })),
    addProduct: () =>
      setState((prev) => ({
        ...prev,
        products: [...prev.products, makeProduct()],
      })),
    removeProduct: (id) =>
      setState((prev) => {
        if (prev.products.length <= 1) return prev
        return {
          ...prev,
          products: prev.products.filter((prod) => prod.id !== id),
        }
      }),
  }), [state])

  return <CalcContext.Provider value={ctx}>{children}</CalcContext.Provider>
}

export function useCalc() {
  const ctx = useContext(CalcContext)
  if (!ctx) throw new Error('useCalc must be used within CalcProvider')
  return ctx
}
