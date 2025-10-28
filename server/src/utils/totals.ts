import { z } from 'zod'

export const Currency = z.enum(['NGN','USD'])
export type Currency = z.infer<typeof Currency>

export const Allocation = z.enum(['per-unit','per-order'])
export type Allocation = z.infer<typeof Allocation>

export const ExtraCost = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum(['amount','percent']),
  amount: z.number().optional(),
  currency: Currency.optional(),
  percent: z.number().optional(),
  allocation: Allocation
})
export type ExtraCost = z.infer<typeof ExtraCost>

export const ProductInput = z.object({
  id: z.string(),
  name: z.string().optional(),
  quantity: z.number(),
  unitSellPrice: z.number().optional().default(0),
  unitSupplierCost: z.number().optional().default(0),
  unitProductionOverhead: z.number().optional().default(0),
  markupPct: z.number().optional().default(0),
})
export type ProductInput = z.infer<typeof ProductInput>

export const InvoiceItem = z.object({
  id: z.string(),
  description: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
})
export type InvoiceItem = z.infer<typeof InvoiceItem>

export const InvoiceParty = z.object({
  name: z.string().optional().default(''),
  email: z.string().optional().default(''),
  phone: z.string().optional().default(''),
  address: z.string().optional().default(''),
})
export type InvoiceParty = z.infer<typeof InvoiceParty>

export const InvoiceData = z.object({
  invoiceNumber: z.string(),
  issueDate: z.string(),
  dueDate: z.string(),
  currency: Currency,
  from: InvoiceParty,
  to: InvoiceParty,
  notes: z.string().optional(),
  terms: z.string().optional(),
  discountPct: z.number().optional(),
  taxPct: z.number().optional(),
  shipping: z.number().optional(),
  items: z.array(InvoiceItem),
})
export type InvoiceData = z.infer<typeof InvoiceData>

export type ProductBreakdown = {
  productId: string
  name: string
  quantity: number
  revenue: number
  supplierCost: number
  productionOverhead: number
  grossProfit: number
}

export type Results = {
  revenue: number
  netRevenue: number
  supplier: number
  prodOverhead: number
  extrasTotal: number
  withholdingTax: number
  grossProfit: number
  marginPct: number
  profitPerUnit: number
  netRevenuePerUnit: number
  requiredUnitPrice: number
  productBreakdown: ProductBreakdown[]
}

export const CalcInput = z.object({
  baseCurrency: Currency,
  usdRate: z.number().default(1),
  products: z.array(ProductInput),
  extras: z.array(ExtraCost),
  targetMarginPct: z.number().default(0)
})
export type CalcInput = z.infer<typeof CalcInput>

const WITHHOLDING_RATE = 0.02
const NET_REVENUE_SHARE = 1 - WITHHOLDING_RATE

export function toBase(amount: number, curr: Currency | undefined, base: Currency, usdRate: number) {
  const a = Number.isFinite(amount) ? amount : 0
  const rate = Number.isFinite(usdRate) && usdRate > 0 ? usdRate : 1
  if (!curr) return a
  if (base === 'NGN') return curr === 'NGN' ? a : a * rate
  return curr === 'USD' ? a : a / rate
}

export function computeCalculator(input: CalcInput) {
  const { baseCurrency, usdRate, products, extras, targetMarginPct } = input

  const productBreakdown = products.map(p => {
    const qty = Math.max(0, p.quantity || 0)
    const revenue = (p.unitSellPrice || 0) * qty
    const supplierCost = (p.unitSupplierCost || 0) * qty
    const productionOverhead = (p.unitProductionOverhead || 0) * qty
    const grossProfit = revenue - supplierCost - productionOverhead
    return {
      productId: p.id,
      name: p.name || 'Product',
      quantity: qty,
      revenue,
      supplierCost,
      productionOverhead,
      grossProfit,
    }
  })

  const revenue = productBreakdown.reduce((s,i)=>s+i.revenue,0)
  const supplier = productBreakdown.reduce((s,i)=>s+i.supplierCost,0)
  const prodOverhead = productBreakdown.reduce((s,i)=>s+i.productionOverhead,0)
  const totalQuantity = productBreakdown.reduce((s,i)=>s+i.quantity,0)

  const extraTotals = extras.map(extra => {
    if (extra.kind === 'percent') {
      const pct = Math.max(0, extra.percent || 0) / 100
      const revenueBasis = revenue
      return revenueBasis * pct
    } else {
      const asBase = toBase(Math.max(0, extra.amount || 0), extra.currency, baseCurrency, usdRate)
      if (extra.allocation === 'per-order') return asBase
      const multiplier = totalQuantity > 0 ? totalQuantity : 0
      return asBase * multiplier
    }
  })
  const extrasTotal = extraTotals.reduce((a,b)=>a+b,0)

  const productionCost = supplier + prodOverhead + extrasTotal
  const withholdingTax = revenue > 0 ? revenue * WITHHOLDING_RATE : 0
  const netRevenue = Math.max(revenue - withholdingTax, 0)
  const grossProfit = netRevenue - productionCost
  const marginPct = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0

  const profitPerUnit = totalQuantity > 0 ? grossProfit / totalQuantity : 0
  const netRevenuePerUnit = totalQuantity > 0 ? netRevenue / totalQuantity : 0

  const targetMargin = Math.max(0, targetMarginPct || 0) / 100
  const marginDenominator = (1 - targetMargin) * NET_REVENUE_SHARE
  const canComputeRevenue = marginDenominator > 0
  const requiredRevenue = canComputeRevenue ? (productionCost / marginDenominator) : 0
  const requiredUnitPrice = (canComputeRevenue && requiredRevenue > 0 && totalQuantity > 0) ? (requiredRevenue / totalQuantity) : 0

  return {
    revenue,
    netRevenue,
    supplier,
    prodOverhead,
    extrasTotal,
    withholdingTax,
    grossProfit,
    marginPct,
    profitPerUnit,
    netRevenuePerUnit,
    requiredUnitPrice,
    productBreakdown,
  }
}

export function computeInvoiceTotals(invoice: InvoiceData) {
  const subtotal = invoice.items.reduce((acc, item) => {
    const qty = Number.isFinite(item.quantity) ? Math.max(item.quantity, 0) : 0
    const price = Number.isFinite(item.unitPrice) ? Math.max(item.unitPrice, 0) : 0
    return acc + qty * price
  }, 0)

  const discountPct = Number.isFinite(invoice.discountPct as number) ? Math.max(invoice.discountPct || 0, 0) : 0
  const taxPct = Number.isFinite(invoice.taxPct as number) ? Math.max(invoice.taxPct || 0, 0) : 0
  const shipping = Number.isFinite(invoice.shipping as number) ? Math.max(invoice.shipping || 0, 0) : 0

  const discount = subtotal * (discountPct / 100)
  const taxable = Math.max(subtotal - discount, 0)
  const tax = taxable * (taxPct / 100)
  const total = taxable + tax + shipping

  return { subtotal, discount, taxable, tax, shipping, total }
}
