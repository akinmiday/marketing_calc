import { Currency, ExtraCost, InvoiceData, ProductInput, Results } from '../types'

const RECEIPT_KEY = 'mc:receipts:v2'
const LEGACY_RECEIPT_KEY = 'mc:receipts:v1'
const INVOICE_KEY = 'mc:invoices:v1'

const EDIT_KEY = 'mc:editingReceiptId:v1'
const INVOICE_EDIT_KEY = 'mc:editingInvoiceId:v1'

const randomId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)

const toNumber = (value: unknown, fallback = 0) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

const ensureExtra = (raw: any, baseCurrency: Currency): ExtraCost => ({
  id: typeof raw?.id === 'string' ? raw.id : randomId(),
  label: typeof raw?.label === 'string' ? raw.label : '',
  kind: raw?.kind === 'percent' ? 'percent' : 'amount',
  amount: toNumber(raw?.amount),
  currency: raw?.currency === 'USD' ? 'USD' : raw?.currency === 'NGN' ? 'NGN' : baseCurrency,
  percent: toNumber(raw?.percent),
  allocation: raw?.allocation === 'per-unit' ? 'per-unit' : 'per-order',
})

const ensureProduct = (raw: any, fallbackName = ''): ProductInput => ({
  id: typeof raw?.id === 'string' ? raw.id : randomId(),
  name: typeof raw?.name === 'string' ? raw.name : fallbackName,
  quantity: toNumber(raw?.quantity),
  unitSellPrice: toNumber(raw?.unitSellPrice),
  unitSupplierCost: toNumber(raw?.unitSupplierCost),
  unitProductionOverhead: toNumber(raw?.unitProductionOverhead),
  markupPct: toNumber(raw?.markupPct),
})

const deriveFromProducts = (products: ProductInput[]) => {
  const productBreakdown = products.map((product) => {
    const quantity = Math.max(0, product.quantity || 0)
    const revenue = (product.unitSellPrice || 0) * quantity
    const supplierCost = (product.unitSupplierCost || 0) * quantity
    const productionOverhead = (product.unitProductionOverhead || 0) * quantity
    const grossProfit = revenue - supplierCost - productionOverhead
    return {
      productId: product.id,
      name: product.name || 'Product',
      quantity,
      revenue,
      supplierCost,
      productionOverhead,
      grossProfit,
    }
  })

  const revenue = productBreakdown.reduce((sum, item) => sum + item.revenue, 0)
  const supplier = productBreakdown.reduce((sum, item) => sum + item.supplierCost, 0)
  const prodOverhead = productBreakdown.reduce((sum, item) => sum + item.productionOverhead, 0)
  const grossProfitBeforeExtras = revenue - supplier - prodOverhead
  const totalQuantity = productBreakdown.reduce((sum, item) => sum + item.quantity, 0)

  return { revenue, supplier, prodOverhead, grossProfitBeforeExtras, productBreakdown, totalQuantity }
}

