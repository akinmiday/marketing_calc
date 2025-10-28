import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Card from '../components/Card'
import Field from '../components/Field'
import NumberInput from '../components/NumberInput'
import { useCalc } from '../state/calc'
import { Currency, InvoiceData, InvoiceItem, InvoiceTotals, ProductInput, type Receipt } from '../types'
import MoneyValue from '../components/MoneyValue'
import { formatWithConversion, toBase } from '../utils/currency'
import {
  ArrowLeft,
  ClipboardCheck,
  Copy,
  Plus,
  Printer,
  Search,
  Save,
  Share2,
  Trash2,
  X,
} from 'lucide-react'
import { getEditingInvoiceId, setEditingInvoiceId } from '../utils/storage'
import { createInvoice, fetchReceipts, updateInvoice as updateInvoiceApi } from '../api'

type DraftInvoiceItem = {
  description: string
  quantity: number
  unitPrice: number
}

const id = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

const companyDefaults = {
  name: 'ChamsAccess Ltd',
  email: 'info@chamsaccess.com',
  phone: '+234 1 277 7000',
  address: '8, Louis Solomon Close\nVictoria Island, Lagos\nNigeria',
}

const sanitizeTitlePart = (value: string) =>
  value.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim()

const matchesCharacterSet = (value: string | null | undefined, rawQuery: string) => {
  const compressedQuery = rawQuery.replace(/\s+/g, '')
  if (!compressedQuery) return true
  if (!value) return false
  const haystack = value.toLowerCase()
  const uniqueChars = Array.from(new Set(Array.from(compressedQuery)))
  return uniqueChars.every((char) => haystack.includes(char))
}

const buildInvoiceDocumentTitle = (invoice: InvoiceData | null) => {
  if (!invoice) return ''
  const invoiceNumber = sanitizeTitlePart(invoice.invoiceNumber || '')
  const clientName = sanitizeTitlePart(invoice.to?.name || '')
  const firstItem = sanitizeTitlePart(invoice.items?.[0]?.description || '')
  const issueDate = sanitizeTitlePart(invoice.issueDate || '')
  const reference = invoiceNumber ? `Invoice ${invoiceNumber}` : 'Invoice'
  const parts = [reference]
  if (clientName) parts.push(clientName)
  if (firstItem) parts.push(firstItem)
  parts.push(issueDate || new Date().toISOString().split('T')[0])
  return parts.filter(Boolean).join(' - ')
}

const computeTotals = (invoice: InvoiceData): InvoiceTotals => {
  const subtotal = invoice.items.reduce((acc, item) => {
    const qty = Number.isFinite(item.quantity) ? Math.max(item.quantity, 0) : 0
    const price = Number.isFinite(item.unitPrice) ? Math.max(item.unitPrice, 0) : 0
    return acc + qty * price
  }, 0)

  const discountPct = Number.isFinite(invoice.discountPct) ? Math.max(invoice.discountPct || 0, 0) : 0
  const taxPct = Number.isFinite(invoice.taxPct) ? Math.max(invoice.taxPct || 0, 0) : 0
  const shipping = Number.isFinite(invoice.shipping) ? Math.max(invoice.shipping || 0, 0) : 0

  const discount = subtotal * (discountPct / 100)
  const taxable = Math.max(subtotal - discount, 0)
  const tax = taxable * (taxPct / 100)
  const total = taxable + tax + shipping

  return { subtotal, discount, taxable, tax, shipping, total }
}

const nextTwoWeeks = () => {
  const due = new Date()
  due.setDate(due.getDate() + 14)
  return due.toISOString().slice(0, 10)
}

const todayIso = () => new Date().toISOString().slice(0, 10)

const trimOrEmpty = (value: string | null | undefined) => (value ?? '').trim()

const decodePayload = (raw: string | null) => {
  if (!raw) return null
  const decoded = typeof atob === 'function' ? atob(raw) : ''
  const unpacked = decoded
    .split('')
    .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
    .join('')
  const json = decodeURIComponent(unpacked)
  return JSON.parse(json)
}

