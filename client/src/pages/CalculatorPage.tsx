import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calculator, Truck, Package, Eraser, CheckCircle2, AlertTriangle, Info, Plus, Trash2, FilePlus2 } from 'lucide-react'
import Card from '../components/Card'
import Field from '../components/Field'
import NumberInput from '../components/NumberInput'
import ExtrasEditor from '../components/ExtrasEditor'
import { BreakdownCard, MobileSummaryBar, ReceiptSummary } from '../components/Summary'
import MoneyValue from '../components/MoneyValue'
import { CalcInput, Currency, ExtraCost, ProductInput, Results } from '../types'
import { formatWithConversion, toBase } from '../utils/currency'
import { useCalc } from '../state/calc'
import { getEditingReceiptId, setEditingReceiptId } from '../utils/storage'
import { createReceipt, updateReceipt as updateReceiptApi } from '../api'

const encodeInvoiceImport = (data: unknown) => {
  try {
    const json = JSON.stringify(data)
    const packed = encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(Number(`0x${p1}`)),
    )
    return typeof btoa === 'function' ? btoa(packed) : ''
  } catch {
    return ''
  }
}

export default function CalculatorPage() {
  const { state, set, setExtras, setProducts, updateProduct, addProduct, removeProduct } = useCalc()
  const { baseCurrency, usdRate, products, extras, targetMarginPct } = state
  const navigate = useNavigate()
  const [isSaving, setIsSaving] = useState(false)

  const WITHHOLDING_RATE = 0.02
  const NET_REVENUE_SHARE = 1 - WITHHOLDING_RATE
  const MAX_MARGIN_PCT = 100

  const primaryProductName = products[0]?.name || ''
  const renderMoney = (
    amount: number,
    opts?: {
      align?: 'start' | 'end'
      primaryClassName?: string
      secondaryClassName?: string
      className?: string
      noWrap?: boolean
    },
  ) => (
    <MoneyValue
      currency={baseCurrency as Currency}
      amount={amount}
      usdRate={usdRate}
      align={opts?.align}
      primaryClassName={opts?.primaryClassName}
      secondaryClassName={opts?.secondaryClassName}
      className={opts?.className}
      noWrap={opts?.noWrap}
    />
  )
  const formatMoneyString = (amount: number) => formatWithConversion(baseCurrency as Currency, amount, usdRate)

  const results: Results = useMemo(() => {
    const productBreakdown = products.map((product) => {
      const quantity = Math.max(0, product.quantity || 0)
      const revenue = (product.unitSellPrice || 0) * quantity
      const supplierCost = (product.unitSupplierCost || 0) * quantity
      const productionOverhead = (product.unitProductionOverhead || 0) * quantity
      const grossProfit = revenue - supplierCost - productionOverhead
      return {
        productId: product.id,
        name: product.name || 'Untitled product',
        quantity,
        revenue,
        supplierCost,
        productionOverhead,
        grossProfit,
      }
    })

    const totalQuantity = productBreakdown.reduce((acc, item) => acc + item.quantity, 0)
    const totalRevenue = productBreakdown.reduce((acc, item) => acc + item.revenue, 0)
    const totalSupplier = productBreakdown.reduce((acc, item) => acc + item.supplierCost, 0)
    const totalOverhead = productBreakdown.reduce((acc, item) => acc + item.productionOverhead, 0)

    const extraTotals = extras.map((extra) => {
      if (extra.kind === 'percent') {
        const pct = Math.max(0, extra.percent || 0) / 100
        const revenueBasis = totalRevenue
        return revenueBasis * pct
      } else {
        const asBase = toBase(Math.max(0, extra.amount || 0), (extra.currency || baseCurrency), baseCurrency, usdRate)
        if (extra.allocation === 'per-order') return asBase
        const multiplier = totalQuantity > 0 ? totalQuantity : 0
        return asBase * multiplier
      }
    })

    const extrasTotal = extraTotals.reduce((acc, item) => acc + item, 0)
    const productionCost = totalSupplier + totalOverhead + extrasTotal
    const withholdingTax = totalRevenue > 0 ? totalRevenue * WITHHOLDING_RATE : 0
    const netRevenue = Math.max(totalRevenue - withholdingTax, 0)
    const grossProfit = netRevenue - productionCost
    const marginPct = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0

    const profitPerUnit = totalQuantity > 0 ? grossProfit / totalQuantity : 0
    const netRevenuePerUnit = totalQuantity > 0 ? netRevenue / totalQuantity : 0

    const targetMargin = Math.max(0, targetMarginPct || 0) / 100
    const marginDenominator = (1 - targetMargin) * NET_REVENUE_SHARE
    const canComputeRevenue = marginDenominator > 0
    const requiredRevenue = canComputeRevenue ? productionCost / marginDenominator : 0
    const requiredUnitPrice =
      canComputeRevenue && requiredRevenue > 0 && totalQuantity > 0 ? requiredRevenue / totalQuantity : 0

    return {
      revenue: totalRevenue,
      netRevenue,
      supplier: totalSupplier,
      prodOverhead: totalOverhead,
      extrasTotal,
      withholdingTax,
      grossProfit,
      marginPct,
      profitPerUnit,
      netRevenuePerUnit,
      requiredUnitPrice,
      productBreakdown,
    }
  }, [baseCurrency, products, extras, targetMarginPct, usdRate])

  const C = baseCurrency as Currency

  const formatPct = (v: number) => (Number.isFinite(v) ? v : 0).toFixed(2)
  const safeTargetMarginPct = Math.max(0, targetMarginPct || 0)
  const hasTarget = safeTargetMarginPct > 0
  const totalQuantity = results.productBreakdown.reduce((acc, item) => acc + item.quantity, 0)
  const hasQuantity = totalQuantity > 0
  const targetFeasible = safeTargetMarginPct < MAX_MARGIN_PCT - 0.0001
  const actualMarginPct = results.marginPct
  const hasMeaningfulResults =
    hasQuantity &&
    (results.revenue > 0 || results.supplier > 0 || results.prodOverhead > 0 || results.extrasTotal > 0)
  const marginGap = hasTarget && hasMeaningfulResults ? actualMarginPct - safeTargetMarginPct : 0
  const targetTooLow = hasTarget && hasMeaningfulResults && marginGap > 0.0001
  const targetOnPar = hasTarget && hasMeaningfulResults && Math.abs(marginGap) <= 0.0001
  const targetBehind = hasTarget && hasMeaningfulResults && marginGap < -0.0001
  const marginShortfall = targetBehind ? Math.abs(marginGap) : 0
  const marginExcess = targetTooLow ? marginGap : 0

  let statusVariant: 'info' | 'success' | 'warning' | 'danger' = 'info'
  let statusHeading = 'No target set'
  let statusBody = `Current margin after withholding is ${formatPct(actualMarginPct)}%.`

  if (hasTarget) {
    if (!hasMeaningfulResults) {
      statusHeading = 'Awaiting data'
      statusBody = `Enter quantities and pricing so we can compare against your ${formatPct(safeTargetMarginPct)}% target margin.`
    } else if (targetTooLow) {
      const lead = formatPct(marginExcess)
      if (marginExcess > 5) {
        statusVariant = 'danger'
        statusHeading = 'Target far below current margin'
        statusBody = `Current margin ${formatPct(actualMarginPct)}% exceeds your ${formatPct(safeTargetMarginPct)}% goal by ${lead} pp. Raise the target to match performance.`
      } else {
        statusVariant = 'warning'
        statusHeading = 'Target below current margin'
        statusBody = `Margin already at ${formatPct(actualMarginPct)}%, which is ${lead} pp above your target. Consider increasing the goal.`
      }
    } else if (!targetFeasible) {
      statusHeading = 'Target margin unreachable'
      statusBody = `Max possible margin after 2% withholding is ${formatPct(MAX_MARGIN_PCT)}%. Lower the target or adjust pricing.`
    } else if (targetOnPar) {
      statusVariant = 'success'
      statusHeading = 'Target met'
      statusBody = `Current margin ${formatPct(actualMarginPct)}% matches your ${formatPct(safeTargetMarginPct)}% goal.`
    } else if (targetBehind) {
      statusHeading = 'Target ahead of current margin'
      statusBody = `Margin is ${formatPct(actualMarginPct)}% — short of target by ${formatPct(marginShortfall)} pp.`
    } else {
      statusVariant = 'success'
      statusHeading = 'Target met'
      statusBody = `Current margin ${formatPct(actualMarginPct)}% meets or exceeds your ${formatPct(safeTargetMarginPct)}% goal.`
    }
  }

  const statusClasses = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    danger: 'border-red-200 bg-red-50 text-red-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    info: 'border-slate-200 bg-slate-50 text-slate-700',
  }[statusVariant]

  const statusIcon = (() => {
    switch (statusVariant) {
      case 'success':
        return <CheckCircle2 className="h-4 w-4" />
      case 'danger':
      case 'warning':
        return <AlertTriangle className="h-4 w-4" />
      default:
        return <Info className="h-4 w-4" />
    }
  })()

  const actualAverageUnitPrice = totalQuantity > 0 ? results.revenue / totalQuantity : 0
  const showRequiredPrice = hasTarget && targetFeasible && hasMeaningfulResults && targetBehind
  const requiredUnitPriceDisplay = showRequiredPrice
    ? renderMoney(Math.max(results.requiredUnitPrice, 0), { primaryClassName: 'font-semibold text-slate-900' })
    : <span>—</span>
  const priceDelta = showRequiredPrice ? Math.max(0, results.requiredUnitPrice - actualAverageUnitPrice) : 0

  let helperLine: string | null = null
  if (!hasQuantity) {
    helperLine = 'Enter a quantity to compute accurate margin and required price.'
  } else if (hasTarget && hasMeaningfulResults && !targetFeasible) {
    helperLine = `Withholding caps the achievable margin at ${formatPct(MAX_MARGIN_PCT)}%.`
  } else if (hasTarget && targetTooLow) {
    helperLine =
      marginExcess > 5
        ? 'Targets set well below actual performance may understate profitability for stakeholders.'
        : `Your target trails current performance by ${formatPct(marginExcess)} pp. Consider raising the goal.`
  } else if (hasTarget && targetBehind && targetFeasible && priceDelta > 0.05) {
    helperLine = `Increase the average unit price by ${formatMoneyString(Math.max(0, priceDelta))} to hit the target.`
  } else if (hasTarget && targetOnPar) {
    helperLine = 'Great job staying right on target.'
  }

  const addExtra = () =>
    setExtras((prev) => [
      ...prev,
      {
        id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2),
        label: '',
        kind: 'amount',
        amount: 0,
        currency: baseCurrency,
        allocation: 'per-order',
      },
    ])
  const updateExtra = (id: string, patch: Partial<ExtraCost>) =>
    setExtras((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  const removeExtra = (id: string) => setExtras((prev) => prev.filter((e) => e.id !== id))

  const blankProduct = (): ProductInput => ({
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2),
    name: '',
    quantity: 0,
    unitSellPrice: 0,
    unitSupplierCost: 0,
    unitProductionOverhead: 0,
    markupPct: 0,
  })

  const handleGenerateInvoice = () => {
    const items = products
      .map((product, index) => {
        const rawQuantity = Number.isFinite(product.quantity) ? product.quantity || 0 : 0
        const rawPrice = Number.isFinite(product.unitSellPrice) ? product.unitSellPrice || 0 : 0
        const normalizedQuantity = rawQuantity > 0 ? rawQuantity : rawPrice > 0 ? 1 : 0
        const safePrice = Math.max(rawPrice, 0)
        return {
          description: (product.name || '').trim() || `Product ${index + 1}`,
          quantity: Math.max(normalizedQuantity, 0),
          unitPrice: Number(safePrice.toFixed(2)),
        }
      })
      .filter((item) => item.quantity > 0 || item.unitPrice > 0)

    if (items.length === 0) {
      alert('Add at least one product with quantity or selling price to generate an invoice.')
      return
    }

    const payload = {
      currency: baseCurrency as Currency,
      items,
    }
    const encoded = encodeInvoiceImport(payload)
    if (!encoded) {
      alert('Unable to prepare invoice payload.')
      return
    }
    navigate(`/invoice?calc=${encoded}`)
  }

  const handleSupplierChange = (id: string, value: number) => {
    const product = products.find((p) => p.id === id)
    if (!product) return
    const patch: Partial<ProductInput> = { unitSupplierCost: value }
    if ((product.markupPct || 0) > 0) {
      const base = (value || 0) + (product.unitProductionOverhead || 0)
      const nextSell = base * (1 + (product.markupPct || 0) / 100)
      patch.unitSellPrice = Number(nextSell.toFixed(2))
    }
    updateProduct(id, patch)
  }

  const handleOverheadChange = (id: string, value: number) => {
    const product = products.find((p) => p.id === id)
    if (!product) return
    const patch: Partial<ProductInput> = { unitProductionOverhead: value }
    if ((product.markupPct || 0) > 0) {
      const base = (product.unitSupplierCost || 0) + (value || 0)
      const nextSell = base * (1 + (product.markupPct || 0) / 100)
      patch.unitSellPrice = Number(nextSell.toFixed(2))
    }
    updateProduct(id, patch)
  }

  const handleMarkupChange = (id: string, value: number) => {
    const product = products.find((p) => p.id === id)
    if (!product) return
    const pct = Math.max(0, value || 0)
    const base = (product.unitSupplierCost || 0) + (product.unitProductionOverhead || 0)
    const nextSell = base * (1 + pct / 100)
    updateProduct(id, {
      markupPct: Number(pct.toFixed(2)),
      unitSellPrice: Number(nextSell.toFixed(2)),
    })
  }

  const handleSellPriceChange = (id: string, value: number) => {
    const product = products.find((p) => p.id === id)
    if (!product) return
    const base = (product.unitSupplierCost || 0) + (product.unitProductionOverhead || 0)
    const patch: Partial<ProductInput> = { unitSellPrice: value }
    if (base > 0) {
      const nextMarkup = ((value || 0) / base - 1) * 100
      patch.markupPct = Number((nextMarkup || 0).toFixed(2))
    } else {
      patch.markupPct = 0
    }
    updateProduct(id, patch)
  }

  async function handleSave(asNew?: boolean) {
    if (isSaving) return
    setIsSaving(true)
    try {
      const editingId = getEditingReceiptId()
      const sanitizedProducts = products.map((p) => ({ ...p }))
      const sanitizedExtras = extras.map((extra) => ({ ...extra }))
      const input: CalcInput = {
        baseCurrency: baseCurrency as Currency,
        usdRate: Number.isFinite(usdRate) ? usdRate : 1,
        products: sanitizedProducts,
        extras: sanitizedExtras,
        targetMarginPct: Number.isFinite(targetMarginPct) ? targetMarginPct : 0,
      }
      const label =
        primaryProductName || (products.length > 1 ? `${products.length} products` : 'Untitled')

      if (editingId && !asNew) {
        const updated = await updateReceiptApi(editingId, { input, label })
        setEditingReceiptId(updated.id)
        alert('Updated existing history item.')
      } else {
        const created = await createReceipt({ input, label })
        setEditingReceiptId(created.id)
        alert('Saved to history.')
      }
    } catch (err) {
      console.error(err)
      const message = err instanceof Error ? err.message : 'Failed to save calculation.'
      alert(message)
    } finally {
      setIsSaving(false)
    }
  }

  function handleClear() {
    set('baseCurrency', 'NGN' as Currency)
    set('usdRate', 1)
    set('targetMarginPct', 0)
    setProducts(() => [blankProduct()])
    setExtras(() => [])
    setEditingReceiptId(null)
  }

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6 min-w-0 pb-28 md:pb-0">
      {/* Top toolbar */}
      <header className="mb-6 rounded-2xl border bg-white/95 p-3 md:p-4 shadow-soft">
        <div className="flex flex-col gap-3 md:gap-4">
          <div className="flex min-w-0 items-center gap-2">
            <Calculator className="h-5 w-5 text-brand-700" />
            <h1 className="truncate text-base font-semibold md:text-xl">Marketing Profit & Margin Calculator</h1>
            {(primaryProductName || products.length > 1) && (
              <span className="ml-2 shrink-0 rounded-full border bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                {primaryProductName || 'Multi-product'}
                {products.length > 1 ? ` (+${products.length - 1})` : ''}
              </span>
            )}
          </div>
          <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 md:w-auto md:grid-cols-3 md:self-end">
            <label className="grid gap-1">
              <span className="text-xs text-slate-600">Base currency</span>
              <select
                className="rounded-xl border bg-white px-3 py-2"
                value={baseCurrency}
                onChange={(e) => set('baseCurrency', e.target.value as Currency)}
                aria-label="Base currency"
              >
                <option value="NGN">Base: NGN</option>
                <option value="USD">Base: USD</option>
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-xs text-slate-600">USD ↔ NGN rate (NGN per $1)</span>
              <div className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2">
                <NumberInput value={usdRate} onChange={(v)=>set('usdRate', v || 1)} maxFractionDigits={4} placeholder="0" />
              </div>
            </label>
            <label className="grid gap-1">
              <span className="text-xs text-slate-600">Products</span>
              <div className="rounded-xl border bg-slate-50 px-3 py-2 text-sm">
                {products.length} item{products.length === 1 ? '' : 's'}
              </div>
            </label>
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          <button
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-medium shadow-soft hover:bg-slate-50 sm:w-auto"
            onClick={handleClear}
          >
            <Eraser className="h-4 w-4" /> Clear
          </button>

          <button
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-soft hover:bg-emerald-700 sm:w-auto"
            onClick={() => {
              void handleSave(false)
            }}
            disabled={isSaving}
          >
            Save
          </button>
          <button
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-medium shadow-soft hover:bg-slate-50 sm:w-auto"
            onClick={() => {
              void handleSave(true)
            }}
            disabled={isSaving}
          >
            Save as new
          </button>
          <button
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-soft hover:bg-indigo-700 sm:w-auto"
            onClick={handleGenerateInvoice}
          >
            <FilePlus2 className="h-4 w-4" /> Generate invoice
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 md:[grid-template-columns:minmax(0,2fr)_minmax(0,1fr)]">
        {/* Left: Inputs */}
        <section className="space-y-6">
          <Card title="Core Inputs" subtitle="Enter product specifics below. Add more products to capture bundles or packages.">
            <div className="flex flex-col gap-4">
              {products.map((product, index) => {
                const baseUnitCost = (product.unitSupplierCost || 0) + (product.unitProductionOverhead || 0)
                const revenue = (product.unitSellPrice || 0) * (product.quantity || 0)
                const costs = baseUnitCost * Math.max(product.quantity || 0, 0)
                const grossPerUnit = (product.unitSellPrice || 0) - baseUnitCost
                return (
                  <div key={product.id} className="rounded-2xl border bg-white px-4 py-4 shadow-soft">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-slate-500">Product</div>
                        <div className="text-base font-semibold text-slate-900">
                          #{index + 1} {product.name ? `• ${product.name}` : ''}
                        </div>
                      </div>
                      {products.length > 1 && (
                        <button
                          className="inline-flex items-center gap-1 self-start rounded-lg border bg-white px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                          type="button"
                          onClick={() => removeProduct(product.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Remove
                        </button>
                      )}
                    </div>
                    <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-3">
                      <Field label="Product name" className="sm:min-h-[88px]">
                        <input
                          className="h-12 w-full rounded-lg border px-3 focus:outline-none focus:ring-2 focus:ring-brand-600/30"
                          value={product.name}
                          onChange={(e) => updateProduct(product.id, { name: e.target.value })}
                          placeholder="Product"
                        />
                      </Field>
                      <Field label="Quantity" className="sm:min-h-[88px]">
                        <NumberInput
                          value={product.quantity}
                          onChange={(v) => updateProduct(product.id, { quantity: v })}
                          min={0}
                          step={1}
                          placeholder="0"
                          integer
                        />
                      </Field>
                      <Field label="Markup (%)" className="sm:min-h-[88px]">
                        <NumberInput
                          value={product.markupPct}
                          onChange={(v) => handleMarkupChange(product.id, v)}
                          min={0}
                          placeholder="0"
                          maxFractionDigits={2}
                        />
                      </Field>
                    </div>
                    <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-3">
                      <Field label={`Supplier cost / unit (${C})`} className="sm:min-h-[88px]">
                        <NumberInput
                          value={product.unitSupplierCost}
                          onChange={(v) => handleSupplierChange(product.id, v)}
                          min={0}
                          placeholder="0"
                        />
                      </Field>
                      <Field label={`Production overhead / unit (${C})`} className="sm:min-h-[88px]">
                        <NumberInput
                          value={product.unitProductionOverhead}
                          onChange={(v) => handleOverheadChange(product.id, v)}
                          min={0}
                          placeholder="0"
                        />
                      </Field>
                      <Field label={`Selling price / unit (${C})`} className="sm:min-h-[88px]">
                        <NumberInput
                          value={product.unitSellPrice}
                          onChange={(v) => handleSellPriceChange(product.id, v)}
                          min={0}
                          placeholder="0"
                        />
                      </Field>
                    </div>
                    <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 text-sm text-slate-600 lg:grid-cols-4">
                      <div className="rounded-xl border bg-slate-50 px-4 py-3">
                        <div className="text-xs uppercase tracking-wide text-slate-500">Base cost / unit</div>
                        {renderMoney(baseUnitCost, {
                          align: 'start',
                          primaryClassName: 'font-semibold text-slate-900 text-[13px] sm:text-sm font-mono',
                          noWrap: true,
                        })}
                      </div>
                      <div className="rounded-xl border bg-slate-50 px-4 py-3">
                        <div className="text-xs uppercase tracking-wide text-slate-500">Revenue (total)</div>
                        {renderMoney(revenue, {
                          align: 'start',
                          primaryClassName: 'font-semibold text-slate-900 text-[13px] sm:text-sm font-mono',
                          noWrap: true,
                        })}
                      </div>
                      <div className="rounded-xl border bg-slate-50 px-4 py-3">
                        <div className="text-xs uppercase tracking-wide text-slate-500">Costs (supplier + overhead)</div>
                        {renderMoney(costs, {
                          align: 'start',
                          primaryClassName: 'font-semibold text-slate-900 text-[13px] sm:text-sm font-mono',
                          noWrap: true,
                        })}
                      </div>
                      <div className="rounded-xl border bg-emerald-50 px-4 py-3 text-emerald-800">
                        <div className="text-xs uppercase tracking-wide text-emerald-700">Gross profit / unit</div>
                        {renderMoney(grossPerUnit, {
                          align: 'start',
                          primaryClassName: 'font-semibold text-emerald-800 text-[13px] sm:text-sm font-mono',
                          secondaryClassName: 'text-[11px] text-emerald-600',
                          noWrap: true,
                        })}
                      </div>
                    </div>
                  </div>
                )
              })}

              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-dashed border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
                onClick={() => addProduct()}
              >
                <Plus className="h-4 w-4" /> Add another product
              </button>
            </div>
          </Card>

          <Card title="Extra Costs" subtitle="Shipping, logistics, marketing, duties, etc. Choose currency and allocation.">
            <div className="mb-3 grid grid-cols-2 gap-3 text-xs text-slate-600 md:grid-cols-4">
              <div className="inline-flex items-center gap-1"><Package className="h-3.5 w-3.5" /> Per-unit costs scale with quantity</div>
              <div className="inline-flex items-center gap-1"><Truck className="h-3.5 w-3.5" /> Per-order costs apply once per order</div>
            </div>
            <ExtrasEditor
              extras={extras}
              baseCurrency={baseCurrency as Currency}
              onAdd={addExtra}
              onUpdate={updateExtra}
              onRemove={removeExtra}
            />
          </Card>

          <Card title="Target Margin" subtitle="Track margin after all costs and withholding.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Target margin (%)" className="sm:min-h-[88px]">
                <NumberInput value={targetMarginPct} onChange={(v)=>set('targetMarginPct', v)} min={0} />
              </Field>
              <div className="space-y-3 sm:col-span-2">
                <div className={`rounded-xl border px-4 py-3 text-sm ${statusClasses}`}>
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5">{statusIcon}</span>
                    <div>
                      <div className="font-semibold">{statusHeading}</div>
                      <div className="mt-1 text-xs sm:text-sm opacity-80">{statusBody}</div>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border bg-white px-4 py-3 text-sm text-slate-700">
                  <div className="flex items-center justify-between gap-3">
                    <span className="max-w-[60%]">Required average unit price to hit target</span>
                    <span className="min-w-0 text-right font-semibold">{requiredUnitPriceDisplay}</span>
                  </div>
                  {helperLine && <div className="mt-1 text-xs text-slate-500">{helperLine}</div>}
                </div>
              </div>
            </div>
          </Card>
        </section>

        {/* Right: Summary */}
        <section className="space-y-6">
          <ReceiptSummary
            title="Summary"
            productName={primaryProductName}
            currency={C}
            results={results}
            quantity={totalQuantity}
            products={products}
            usdRate={usdRate}
          />
          <BreakdownCard currency={C} results={results} usdRate={usdRate} />
        </section>
      </div>

      {/* Mobile summary bar */}
      <MobileSummaryBar currency={C} results={results} usdRate={usdRate} />
    </div>
  )
}