const ensureResults = (raw: any, products: ProductInput[]): Results => {
  const WITHHOLDING_RATE = 0.02
  const derived = deriveFromProducts(products)
  const extrasTotal = toNumber(raw?.extrasTotal)
  const revenue = derived.revenue
  const supplier = derived.supplier
  const prodOverhead = derived.prodOverhead
  const withholdingTax = revenue > 0 ? revenue * WITHHOLDING_RATE : 0
  const netRevenue = Math.max(revenue - withholdingTax, 0)
  const productionCost = supplier + prodOverhead + extrasTotal
  const grossProfit = toNumber(raw?.grossProfit, netRevenue - productionCost)
  const marginPct = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0
  const totalQuantity = derived.totalQuantity
  const profitPerUnit = toNumber(raw?.profitPerUnit, totalQuantity > 0 ? grossProfit / totalQuantity : 0)
  const netRevenuePerUnit = totalQuantity > 0 ? netRevenue / totalQuantity : 0
  const requiredUnitPrice = toNumber(raw?.requiredUnitPrice)

  const rawBreakdown = Array.isArray(raw?.productBreakdown) ? raw.productBreakdown : []
  const productBreakdown =
    rawBreakdown.length > 0
      ? rawBreakdown.map((item: any) => ({
          productId: typeof item?.productId === 'string' ? item.productId : randomId(),
          name: typeof item?.name === 'string' ? item.name : 'Product',
          quantity: toNumber(item?.quantity),
          revenue: toNumber(item?.revenue),
          supplierCost: toNumber(item?.supplierCost),
          productionOverhead: toNumber(item?.productionOverhead),
          grossProfit: toNumber(item?.grossProfit),
        }))
      : derived.productBreakdown

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

export type Receipt = {
  id: string
  createdAt: string
  baseCurrency: Currency
  usdRate: number
  products: ProductInput[]
  extras: ExtraCost[]
  targetMarginPct?: number
  results: Results
  label?: string
}

const normaliseReceipt = (raw: any): Receipt | null => {
  if (!raw || typeof raw !== 'object') return null
  const baseCurrency: Currency = raw.baseCurrency === 'USD' ? 'USD' : 'NGN'

  const products: ProductInput[] =
    Array.isArray(raw.products) && raw.products.length > 0
      ? raw.products.map((p: any, index: number) => ensureProduct(p, raw.productName || `Product ${index + 1}`))
      : [
          ensureProduct(
            {
              id: raw.productId,
              name: raw.productName,
              quantity: raw.quantity,
              unitSellPrice: raw.unitSellPrice,
              unitSupplierCost: raw.unitSupplierCost,
              unitProductionOverhead: raw.unitProductionOverhead,
              markupPct: raw.markupPct,
            },
            raw.productName,
          ),
        ]

  const extras: ExtraCost[] = Array.isArray(raw.extras)
    ? raw.extras.map((extra: any) => ensureExtra(extra, baseCurrency))
    : []

  const receipt: Receipt = {
    id: typeof raw.id === 'string' ? raw.id : randomId(),
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    baseCurrency,
    usdRate: toNumber(raw.usdRate, 1),
    products,
    extras,
    targetMarginPct: toNumber(raw.targetMarginPct),
    results: ensureResults(raw.results, products),
    label: typeof raw.label === 'string' ? raw.label : (raw.productName || products[0]?.name || 'Untitled'),
  }

  return receipt
}

const writeReceipts = (records: Receipt[]) => {
  localStorage.setItem(RECEIPT_KEY, JSON.stringify(records))
}

export function loadReceipts(): Receipt[] {
  const read = (key: string | null) => {
    if (!key) return null
    try {
      const stored = localStorage.getItem(key)
      if (!stored) return null
      const parsed = JSON.parse(stored)
      return Array.isArray(parsed) ? parsed : null
    } catch {
      return null
    }
  }

  const current = read(RECEIPT_KEY)
  const legacy = current ?? read(LEGACY_RECEIPT_KEY)
  if (!legacy) return []

  const normalised = legacy
    .map((item) => normaliseReceipt(item))
    .filter((item): item is Receipt => Boolean(item))

  if (!current) {
    // migrate legacy data into new key
    writeReceipts(normalised)
  }

  return normalised
}

export function saveReceipt(receipt: Receipt) {
  const records = loadReceipts()
  records.unshift(receipt)
  writeReceipts(records)
}

export function deleteReceipt(id: string) {
  const next = loadReceipts().filter((item) => item.id !== id)
  writeReceipts(next)
}

export function clearReceipts() {
  localStorage.removeItem(RECEIPT_KEY)
  localStorage.removeItem(LEGACY_RECEIPT_KEY)
}

export function updateReceipt(updated: Receipt) {
  const records = loadReceipts()
  const idx = records.findIndex((item) => item.id === updated.id)
  if (idx >= 0) {
    records[idx] = updated
    writeReceipts(records)
  } else {
    records.unshift(updated)
    writeReceipts(records)
  }
}

export function setEditingReceiptId(id: string | null) {
  if (!id) localStorage.removeItem(EDIT_KEY)
  else localStorage.setItem(EDIT_KEY, id)
}
export function getEditingReceiptId(): string | null {
  return localStorage.getItem(EDIT_KEY)
}

export type InvoiceRecord = {
  id: string
  createdAt: string
  invoice: InvoiceData
  totals: {
    subtotal: number
    discount: number
    taxable: number
    tax: number
    shipping: number
    total: number
  }
  label?: string
  usdRate?: number
}

const normaliseInvoiceRecord = (raw: any): InvoiceRecord | null => {
  if (!raw || typeof raw !== 'object') return null
  const invoice = raw.invoice && typeof raw.invoice === 'object' ? raw.invoice : null
  if (!invoice) return null

  return {
    id: typeof raw.id === 'string' ? raw.id : randomId(),
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    invoice: invoice as InvoiceData,
    totals: {
      subtotal: toNumber(raw?.totals?.subtotal),
      discount: toNumber(raw?.totals?.discount),
      taxable: toNumber(raw?.totals?.taxable),
      tax: toNumber(raw?.totals?.tax),
      shipping: toNumber(raw?.totals?.shipping),
      total: toNumber(raw?.totals?.total),
    },
    label:
      typeof raw.label === 'string'
        ? raw.label
        : typeof invoice.invoiceNumber === 'string'
          ? invoice.invoiceNumber
          : 'Invoice',
    usdRate: toNumber(raw?.usdRate),
  }
}

const readInvoices = () => {
  try {
    const stored = localStorage.getItem(INVOICE_KEY)
    if (!stored) return []
    const parsed = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []
    return parsed.map((item) => normaliseInvoiceRecord(item)).filter((item): item is InvoiceRecord => Boolean(item))
  } catch {
    return []
  }
}

const writeInvoices = (records: InvoiceRecord[]) => {
  localStorage.setItem(INVOICE_KEY, JSON.stringify(records))
}

export function loadInvoices(): InvoiceRecord[] {
  return readInvoices()
}

export function saveInvoiceRecord(record: InvoiceRecord) {
  const records = loadInvoices()
  records.unshift(record)
  writeInvoices(records)
}

export function updateInvoiceRecord(record: InvoiceRecord) {
  const records = loadInvoices()
  const idx = records.findIndex((item) => item.id === record.id)
  if (idx >= 0) {
    records[idx] = record
  } else {
    records.unshift(record)
  }
  writeInvoices(records)
}

export function deleteInvoiceRecord(id: string) {
  const next = loadInvoices().filter((item) => item.id !== id)
  writeInvoices(next)
}

export function setEditingInvoiceId(id: string | null) {
  if (!id) localStorage.removeItem(INVOICE_EDIT_KEY)
  else localStorage.setItem(INVOICE_EDIT_KEY, id)
}

export function getEditingInvoiceId(): string | null {
  return localStorage.getItem(INVOICE_EDIT_KEY)
}