const decodeHistoryImport = (raw: string | null): { currency: Currency; items: Array<{ description: string; quantity: number; unitPrice: number }> } | null => {
  try {
    const parsed = decodePayload(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const currency: Currency = parsed.currency === 'USD' ? 'USD' : 'NGN'
    const items = Array.isArray(parsed.items)
      ? parsed.items.map((item: any, index: number) => ({
          description: typeof item?.description === 'string' ? item.description : `Imported item ${index + 1}`,
          quantity: Number.isFinite(item?.quantity) ? Math.max(item.quantity, 0) : 0,
          unitPrice: Number.isFinite(item?.unitPrice) ? Math.max(item.unitPrice, 0) : 0,
        }))
      : []
    return { currency, items }
  } catch {
    return null
  }
}

const encodeInvoice = (data: InvoiceData) => {
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

const decodeInvoice = (raw: string | null): InvoiceData | null => {
  if (!raw) return null
  try {
    const parsed = decodePayload(raw)
    return parsed as InvoiceData
  } catch {
    return null
  }
}

const makeInitialInvoice = (currency: Currency, products: ProductInput[]): InvoiceData => {
  const filtered = products.filter(
    (product) =>
      (product.quantity || 0) > 0 ||
      (product.unitSellPrice || 0) > 0 ||
      (product.name || '').trim().length > 0,
  )
  const items = (filtered.length > 0 ? filtered : products.slice(0, 1)).map((product, index) => ({
    id: id(),
    description: product.name || `Product ${index + 1}`,
    quantity: Math.max(product.quantity || 0, 1),
    unitPrice: Number.isFinite(product.unitSellPrice) && product.unitSellPrice > 0 ? Number(product.unitSellPrice.toFixed(2)) : 0,
  }))

  if (items.length === 0) {
    items.push({
      id: id(),
      description: 'Product or service',
      quantity: 1,
      unitPrice: 0,
    })
  }

  return {
    invoiceNumber: 'Pending assignment',
    issueDate: todayIso(),
    dueDate: nextTwoWeeks(),
    currency,
    from: {
      ...companyDefaults,
    },
    to: {
      name: '',
      email: '',
      phone: '',
      address: '',
    },
    notes: '',
    terms: '',
    discountPct: 0,
    taxPct: 0,
    shipping: 0,
    items,
  }
}

export default function InvoicePage() {
  const { state: calcState } = useCalc()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const shareToken = searchParams.get('share')
  const draftToken = searchParams.get('draft')
  const draftId = searchParams.get('draftId')
  const calcToken = searchParams.get('calc')
  const sharedInvoice = useMemo(() => decodeInvoice(shareToken), [shareToken])

  const processedDraftRef = useRef<string | null>(null)
  const processedCalcRef = useRef<string | null>(null)
  const originalTitleRef = useRef<string | null>(null)

  const [invoice, setInvoice] = useState<InvoiceData>(() =>
    makeInitialInvoice(calcState.baseCurrency, calcState.products),
  )
  const [shareStatus, setShareStatus] = useState<string | null>(null)
  const [importPrompt, setImportPrompt] = useState<{ items: DraftInvoiceItem[]; currency: Currency } | null>(null)
  const [historyModalOpen, setHistoryModalOpen] = useState(false)
  const [historyReceipts, setHistoryReceipts] = useState<Receipt[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const fallbackShareLink = shareStatus && shareStatus.startsWith('Share link: ')
    ? shareStatus.replace('Share link: ', '')
    : null
  const formatInvoiceAmount = (value: number) => formatWithConversion(invoice.currency, value, calcState.usdRate)

  const applyImportedItems = (strategy: 'append' | 'replace', payload: { items: DraftInvoiceItem[]; currency: Currency }) => {
    setInvoice((prev) => {
      const startIndex = prev.items.length
      const mapped = payload.items.map((item, index) => {
        const normalizedQuantity = Math.max(item.quantity, 1)
        const normalizedPrice = Number.isFinite(item.unitPrice) ? Math.max(item.unitPrice, 0) : 0
        return {
          id: id(),
          description: item.description || `Item ${startIndex + index + 1}`,
          quantity: normalizedQuantity,
          unitPrice: Number(normalizedPrice.toFixed(2)),
        }
      })

      if (strategy === 'append') {
        return {
          ...prev,
          currency: payload.currency || prev.currency,
          items: [...prev.items, ...mapped],
        }
      }

      const fresh = makeInitialInvoice(payload.currency || prev.currency, [])
      const preservedClientName = (prev.to.name || '').trim()
      return {
        ...fresh,
        from: { ...prev.from },
        to: {
          ...fresh.to,
          name: preservedClientName || fresh.to.name,
        },
        items: mapped,
        discountPct: 0,
        taxPct: 0,
        shipping: 0,
        notes: '',
        terms: '',
      }
    })
  }

  const addBlankInvoiceItem = () => {
    setInvoice((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          id: id(),
          description: '',
          quantity: 1,
          unitPrice: 0,
        },
      ],
    }))
  }

  const handleAddProductFromHistory = (receipt: Receipt, product: ProductInput) => {
    setInvoice((prev) => {
      const targetCurrency: Currency = prev.items.length === 0 ? receipt.baseCurrency : prev.currency
      const rawPrice = Number.isFinite(product.unitSellPrice) ? Math.max(product.unitSellPrice || 0, 0) : 0
      const convertedPrice =
        targetCurrency === receipt.baseCurrency
          ? rawPrice
          : toBase(rawPrice, receipt.baseCurrency, targetCurrency, receipt.usdRate)
      const description = (product.name || '').trim() || receipt.label || `Item ${prev.items.length + 1}`
      const quantity = Math.max(product.quantity || 0, 1)
      return {
        ...prev,
        currency: targetCurrency,
        items: [
          ...prev.items,
          {
            id: id(),
            description,
            quantity,
            unitPrice: Number(Math.max(convertedPrice, 0).toFixed(2)),
          },
        ],
      }
    })
  }

  const handleAddAllProductsFromHistory = (receipt: Receipt) => {
    const validProducts = receipt.products.filter(
      (product) =>
        Math.max(product.quantity || 0, 0) > 0 || Math.max(product.unitSellPrice || 0, 0) > 0 || (product.name || '').trim(),
    )
    if (validProducts.length === 0) return
    setInvoice((prev) => {
      const targetCurrency: Currency = prev.items.length === 0 ? receipt.baseCurrency : prev.currency
      const appended = validProducts.map((product, index) => {
        const rawPrice = Number.isFinite(product.unitSellPrice) ? Math.max(product.unitSellPrice || 0, 0) : 0
        const convertedPrice =
          targetCurrency === receipt.baseCurrency
            ? rawPrice
            : toBase(rawPrice, receipt.baseCurrency, targetCurrency, receipt.usdRate)
        const description = (product.name || '').trim() || `${receipt.label || 'Item'} ${index + 1}`
        const quantity = Math.max(product.quantity || 0, 1)
        return {
          id: id(),
          description,
          quantity,
          unitPrice: Number(Math.max(convertedPrice, 0).toFixed(2)),
        }
      })
      return {
        ...prev,
        currency: targetCurrency,
        items: [...prev.items, ...appended],
      }
    })
  }

  const handleImportDecision = (strategy: 'append' | 'replace') => {
    if (!importPrompt) return
    applyImportedItems(strategy, importPrompt)
    setImportPrompt(null)
  }

  const handleCancelImport = () => {
    setImportPrompt(null)
  }

  const openHistoryPicker = () => {
    setHistoryError(null)
    setHistoryModalOpen(true)
  }

  useEffect(() => {
    if (!historyModalOpen) return
    if (typeof window === 'undefined') return
    let cancelled = false

    const loadHistory = async () => {
      setHistoryLoading(true)
      setHistoryError(null)
      try {
        const records = await fetchReceipts()
        if (!cancelled) {
          setHistoryReceipts(records)
        }
      } catch (err) {
        if (!cancelled) {
          console.error(err)
          setHistoryError(err instanceof Error ? err.message : 'Unable to load saved history.')
        }
      } finally {
        if (!cancelled) {
          setHistoryLoading(false)
        }
      }
    }

    void loadHistory()
    return () => {
      cancelled = true
    }
  }, [historyModalOpen])

  useEffect(() => {
    if (shareToken || draftToken || calcToken) return
    setInvoice((prev) => {
      if (prev.currency === calcState.baseCurrency) return prev
      return { ...prev, currency: calcState.baseCurrency }
    })
  }, [calcState.baseCurrency, shareToken, draftToken, calcToken])

  useEffect(() => {
    if (!draftToken || processedDraftRef.current === draftToken) return
    const decoded = decodeInvoice(draftToken)
    if (!decoded) return
    processedDraftRef.current = draftToken
    setInvoice(decoded)
    if (draftId) {
      setEditingInvoiceId(draftId)
    }
  }, [draftToken, draftId])

  useEffect(() => {
    if (!calcToken || processedCalcRef.current === calcToken) return
    const payload = decodeHistoryImport(calcToken)
    if (!payload || payload.items.length === 0) {
      setShareStatus('Unable to import selected items into the invoice.')
      return
    }
    processedCalcRef.current = calcToken
    setEditingInvoiceId(null)
    setShareStatus(null)

    const importedItems: DraftInvoiceItem[] = payload.items.map((item, index) => {
      const numericQuantity = Number.isFinite(item.quantity) ? Math.max(item.quantity || 0, 0) : 0
      const numericPrice = Number.isFinite(item.unitPrice) ? Math.max(item.unitPrice || 0, 0) : 0
      return {
        description: item.description || `Imported item ${index + 1}`,
        quantity: Math.max(numericQuantity, 1),
        unitPrice: Number(numericPrice.toFixed(2)),
      }
    })

    const hasExistingContent =
      invoice.items.some(
        (item) =>
          (item.description || '').trim().length > 0 ||
          Math.max(item.quantity || 0, 0) > 0 ||
          Math.max(item.unitPrice || 0, 0) > 0,
      ) ||
      ((invoice.notes || '').trim().length > 0 ||
        (invoice.terms || '').trim().length > 0 ||
        Number(invoice.discountPct || 0) > 0 ||
        Number(invoice.taxPct || 0) > 0 ||
        Number(invoice.shipping || 0) > 0)

    const targetCurrency = payload.currency || invoice.currency

    if (hasExistingContent) {
      setImportPrompt({ items: importedItems, currency: targetCurrency })
    } else {
      applyImportedItems('replace', { items: importedItems, currency: targetCurrency })
    }
  }, [calcToken, invoice])
  const totals = useMemo(() => computeTotals(invoice), [invoice])

  const handlePartyChange = (party: 'from' | 'to', key: keyof InvoiceData['from'], value: string) => {
    setInvoice((prev) => ({
      ...prev,
      [party]: {
        ...prev[party],
        [key]: value,
      },
    }))
  }

  const handleItemChange = (itemId: string, patch: Partial<InvoiceItem>) => {
    setInvoice((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === itemId ? { ...item, ...patch } : item,
      ),
    }))
  }

  const removeItem = (itemId: string) => {
    setInvoice((prev) => ({
      ...prev,
      items: prev.items.length === 1 ? prev.items : prev.items.filter((item) => item.id !== itemId),
    }))
  }

  const updateInvoice = <K extends keyof InvoiceData>(key: K, value: InvoiceData[K]) => {
    setInvoice((prev) => ({
      ...prev,
      [key]: value,
    }))
  }

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print()
    }
  }

  const handleShare = async () => {
    if (typeof window === 'undefined') return
    const payload = encodeInvoice(invoice)
    if (!payload) {
      setShareStatus('Unable to encode invoice.')
      return
    }
    const url = `${window.location.origin}/invoice?share=${payload}`
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Invoice ${invoice.invoiceNumber}`,
          text: `Invoice from ${invoice.from.name || 'ChamsAccess Ltd'}`,
          url,
        })
        setShareStatus('Share sheet opened.')
        return
      } catch (err) {
        // swallow and fall back to copy/copy status
        console.warn('Navigator share failed', err)
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setShareStatus('Share link copied to clipboard.')
    } catch {
      setShareStatus(`Share link: ${url}`)
    }
  }

  const handleSaveInvoice = async (asNew?: boolean) => {
    if (isSaving) return
    const cleanedItems = invoice.items.map((item, index) => {
      const quantity = Number.isFinite(item.quantity) ? Math.max(item.quantity, 0) : 0
      const unitPrice = Number.isFinite(item.unitPrice) ? Math.max(item.unitPrice, 0) : 0
      return {
        id: item.id || id(),
        description: (item.description || '').trim() || `Item ${index + 1}`,
        quantity,
        unitPrice: Number(unitPrice.toFixed(2)),
      }
    })

    const issueDate = trimOrEmpty(invoice.issueDate) || todayIso()
    const dueDate = trimOrEmpty(invoice.dueDate) || nextTwoWeeks()
    const sanitizedInvoice: InvoiceData = {
      ...invoice,
      invoiceNumber: trimOrEmpty(invoice.invoiceNumber) || 'Pending assignment',
      issueDate,
      dueDate,
      currency: invoice.currency,
      notes: trimOrEmpty(invoice.notes),
      terms: trimOrEmpty(invoice.terms),
      from: {
        ...invoice.from,
        name: trimOrEmpty(invoice.from.name) || companyDefaults.name,
        email: trimOrEmpty(invoice.from.email),
        phone: trimOrEmpty(invoice.from.phone),
        address: trimOrEmpty(invoice.from.address),
      },
      to: {
        ...invoice.to,
        name: trimOrEmpty(invoice.to.name),
        email: trimOrEmpty(invoice.to.email),
        phone: trimOrEmpty(invoice.to.phone),
        address: trimOrEmpty(invoice.to.address),
      },
      items: cleanedItems,
    }
    setIsSaving(true)
    try {
      const existingId = getEditingInvoiceId()
      const label =
        sanitizedInvoice.invoiceNumber ||
        sanitizedInvoice.to.name ||
        sanitizedInvoice.from.name ||
        'Invoice'
      const usdRate = calcState.usdRate
      if (existingId && !asNew) {
        const updated = await updateInvoiceApi(existingId, { invoice: sanitizedInvoice, label, usdRate })
        setInvoice(updated.invoice)
        setEditingInvoiceId(updated.id)
        alert('Updated invoice in history.')
      } else {
        const created = await createInvoice({ invoice: sanitizedInvoice, label, usdRate })
        setInvoice(created.invoice)
        setEditingInvoiceId(created.id)
        alert('Saved invoice to history.')
      }
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : 'Unable to save invoice.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleManualCopy = async (link: string) => {
    if (!link) return
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(link)
        setShareStatus('Share link copied to clipboard.')
        return
      } catch {
        // fall back to leaving the link visible
      }
    }
    setShareStatus(`Share link: ${link}`)
  }

  useEffect(() => {
    if (!shareStatus || shareStatus === '' || (shareStatus.startsWith('Share link: ') && shareStatus.length > 0)) return
    const timer = setTimeout(() => setShareStatus(null), 4000)
    return () => clearTimeout(timer)
  }, [shareStatus])

  useEffect(() => {
    if (typeof document === 'undefined') return
    if (!originalTitleRef.current) {
      originalTitleRef.current = document.title
    }
    if (shareToken && !sharedInvoice) {
      document.title = 'Invoice unavailable'
      return
    }
    const activeInvoice = shareToken && sharedInvoice ? sharedInvoice : invoice
    const customTitle = buildInvoiceDocumentTitle(activeInvoice)
    if (customTitle) {
      document.title = customTitle
      return
    }
    if (originalTitleRef.current) {
      document.title = originalTitleRef.current
    }
  }, [invoice, shareToken, sharedInvoice])

  useEffect(() => {
    return () => {
      if (typeof document === 'undefined') return
      if (originalTitleRef.current) {
        document.title = originalTitleRef.current
      }
    }
  }, [])

  if (shareToken) {
    if (!sharedInvoice) {
      return (
        <div className="mx-auto max-w-4xl p-4 md:p-6 space-y-4">
          <div className="no-print rounded-xl border bg-red-50 px-4 py-3 text-sm text-red-700">
            The shared invoice link is invalid or has expired.
          </div>
          <button
            className="no-print inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-medium shadow-soft hover:bg-slate-50"
            onClick={() => navigate('/invoice')}
          >
            <ArrowLeft className="h-4 w-4" /> Go to invoice generator
          </button>
        </div>
      )
    }
    const sharedTotals = computeTotals(sharedInvoice)
    return (
      <div className="mx-auto max-w-4xl p-4 md:p-6 space-y-4">
        <div className="no-print flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <button
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-medium shadow-soft hover:bg-slate-50 sm:w-auto"
            onClick={() => navigate('/invoice')}
          >
            <ArrowLeft className="h-4 w-4" /> Create your own invoice
          </button>
          <button
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-soft hover:bg-emerald-700 sm:w-auto"
            onClick={handlePrint}
          >
            <Printer className="h-4 w-4" /> Print / Save PDF
          </button>
        </div>
        <InvoicePreview invoice={sharedInvoice} totals={sharedTotals} usdRate={calcState.usdRate} />
      </div>
    )
  }

  return (
    <>
      <div className="mx-auto max-w-6xl p-4 md:p-6 space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="space-y-6 no-print">
          <Card
            title="Invoice details"
            subtitle="Fill in your business and client information, then list the billable items."
          >
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Invoice number">
                <div className="flex flex-col gap-1 rounded-lg border bg-slate-50 px-3 py-2 text-sm">
                  <span className="font-mono text-slate-800">
                    {invoice.invoiceNumber && invoice.invoiceNumber.trim().length > 0
                      ? invoice.invoiceNumber
                      : 'Pending assignment'}
                  </span>
                  <span className="text-xs text-slate-500">
                    Assigned automatically from your latest invoice when you save.
                  </span>
                </div>
              </Field>
              <Field label="Currency">
                <select
                  className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-600/30"
                  value={invoice.currency}
                  onChange={(e) => updateInvoice('currency', e.target.value as Currency)}
                >
                  <option value="NGN">NGN</option>
                  <option value="USD">USD</option>
                </select>
              </Field>
              <Field label="Issue date">
                <input
                  type="date"
                  className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-600/30"
                  value={invoice.issueDate}
                  onChange={(e) => updateInvoice('issueDate', e.target.value)}
                />
              </Field>
              <Field label="Due date">
                <input
                  type="date"
                  className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-600/30"
                  value={invoice.dueDate}
                  onChange={(e) => updateInvoice('dueDate', e.target.value)}
                />
              </Field>
            </div>
          </Card>

          <Card
            title="Business info"
            subtitle="This will appear at the top of the invoice and in shared links."
          >
            <div className="grid gap-4 md:grid-cols-2">
              {[
                { label: 'Company / sender name', value: invoice.from.name ?? '' },
                { label: 'Email', value: invoice.from.email ?? '' },
                { label: 'Phone', value: invoice.from.phone ?? '' },
                { label: 'Address', value: invoice.from.address ?? '', multiline: true },
              ].map((info) => {
                const content = `${info.value}`.trim()
                return (
                  <div key={info.label} className="rounded-xl border bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">{info.label}</div>
                    <div className={`mt-2 text-sm text-slate-700 ${info.multiline ? 'whitespace-pre-wrap' : ''}`}>
                      {content.length > 0 ? content : '—'}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>

          <Card title="Bill to">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Client name">
                <input
                  className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-600/30"
                  value={invoice.to.name}
                  onChange={(e) => handlePartyChange('to', 'name', e.target.value)}
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-600/30"
                  value={invoice.to.email ?? ''}
                  onChange={(e) => handlePartyChange('to', 'email', e.target.value)}
                />
              </Field>
              <Field label="Phone">
                <input
                  className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-600/30"
                  value={invoice.to.phone ?? ''}
                  onChange={(e) => handlePartyChange('to', 'phone', e.target.value)}
                />
              </Field>
              <Field label="Address">
                <textarea
                  className="min-h-[90px] w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-600/30"
                  value={invoice.to.address ?? ''}
                  onChange={(e) => handlePartyChange('to', 'address', e.target.value)}
                />
              </Field>
            </div>
          </Card>

          <Card
            title="Line items"
            actions={
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <button
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border bg-white px-3 py-1.5 text-sm font-medium shadow-soft hover:bg-slate-50 sm:w-auto"
                  onClick={addBlankInvoiceItem}
                  type="button"
                >
                  <Plus className="h-4 w-4" /> Add blank item
                </button>
                <button
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border bg-white px-3 py-1.5 text-sm font-medium shadow-soft hover:bg-slate-50 sm:w-auto"
                  onClick={openHistoryPicker}
                  type="button"
                >
                  <Plus className="h-4 w-4" /> Add from history
                </button>
              </div>
            }
            bodyClassName="space-y-4"
          >
            {invoice.items.map((item) => (
              <div key={item.id} className="rounded-xl border px-4 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <Field label="Description">
                    <textarea
                      className="min-h-[70px] w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-600/30"
                      value={item.description}
                      onChange={(e) => handleItemChange(item.id, { description: e.target.value })}
                    />
                  </Field>
                  <button
                    className="inline-flex h-10 items-center justify-center self-end rounded-lg border bg-white px-3 text-sm text-slate-500 hover:text-red-600 sm:self-start"
                    onClick={() => removeItem(item.id)}
                    type="button"
                    aria-label="Remove line item"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <Field label="Quantity">
                    <NumberInput
                      value={item.quantity}
                      onChange={(v) => handleItemChange(item.id, { quantity: v })}
                      min={0}
                      step={1}
                      integer
                      emptyWhenZero={false}
                    />
                  </Field>
                  <Field label={`Unit price (${invoice.currency})`}>
                    <NumberInput
                      value={item.unitPrice}
                      onChange={(v) => handleItemChange(item.id, { unitPrice: v })}
                      min={0}
                      maxFractionDigits={2}
                      emptyWhenZero={false}
                    />
                  </Field>
                  <Field label="Line total">
                    <div className="flex min-h-[2.5rem] items-center justify-end rounded-lg border bg-slate-100 px-3 py-2">
                      <MoneyValue
                        currency={invoice.currency}
                        amount={item.quantity * item.unitPrice}
                        usdRate={calcState.usdRate}
                        align="end"
                        primaryClassName="font-medium text-slate-700"
                        secondaryClassName="text-[11px] text-slate-500"
                      />
                    </div>
                  </Field>
                </div>
              </div>
            ))}
          </Card>

          <Card title="Adjustments & notes">
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Discount (%)">
                <NumberInput
                  value={invoice.discountPct ?? 0}
                  onChange={(v) => updateInvoice('discountPct', v)}
                  min={0}
                  maxFractionDigits={2}
                  emptyWhenZero={false}
                />
              </Field>
              <Field label="Tax rate (%)">
                <NumberInput
                  value={invoice.taxPct ?? 0}
                  onChange={(v) => updateInvoice('taxPct', v)}
                  min={0}
                  maxFractionDigits={2}
                  emptyWhenZero={false}
                />
              </Field>
              <Field label={`Shipping (${invoice.currency})`}>
                <NumberInput
                  value={invoice.shipping ?? 0}
                  onChange={(v) => updateInvoice('shipping', v)}
                  min={0}
                  maxFractionDigits={2}
                  emptyWhenZero={false}
                />
              </Field>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="Notes (visible to client)">
                <textarea
                  className="min-h-[110px] w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-600/30"
                  value={invoice.notes ?? ''}
                  onChange={(e) => updateInvoice('notes', e.target.value)}
                />
              </Field>
              <Field label="Payment terms">
                <textarea
                  className="min-h-[110px] w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-600/30"
                  value={invoice.terms ?? ''}
                  onChange={(e) => updateInvoice('terms', e.target.value)}
                />
              </Field>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <InvoicePreview invoice={invoice} totals={totals} usdRate={calcState.usdRate} />

          <div className="no-print flex flex-col gap-2 rounded-2xl border bg-white px-4 py-3 shadow-soft sm:flex-row sm:flex-wrap sm:items-center">
            <button
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-soft hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              onClick={() => {
                void handleSaveInvoice(false)
              }}
              disabled={isSaving}
            >
              <Save className="h-4 w-4" /> Save invoice
            </button>
            <button
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-medium shadow-soft hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              onClick={() => {
                void handleSaveInvoice(true)
              }}
              disabled={isSaving}
            >
              <Save className="h-4 w-4" /> Save as new
            </button>
            <button
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-medium shadow-soft hover:bg-slate-50 sm:w-auto"
              onClick={handlePrint}
            >
              <Printer className="h-4 w-4" /> Print / Save PDF
            </button>
            <button
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-medium shadow-soft hover:bg-slate-50 sm:w-auto"
              onClick={handleShare}
            >
              <Share2 className="h-4 w-4" /> Copy share link
            </button>
            {shareStatus && (
              <div className="inline-flex w-full flex-col items-center gap-2 rounded-lg bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 sm:flex-row sm:flex-wrap">
                {shareStatus === 'Share link copied to clipboard.' && (
                  <>
                    <ClipboardCheck className="h-4 w-4" /> {shareStatus}
                  </>
                )}
                {shareStatus === 'Share sheet opened.' && (
                  <>
                    <Share2 className="h-4 w-4" /> Share sheet opened
                  </>
                )}
                {fallbackShareLink && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 text-emerald-700 underline-offset-2 hover:underline"
                    onClick={() => handleManualCopy(fallbackShareLink)}
                    title={fallbackShareLink}
                  >
                    <Copy className="h-4 w-4" /> Copy share link
                  </button>
                )}
                {shareStatus === 'Unable to encode invoice.' && !fallbackShareLink && (
                  <>
                    <Copy className="h-4 w-4" /> Unable to encode invoice. Please review required fields.
                  </>
                )}
              </div>
            )}
          </div>

          <div className="no-print rounded-2xl border bg-slate-50 px-4 py-3 text-sm text-slate-600">
            The print action opens your browser&apos;s dialog so you can save or export the invoice as PDF without exposing internal revenue or margin details.
          </div>
        </div>
      </div>
    </div>
      <ImportDecisionModal
        open={importPrompt !== null}
        itemCount={importPrompt?.items.length ?? 0}
        onAppend={() => handleImportDecision('append')}
        onReplace={() => handleImportDecision('replace')}
        onCancel={handleCancelImport}
      />
      <HistoryPickerModal
        open={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        receipts={historyReceipts}
        loading={historyLoading}
        error={historyError}
        onAddProduct={handleAddProductFromHistory}
        onAddAll={handleAddAllProductsFromHistory}
        invoiceCurrency={invoice.currency}
      />
    </>
  )
}

type ModalShellProps = {
  open: boolean
  onClose: () => void
  labelledBy: string
  children: ReactNode
}

function ModalShell({ open, onClose, labelledBy, children }: ModalShellProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4 py-6">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        {children}
      </div>
    </div>
  )
}

type ImportDecisionModalProps = {
  open: boolean
  itemCount: number
  onAppend: () => void
  onReplace: () => void
  onCancel: () => void
}

function ImportDecisionModal({ open, itemCount, onAppend, onReplace, onCancel }: ImportDecisionModalProps) {
  if (!open) return null
  return (
    <ModalShell open={open} onClose={onCancel} labelledBy="import-decision-title">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <h2 id="import-decision-title" className="text-lg font-semibold text-slate-900">
          Bring calculator items into this invoice?
        </h2>
        <button
          type="button"
          className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          onClick={onCancel}
          aria-label="Close import decision"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="space-y-3 px-6 py-5 text-sm text-slate-600">
        <p>
          We found {itemCount} item{itemCount === 1 ? '' : 's'} from your calculator selection. Choose how you&apos;d like to
          bring them into this invoice.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>
            <span className="font-semibold text-slate-800">Add to current invoice</span> keeps everything you already have and
            appends the new items.
          </li>
          <li>
            <span className="font-semibold text-slate-800">Replace existing invoice</span> starts a clean draft using only the
            imported items.
          </li>
        </ul>
      </div>
      <div className="flex flex-col gap-2 border-t bg-slate-50 px-6 py-4 sm:flex-row sm:justify-end">
        <button
          type="button"
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 sm:w-auto"
          onClick={onAppend}
        >
          Add to current invoice
        </button>
        <button
          type="button"
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-soft hover:bg-emerald-700 sm:w-auto"
          onClick={onReplace}
        >
          Replace existing invoice
        </button>
        <button
          type="button"
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 sm:w-auto"
          onClick={onCancel}
        >
          Cancel import
        </button>
      </div>
    </ModalShell>
  )
}

type HistoryPickerModalProps = {
  open: boolean
  onClose: () => void
  receipts: Receipt[]
  loading: boolean
  error: string | null
  onAddProduct: (receipt: Receipt, product: ProductInput) => void
  onAddAll: (receipt: Receipt) => void
  invoiceCurrency: Currency
}

function HistoryPickerModal({
  open,
  onClose,
  receipts,
  loading,
  error,
  onAddProduct,
  onAddAll,
  invoiceCurrency,
}: HistoryPickerModalProps) {
  const [searchTerm, setSearchTerm] = useState('')
  useEffect(() => {
    if (open) {
      setSearchTerm('')
    }
  }, [open])

  const normalizedQuery = searchTerm.trim().toLowerCase()
  const compressedQuery = normalizedQuery.replace(/\s+/g, '')
  const filteredReceipts = useMemo(() => {
    if (!compressedQuery) {
      return receipts.map((receipt) => ({
        receipt,
        products: receipt.products,
        matchesMeta: true,
      }))
    }
    return receipts.reduce<Array<{ receipt: Receipt; products: Receipt['products']; matchesMeta: boolean }>>(
      (acc, receipt) => {
        const matchesMeta =
          matchesCharacterSet(receipt.label || '', compressedQuery) ||
          matchesCharacterSet(receipt.baseCurrency, compressedQuery) ||
          matchesCharacterSet(new Date(receipt.createdAt).toLocaleString(), compressedQuery)
        const productMatches = receipt.products.filter((product) =>
          matchesCharacterSet(product.name || '', compressedQuery),
        )
        if (!matchesMeta && productMatches.length === 0) {
          return acc
        }
        acc.push({
          receipt,
          products: matchesMeta ? receipt.products : productMatches,
          matchesMeta,
        })
        return acc
      },
      [],
    )
  }, [receipts, compressedQuery])

  if (!open) return null
  return (
    <ModalShell open={open} onClose={onClose} labelledBy="history-picker-title">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h2 id="history-picker-title" className="text-lg font-semibold text-slate-900">
            Add items from saved history
          </h2>
          <p className="text-sm text-slate-500">
            Tap <span className="font-medium text-slate-700">Add</span> to bring a product into the invoice. You can add the
            same product multiple times.
          </p>
        </div>
        <button
          type="button"
          className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          onClick={onClose}
          aria-label="Close history picker"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="mb-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-700 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search saved history"
              aria-label="Search saved history"
            />
          </div>
        </div>
        {loading && (
          <div className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-slate-500">
            Loading saved history...
          </div>
        )}
        {!loading && error && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-6 text-center text-sm text-amber-700">
            {error}
          </div>
        )}
        {!loading && !error && receipts.length === 0 && (
          <div className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-slate-500">
            No calculations saved yet. Use the calculator to capture products, then save to history.
          </div>
        )}
        {!loading && !error && receipts.length > 0 && filteredReceipts.length === 0 && (
          <div className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-slate-500">
            No saved history matches your search.
          </div>
        )}
        {!loading && !error && filteredReceipts.length > 0 && (
          <div className="space-y-4">
            {filteredReceipts.map(({ receipt, products, matchesMeta }) => {
              const showMatchingOnly = !matchesMeta && compressedQuery.length > 0
              return (
                <div key={receipt.id} className="rounded-2xl border px-4 py-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-base font-semibold text-slate-900">
                        {receipt.label || receipt.products[0]?.name || 'Untitled calculation'}
                      </div>
                      <div className="text-xs text-slate-500">
                        {new Date(receipt.createdAt).toLocaleString()} • Base currency {receipt.baseCurrency}
                      </div>
                      {showMatchingOnly && (
                        <div className="text-xs font-semibold text-emerald-600">Showing matching items</div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                        onClick={() => {
                          if (showMatchingOnly) {
                            products.forEach((product) => onAddProduct(receipt, product))
                            return
                          }
                          onAddAll(receipt)
                        }}
                      >
                        <Plus className="h-4 w-4" /> {showMatchingOnly ? 'Add matching items' : 'Add all items'}
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 space-y-3">
                    {products.map((product) => {
                      const price = Number.isFinite(product.unitSellPrice) ? product.unitSellPrice || 0 : 0
                      const quantity = Math.max(product.quantity || 0, 0)
                      return (
                        <div
                          key={product.id}
                        className="rounded-xl border px-3 py-3 text-sm text-slate-700 sm:flex sm:items-center sm:justify-between"
                      >
                        <div className="space-y-1">
                          <div className="font-medium text-slate-900">{product.name || 'Untitled product'}</div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span>Qty: {quantity || '—'}</span>
                            <span>
                              Price:{' '}
                              <MoneyValue
                                currency={receipt.baseCurrency}
                                amount={price}
                                usdRate={receipt.usdRate}
                                align="start"
                                primaryClassName="text-xs font-semibold text-slate-700"
                                secondaryClassName="text-[10px] text-slate-500"
                              />
                            </span>
                          </div>
                        </div>
                        <div className="mt-3 flex gap-2 sm:mt-0">
                          <button
                            type="button"
                            className="inline-flex w-full items-center justify-center gap-1 rounded-lg border bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 sm:w-auto"
                            onClick={() => onAddProduct(receipt, product)}
                          >
                            <Plus className="h-4 w-4" /> Add item
                          </button>
                        </div>
                      </div>
                    )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 border-t bg-slate-50 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-slate-500">
          Items adopt the invoice currency ({invoiceCurrency}) automatically when added.
        </div>
        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 rounded-lg border bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-soft hover:bg-emerald-700"
          onClick={onClose}
        >
          Done adding items
        </button>
      </div>
    </ModalShell>
  )
}

type InvoicePreviewProps = {
  invoice: InvoiceData
  totals: InvoiceTotals
  usdRate: number
}

const InvoicePreview = ({ invoice, totals, usdRate }: InvoicePreviewProps) => {
  const amountNode = (
    value: number,
    align: 'start' | 'end' = 'end',
    primaryClassName?: string,
    secondaryClassName?: string,
  ) => (
    <MoneyValue
      currency={invoice.currency}
      amount={value}
      usdRate={usdRate}
      align={align}
      primaryClassName={primaryClassName}
      secondaryClassName={secondaryClassName}
    />
  )
  const companyName = invoice.from.name || companyDefaults.name
  const companyEmail = invoice.from.email || companyDefaults.email
  const companyPhone = invoice.from.phone || companyDefaults.phone
  const companyAddress = invoice.from.address || companyDefaults.address

  return (
    <div className="print-area overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-soft">
      <header className="bg-gradient-to-r from-emerald-700 via-emerald-600 to-emerald-500 px-4 py-6 text-white sm:px-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/20 text-lg font-semibold">CA</div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{companyName}</h1>
              <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.32em] text-white/70">
                Identity | Payments | Access
              </div>
              <div className="mt-3 space-y-1 text-sm text-white/85">
                {companyEmail && <div>{companyEmail}</div>}
                {companyPhone && <div>{companyPhone}</div>}
                {companyAddress && <div className="whitespace-pre-wrap">{companyAddress}</div>}
              </div>
            </div>
          </div>
          <div className="rounded-2xl bg-white/15 px-5 py-4 text-right text-sm shadow-sm shadow-emerald-900/20">
            <div className="text-[11px] uppercase tracking-[0.2em] text-white/70">Invoice</div>
            <div className="mt-2 leading-tight">
              {amountNode(totals.total, 'end', 'text-3xl font-semibold text-white', 'text-xs text-white/80')}
            </div>
            <div className="mt-2 text-xs font-medium text-white/80">Invoice #{invoice.invoiceNumber || '—'}</div>
            <div className="mt-1 text-xs text-white/70">Due {invoice.dueDate || '—'}</div>
          </div>
        </div>
      </header>

      <div className="space-y-6 px-4 pb-6 pt-5 sm:px-6">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-5 py-4 text-sm text-emerald-900">
            <div className="text-xs font-semibold uppercase tracking-widest text-emerald-700">Bill to</div>
            <div className="mt-3 space-y-1">
              <div className="text-lg font-semibold text-emerald-900">{invoice.to.name || '—'}</div>
              {invoice.to.email && <div>{invoice.to.email}</div>}
              {invoice.to.phone && <div>{invoice.to.phone}</div>}
              {invoice.to.address && <div className="mt-1 whitespace-pre-wrap">{invoice.to.address}</div>}
            </div>
          </div>
          <div className="rounded-2xl border bg-slate-50 px-5 py-4 text-sm text-slate-700">
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">Invoice details</div>
            <dl className="mt-3 space-y-2">
              <div className="flex items-center justify-between">
                <dt>Issue date</dt>
                <dd className="font-medium text-slate-900">{invoice.issueDate || '—'}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt>Due date</dt>
                <dd className="font-medium text-slate-900">{invoice.dueDate || '—'}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt>Currency</dt>
                <dd className="font-medium text-slate-900">{invoice.currency}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200">
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-[600px] table-auto text-sm">
              <thead className="bg-slate-100/90 text-xs uppercase tracking-widest text-slate-600">
                <tr>
                  <th className="px-5 py-3 text-left font-semibold">Description</th>
                  <th className="px-5 py-3 text-left font-semibold">Qty</th>
                  <th className="px-5 py-3 text-left font-semibold">Unit price</th>
                  <th className="px-5 py-3 text-left font-semibold">Line total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item, idx) => {
                  const lineTotal = Math.max(item.quantity, 0) * Math.max(item.unitPrice, 0)
                  return (
                    <tr key={item.id} className={`align-top ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}`}>
                      <td className="px-5 py-4 text-slate-700">
                        <div className="font-medium text-slate-900">{item.description || '—'}</div>
                      </td>
                      <td className="px-5 py-4 text-slate-600">{item.quantity || 0}</td>
                      <td className="px-5 py-4 text-slate-600">
                        {amountNode(item.unitPrice, 'start', 'font-medium text-slate-700')}
                      </td>
                      <td className="px-5 py-4 text-right text-slate-900 font-semibold">
                        {amountNode(lineTotal, 'end', 'font-semibold text-slate-900')}
                      </td>
                    </tr>
                  )
                })}
                {invoice.items.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-6 text-center text-slate-500">No line items added yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col divide-y md:hidden">
            {invoice.items.length === 0 && (
              <div className="px-4 py-5 text-center text-sm text-slate-500">No line items added yet.</div>
            )}
            {invoice.items.map((item, idx) => {
              const lineTotal = Math.max(item.quantity, 0) * Math.max(item.unitPrice, 0)
              return (
                <div key={item.id} className="px-4 py-5 text-sm text-slate-700">
                  <div className="font-semibold text-slate-900">{item.description || `Item ${idx + 1}`}</div>
                  <div className="mt-2 grid grid-cols-2 gap-y-1 text-xs uppercase tracking-widest text-slate-500">
                    <span>Qty</span>
                    <span className="text-right text-slate-700">{item.quantity || 0}</span>
                    <span>Unit price</span>
                    <span className="text-right text-slate-700">{amountNode(item.unitPrice, 'end', 'font-medium text-slate-700')}</span>
                    <span>Total</span>
                    <span className="text-right font-semibold text-slate-900">{amountNode(lineTotal, 'end', 'font-semibold text-slate-900')}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex-1 rounded-2xl border bg-slate-50 px-5 py-4 text-sm text-slate-600">
            {invoice.notes && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">Notes</div>
                <div className="mt-2 whitespace-pre-wrap text-slate-700">{invoice.notes}</div>
              </div>
            )}
            {invoice.terms && (
              <div className="mt-5">
                <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">Payment terms</div>
                <div className="mt-2 whitespace-pre-wrap text-slate-700">{invoice.terms}</div>
              </div>
            )}
            {!invoice.notes && !invoice.terms && (
              <div className="text-slate-500">
                Add optional notes or payment terms for your client. These details appear on the PDF and shareable link.
              </div>
            )}
          </div>
          <div className="w-full max-w-sm rounded-2xl border border-emerald-100 bg-white px-6 py-5 shadow-inner">
            <dl className="space-y-3 text-sm text-slate-600">
              <div className="flex items-center justify-between">
                <dt>Subtotal</dt>
                <dd className="font-medium text-slate-900">{amountNode(totals.subtotal, 'end', 'font-medium text-slate-900')}</dd>
              </div>
              {totals.discount > 0 && (
                <div className="flex items-center justify-between">
                  <dt>Discount ({invoice.discountPct ?? 0}%)</dt>
                  <dd className="font-medium text-slate-900">- {amountNode(totals.discount, 'end', 'font-medium text-slate-900')}</dd>
                </div>
              )}
              <div className="flex items-center justify-between">
                <dt>Taxable amount</dt>
                <dd className="font-medium text-slate-900">{amountNode(totals.taxable, 'end', 'font-medium text-slate-900')}</dd>
              </div>
              {totals.tax > 0 && (
                <div className="flex items-center justify-between">
                  <dt>Tax ({invoice.taxPct ?? 0}%)</dt>
                  <dd className="font-medium text-slate-900">{amountNode(totals.tax, 'end', 'font-medium text-slate-900')}</dd>
                </div>
              )}
              {totals.shipping > 0 && (
                <div className="flex items-center justify-between">
                  <dt>Shipping</dt>
                  <dd className="font-medium text-slate-900">{amountNode(totals.shipping, 'end', 'font-medium text-slate-900')}</dd>
                </div>
              )}
            </dl>
            <div className="mt-5 rounded-xl bg-emerald-600/10 px-4 py-3 text-slate-900">
              <div className="text-xs font-semibold uppercase tracking-widest text-emerald-700">Balance due</div>
              <div className="mt-1 text-2xl font-semibold text-emerald-800">{amountNode(totals.total, 'end', 'text-2xl font-semibold text-emerald-800')}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
