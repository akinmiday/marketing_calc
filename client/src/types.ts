export type Currency = 'NGN' | 'USD'
export type Allocation = 'per-unit' | 'per-order'

export type ExtraCost = {
  id: string
  label: string
  // Kind = 'amount' or 'percent'
  kind: 'amount' | 'percent'
  // If amount, use amount + currency
  amount?: number
  currency?: Currency
  // If percent, value in %
  percent?: number
  // Allocation logic: per-unit uses unit selling price; per-order uses total revenue
  allocation: Allocation
}

export type ProductInput = {
  id: string
  name: string
  quantity: number
  unitSellPrice: number
  unitSupplierCost: number
  unitProductionOverhead: number
  markupPct: number
}

export type ProductResult = {
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
  productBreakdown: ProductResult[]
}

export type InvoiceParty = {
  name: string
  email?: string
  phone?: string
  address?: string
}

export type InvoiceItem = {
  id: string
  description: string
  quantity: number
  unitPrice: number
}

export type InvoiceData = {
  invoiceNumber: string
  issueDate: string
  dueDate: string
  currency: Currency
  from: InvoiceParty
  to: InvoiceParty
  notes?: string
  terms?: string
  discountPct?: number
  taxPct?: number
  shipping?: number
  items: InvoiceItem[]
}

export type CalcInput = {
  baseCurrency: Currency
  usdRate: number
  products: ProductInput[]
  extras: ExtraCost[]
  targetMarginPct: number
}

export type Receipt = {
  id: string
  createdAt: string
  updatedAt?: string
  baseCurrency: Currency
  usdRate: number
  products: ProductInput[]
  extras: ExtraCost[]
  targetMarginPct?: number
  results: Results
  label?: string
}

export type InvoiceTotals = {
  subtotal: number
  discount: number
  taxable: number
  tax: number
  shipping: number
  total: number
}

export type InvoiceRecord = {
  id: string
  createdAt: string
  updatedAt?: string
  invoice: InvoiceData
  totals: InvoiceTotals
  label?: string
  usdRate?: number
}

export type AuthUser = {
  id: string
  email: string
  createdAt: string
  updatedAt: string
}
