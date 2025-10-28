import type { AuthUser, CalcInput, InvoiceData, InvoiceRecord, InvoiceTotals, Receipt, Results } from '../types'

const DEFAULT_BASE = 'http://localhost:4000/api/v1'
const rawBase = (import.meta.env?.VITE_API_BASE_URL as string | undefined) || DEFAULT_BASE
const API_BASE_URL = rawBase.replace(/\/+$/, '')

type ReceiptApiResponse = {
  id: string
  createdAt: string
  updatedAt: string
  label?: string | null
  payload: {
    input: CalcInput
    results: Results
  }
}

type InvoiceApiResponse = {
  id: string
  createdAt: string
  updatedAt: string
  label?: string | null
  usdRate?: number | null
  payload: InvoiceData
  totals: InvoiceTotals
}

type RequestOptions = RequestInit & {
  parseJson?: boolean
}

let authToken: string | null = null

export function setAuthToken(token: string | null) {
  authToken = token
}

export function getAuthToken() {
  return authToken
}

async function request<T>(path: string, init: RequestOptions = {}): Promise<T> {
  const { parseJson = true, headers, ...rest } = init
  const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
  const baseHeaders: HeadersInit = {
    'Content-Type': 'application/json',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  }
  const response = await fetch(url, {
    credentials: 'include',
    headers: {
      ...baseHeaders,
      ...(headers || {}),
    },
    ...rest,
  })

  const contentLength = response.headers.get('content-length')
  const hasBody = response.status !== 204 && contentLength !== '0'
  const isJson = parseJson && response.headers.get('content-type')?.includes('application/json')

  let data: any = null
  if (hasBody) {
    if (isJson) {
      data = await response.json()
    } else if (parseJson) {
      const text = await response.text()
      data = text ? JSON.parse(text) : null
    }
  }

  if (!response.ok) {
    const message =
      (data && typeof data === 'object' && 'error' in data && typeof (data as any).error === 'string'
        ? (data as any).error
        : undefined) || response.statusText || 'Request failed'
    throw new Error(message)
  }

  return data as T
}

function normalizeReceipt(api: ReceiptApiResponse): Receipt {
  const input = api.payload?.input
  const results = api.payload?.results
  return {
    id: api.id,
    createdAt: api.createdAt,
    updatedAt: api.updatedAt,
    baseCurrency: input?.baseCurrency ?? 'NGN',
    usdRate: input?.usdRate ?? 1,
    products: Array.isArray(input?.products) ? input.products : [],
    extras: Array.isArray(input?.extras) ? input.extras : [],
    targetMarginPct: typeof input?.targetMarginPct === 'number' ? input.targetMarginPct : 0,
    results: results ?? {
      revenue: 0,
      netRevenue: 0,
      supplier: 0,
      prodOverhead: 0,
      extrasTotal: 0,
      withholdingTax: 0,
      grossProfit: 0,
      marginPct: 0,
      profitPerUnit: 0,
      netRevenuePerUnit: 0,
      requiredUnitPrice: 0,
      productBreakdown: [],
    },
    label: api.label ?? undefined,
  }
}

function normalizeInvoice(api: InvoiceApiResponse): InvoiceRecord {
  return {
    id: api.id,
    createdAt: api.createdAt,
    updatedAt: api.updatedAt,
    invoice: api.payload,
    totals: api.totals,
    label: api.label ?? undefined,
    usdRate: typeof api.usdRate === 'number' ? api.usdRate : undefined,
  }
}

export async function fetchReceipts(query?: string): Promise<Receipt[]> {
  const search = query ? `?q=${encodeURIComponent(query)}` : ''
  const res = await request<ReceiptApiResponse[]>(`/receipts${search}`)
  return res.map(normalizeReceipt)
}

export async function fetchReceipt(id: string): Promise<Receipt> {
  const res = await request<ReceiptApiResponse>(`/receipts/${id}`)
  return normalizeReceipt(res)
}

export async function createReceipt(payload: { input: CalcInput; label?: string }): Promise<Receipt> {
  const res = await request<ReceiptApiResponse>('/receipts', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return normalizeReceipt(res)
}

export async function updateReceipt(
  id: string,
  payload: { input?: CalcInput; label?: string },
): Promise<Receipt> {
  const res = await request<ReceiptApiResponse>(`/receipts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
  return normalizeReceipt(res)
}

export async function deleteReceipt(id: string): Promise<void> {
  await request<void>(`/receipts/${id}`, { method: 'DELETE', parseJson: false })
}

export async function fetchInvoices(query?: string): Promise<InvoiceRecord[]> {
  const search = query ? `?q=${encodeURIComponent(query)}` : ''
  const res = await request<InvoiceApiResponse[]>(`/invoices${search}`)
  return res.map(normalizeInvoice)
}

export async function fetchInvoice(id: string): Promise<InvoiceRecord> {
  const res = await request<InvoiceApiResponse>(`/invoices/${id}`)
  return normalizeInvoice(res)
}

export async function createInvoice(payload: {
  invoice: InvoiceData
  label?: string
  usdRate?: number
}): Promise<InvoiceRecord> {
  const res = await request<InvoiceApiResponse>('/invoices', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return normalizeInvoice(res)
}

export async function updateInvoice(
  id: string,
  payload: { invoice?: InvoiceData; label?: string; usdRate?: number },
): Promise<InvoiceRecord> {
  const res = await request<InvoiceApiResponse>(`/invoices/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
  return normalizeInvoice(res)
}

export async function deleteInvoice(id: string): Promise<void> {
  await request<void>(`/invoices/${id}`, { method: 'DELETE', parseJson: false })
}

type AuthResponse = {
  token: string
  user: AuthUser
}

type MeResponse = {
  user: AuthUser
}

export function register(payload: { email: string; password: string }): Promise<AuthResponse> {
  return request<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function login(payload: { email: string; password: string }): Promise<AuthResponse> {
  return request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function logout(): Promise<{ success: boolean }> {
  return request<{ success: boolean }>('/auth/logout', {
    method: 'POST',
  })
}

export function fetchCurrentUser(): Promise<MeResponse> {
  return request<MeResponse>('/auth/me')
}

export function changePassword(payload: { currentPassword: string; newPassword: string }): Promise<{ success: boolean }> {
  return request('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
