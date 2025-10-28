import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import Card from '../components/Card'
import { setEditingInvoiceId, setEditingReceiptId } from '../utils/storage'
import { deleteInvoice as deleteInvoiceApi, deleteReceipt as deleteReceiptApi, fetchInvoices, fetchReceipts } from '../api'
import type { InvoiceRecord, Receipt } from '../types'
import { useNavigate } from 'react-router-dom'
import {
  History as HistoryIcon,
  Trash2,
  Edit,
  Receipt as ReceiptIcon,
  FileText,
  FileDown,
  FilePlus2,
  Printer,
  Share2,
  CheckSquare,
  Square,
  Search,
} from 'lucide-react'
import { ReceiptSummary } from '../components/Summary'
import MoneyValue from '../components/MoneyValue'
import { useCalc } from '../state/calc'
import { fmt, formatWithConversion } from '../utils/currency'
import { generateReceiptPdf } from '../utils/pdf'
import type { Currency } from '../types'

const encodePayload = (data: unknown) => {
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

const createSelectionPayload = (receipts: Receipt[], currency: Currency) => {
  const items = receipts
    .flatMap((receipt) =>
      receipt.products.map((product, index) => {
        const rawQuantity = Number.isFinite(product.quantity) ? product.quantity : 0
        const rawPrice = Number.isFinite(product.unitSellPrice) ? product.unitSellPrice : 0
        const normalizedQuantity = Math.max(rawQuantity || 0, 0)
        const normalizedPrice = Math.max(rawPrice || 0, 0)
        return {
          description:
            (product.name || '').trim() ||
            `${receipt.label || 'Product'} ${index + 1}`,
          quantity: normalizedQuantity > 0 ? normalizedQuantity : (normalizedPrice > 0 ? 1 : 0),
          unitPrice: normalizedPrice,
        }
      }),
    )
    .filter((item) => item.quantity > 0 || item.unitPrice > 0)

  return {
    currency,
    items,
  }
}

const encodeInvoiceForUrl = (invoice: InvoiceRecord['invoice']) => encodePayload(invoice)

const sumQuantity = (receipt: Receipt) =>
  receipt.products.reduce((acc, product) => acc + Math.max(product.quantity || 0, 0), 0)

const averageMarkup = (receipt: Receipt) => {
  if (!receipt.products.length) return 0
  const marks = receipt.products
    .map((product) => {
      const base = (product.unitSupplierCost || 0) + (product.unitProductionOverhead || 0)
      if (base <= 0) return 0
      const sell = product.unitSellPrice || 0
      return ((sell / base) - 1) * 100
    })
    .filter((value) => Number.isFinite(value))
  if (!marks.length) return 0
  const sum = marks.reduce((a, b) => a + b, 0)
  return Number((sum / marks.length).toFixed(2))
}

const matchesCharacterSet = (value: string | null | undefined, rawQuery: string) => {
  const compressedQuery = rawQuery.replace(/\s+/g, '')
  if (!compressedQuery) return true
  if (!value) return false
  const haystack = value.toLowerCase()
  const uniqueChars = Array.from(new Set(Array.from(compressedQuery)))
  return uniqueChars.every((char) => haystack.includes(char))
}

const CALC_PAGE_SIZE = 5
const INVOICE_PAGE_SIZE = 5

export default function HistoryPage() {
  const { state: calcState, set, setExtras, setProducts } = useCalc()
  const navigate = useNavigate()
  const [calcItems, setCalcItems] = useState<Receipt[]>([])
  const [invoiceItems, setInvoiceItems] = useState<InvoiceRecord[]>([])
  const [selectedCalc, setSelectedCalc] = useState<Receipt | null>(null)
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRecord | null>(null)
  const [selectionMap, setSelectionMap] = useState<Record<string, boolean>>({})
  const [selectionCurrency, setSelectionCurrency] = useState<Currency | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'calc' | 'invoice'>('calc')
  const [showReport, setShowReport] = useState(false)
  const [calcSearch, setCalcSearch] = useState('')
  const [invoiceSearch, setInvoiceSearch] = useState('')
  const [calcPage, setCalcPage] = useState(0)
  const [invoicePage, setInvoicePage] = useState(0)
  const calcPreviewRef = useRef<HTMLDivElement | null>(null)
  const invoicePreviewRef = useRef<HTMLDivElement | null>(null)
  const calcListTopRef = useRef<HTMLDivElement | null>(null)
  const invoiceListTopRef = useRef<HTMLDivElement | null>(null)

  const scrollToPreview = useCallback((section: 'calc' | 'invoice') => {
    const target =
      section === 'calc' ? calcPreviewRef.current : invoicePreviewRef.current
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  const scrollToListTop = useCallback((section: 'calc' | 'invoice') => {
    const target =
      section === 'calc' ? calcListTopRef.current : invoiceListTopRef.current
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [receipts, invoices] = await Promise.all([fetchReceipts(), fetchInvoices()])
      setCalcItems(receipts)
      setInvoiceItems(invoices)
      setCalcPage(0)
      setInvoicePage(0)

      setSelectedCalc((prev) => {
        if (!prev) return receipts[0] ?? null
        const stillExists = receipts.find((item) => item.id === prev.id)
        return stillExists || receipts[0] || null
      })

      setSelectedInvoice((prev) => {
        if (!prev) return invoices[0] ?? null
        const stillExists = invoices.find((item) => item.id === prev.id)
        return stillExists || invoices[0] || null
      })

      let computedCurrency: Currency | null = null
      setSelectionMap((prev) => {
        const existingIds = new Set(receipts.map((item) => item.id))
        const next: Record<string, boolean> = {}
        for (const [id, value] of Object.entries(prev)) {
          if (value && existingIds.has(id)) {
            next[id] = true
          }
        }
        const firstSelected = receipts.find((item) => next[item.id])
        computedCurrency = firstSelected ? firstSelected.baseCurrency : null
        return next
      })
      setSelectionCurrency(computedCurrency)
    } catch (err) {
      console.error(err)
      setLoadError(err instanceof Error ? err.message : 'Unable to load history.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const selectedForInvoice = useMemo(
    () => calcItems.filter((item) => selectionMap[item.id]),
    [calcItems, selectionMap],
  )

  const handleSelectCalc = useCallback(
    (receipt: Receipt) => {
      setSelectedCalc(receipt)
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => scrollToPreview('calc'))
      } else {
        scrollToPreview('calc')
      }
    },
    [scrollToPreview],
  )

  const handleSelectInvoice = useCallback(
    (record: InvoiceRecord) => {
      setSelectedInvoice(record)
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => scrollToPreview('invoice'))
      } else {
        scrollToPreview('invoice')
      }
    },
    [scrollToPreview],
  )

  const calcSearchQuery = calcSearch.trim().toLowerCase()
  const calcCompressedQuery = calcSearchQuery.replace(/\s+/g, '')
  const filteredCalcItems = useMemo(() => {
    if (!calcCompressedQuery) return calcItems
    return calcItems.filter((receipt) => {
      if (
        matchesCharacterSet(receipt.label || '', calcCompressedQuery) ||
        matchesCharacterSet(receipt.baseCurrency, calcCompressedQuery) ||
        matchesCharacterSet(new Date(receipt.createdAt).toLocaleString(), calcCompressedQuery)
      ) {
        return true
      }
      return receipt.products.some((product) => matchesCharacterSet(product.name || '', calcCompressedQuery))
    })
  }, [calcItems, calcCompressedQuery])

  const invoiceSearchQuery = invoiceSearch.trim().toLowerCase()
  const invoiceCompressedQuery = invoiceSearchQuery.replace(/\s+/g, '')
  const filteredInvoiceItems = useMemo(() => {
    if (!invoiceCompressedQuery) return invoiceItems
    return invoiceItems.filter((record) => {
      if (
        matchesCharacterSet(record.invoice.invoiceNumber || '', invoiceCompressedQuery) ||
        matchesCharacterSet(record.invoice.to.name || '', invoiceCompressedQuery) ||
        matchesCharacterSet(record.label || '', invoiceCompressedQuery) ||
        matchesCharacterSet(record.invoice.from.name || '', invoiceCompressedQuery) ||
        matchesCharacterSet(new Date(record.createdAt).toLocaleString(), invoiceCompressedQuery) ||
        matchesCharacterSet(record.invoice.currency, invoiceCompressedQuery)
      ) {
        return true
      }
      return record.invoice.items.some((item) =>
        matchesCharacterSet(item.description || '', invoiceCompressedQuery),
      )
    })
  }, [invoiceItems, invoiceCompressedQuery])

  const calcPageCount = Math.max(1, Math.ceil(filteredCalcItems.length / CALC_PAGE_SIZE))
  const invoicePageCount = Math.max(1, Math.ceil(filteredInvoiceItems.length / INVOICE_PAGE_SIZE))

  const pagedCalcItems = useMemo(() => {
    const start = calcPage * CALC_PAGE_SIZE
    return filteredCalcItems.slice(start, start + CALC_PAGE_SIZE)
  }, [filteredCalcItems, calcPage])

  const pagedInvoiceItems = useMemo(() => {
    const start = invoicePage * INVOICE_PAGE_SIZE
    return filteredInvoiceItems.slice(start, start + INVOICE_PAGE_SIZE)
  }, [filteredInvoiceItems, invoicePage])

  useEffect(() => {
    if (pagedCalcItems.length === 0) return
    if (!selectedCalc) {
      setSelectedCalc(pagedCalcItems[0])
      return
    }
    const isSelectedOnPage = pagedCalcItems.some((item) => item.id === selectedCalc.id)
    if (!isSelectedOnPage) {
      setSelectedCalc(pagedCalcItems[0])
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => scrollToPreview('calc'))
      } else {
        scrollToPreview('calc')
      }
    }
  }, [pagedCalcItems, selectedCalc, scrollToPreview])

  useEffect(() => {
    if (pagedInvoiceItems.length === 0) return
    if (!selectedInvoice) {
      setSelectedInvoice(pagedInvoiceItems[0])
      return
    }
    const isSelectedOnPage = pagedInvoiceItems.some((item) => item.id === selectedInvoice.id)
    if (!isSelectedOnPage) {
      setSelectedInvoice(pagedInvoiceItems[0])
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => scrollToPreview('invoice'))
      } else {
        scrollToPreview('invoice')
      }
    }
  }, [pagedInvoiceItems, selectedInvoice, scrollToPreview])

  const calcShowingStart = filteredCalcItems.length === 0 ? 0 : calcPage * CALC_PAGE_SIZE + 1
  const calcShowingEnd = Math.min(filteredCalcItems.length, (calcPage + 1) * CALC_PAGE_SIZE)
  const invoiceShowingStart = filteredInvoiceItems.length === 0 ? 0 : invoicePage * INVOICE_PAGE_SIZE + 1
  const invoiceShowingEnd = Math.min(filteredInvoiceItems.length, (invoicePage + 1) * INVOICE_PAGE_SIZE)

  const calcHasPagination = calcPageCount > 1
  const invoiceHasPagination = invoicePageCount > 1

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(filteredCalcItems.length / CALC_PAGE_SIZE) - 1)
    if (calcPage > maxPage) {
      setCalcPage(maxPage)
    }
  }, [filteredCalcItems.length, calcPage])

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(filteredInvoiceItems.length / INVOICE_PAGE_SIZE) - 1)
    if (invoicePage > maxPage) {
      setInvoicePage(maxPage)
    }
  }, [filteredInvoiceItems.length, invoicePage])

  const computedMarkupPct = useMemo(() => {
    if (!selectedCalc) return 0
    return averageMarkup(selectedCalc)
  }, [selectedCalc])

  useEffect(() => {
    if (!calcCompressedQuery) {
      if (!selectedCalc && calcItems.length > 0) {
        setSelectedCalc(calcItems[0])
        setCalcPage(0)
      }
      if (calcItems.length === 0 && calcPage !== 0) setCalcPage(0)
      return
    }
    if (filteredCalcItems.length === 0) {
      if (selectedCalc) setSelectedCalc(null)
      if (calcPage !== 0) setCalcPage(0)
      return
    }
    if (!selectedCalc || !filteredCalcItems.some((item) => item.id === selectedCalc.id)) {
      const nextSelection = filteredCalcItems[0]
      if (nextSelection) {
        setSelectedCalc(nextSelection)
        if (selectedCalc) {
          if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(() => scrollToPreview('calc'))
          } else {
            scrollToPreview('calc')
          }
        }
      }
      if (calcPage !== 0) setCalcPage(0)
    }
  }, [calcCompressedQuery, filteredCalcItems, selectedCalc, calcItems, calcPage, scrollToPreview])

  useEffect(() => {
    if (!invoiceCompressedQuery) {
      if (!selectedInvoice && invoiceItems.length > 0) {
        setSelectedInvoice(invoiceItems[0])
        setInvoicePage(0)
      }
      if (invoiceItems.length === 0 && invoicePage !== 0) setInvoicePage(0)
      return
    }
    if (filteredInvoiceItems.length === 0) {
      if (selectedInvoice) setSelectedInvoice(null)
      if (invoicePage !== 0) setInvoicePage(0)
      return
    }
    if (!selectedInvoice || !filteredInvoiceItems.some((record) => record.id === selectedInvoice.id)) {
      const nextSelection = filteredInvoiceItems[0]
      if (nextSelection) {
        setSelectedInvoice(nextSelection)
        if (selectedInvoice) {
          if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(() => scrollToPreview('invoice'))
          } else {
            scrollToPreview('invoice')
          }
        }
      }
      if (invoicePage !== 0) setInvoicePage(0)
    }
  }, [invoiceCompressedQuery, filteredInvoiceItems, selectedInvoice, invoiceItems, invoicePage, scrollToPreview])
  const handleDeleteReceipt = async (id: string) => {
    try {
      await deleteReceiptApi(id)
      await refresh()
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : 'Unable to delete calculation.')
    }
  }

  const handleDeleteInvoice = async (id: string) => {
    try {
      await deleteInvoiceApi(id)
      await refresh()
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : 'Unable to delete invoice record.')
    }
  }

  const handleToggleSelection = (receipt: Receipt) => {
    setSelectionMap((prev) => {
      const isSelected = !!prev[receipt.id]
      if (!isSelected && selectionCurrency && selectionCurrency !== receipt.baseCurrency) {
        alert('Selected calculations must share the same base currency to build an invoice.')
        return prev
      }
      const next = { ...prev }
      if (isSelected) {
        delete next[receipt.id]
      } else {
        next[receipt.id] = true
      }
      const remaining = calcItems.filter((item) => next[item.id])
      setSelectionCurrency(remaining.length > 0 ? remaining[0].baseCurrency : null)
      return next
    })
  }

  const clearSelection = () => {
    setSelectionMap({})
    setSelectionCurrency(null)
  }

  const handleCreateInvoiceFromSelection = () => {
    if (selectedForInvoice.length === 0) {
      alert('Select at least one calculation to build an invoice.')
      return
    }
    const currency = selectionCurrency || selectedForInvoice[0].baseCurrency
    const payload = createSelectionPayload(selectedForInvoice, currency)
    if (payload.items.length === 0) {
      alert('Selected calculations do not have billable products yet.')
      return
    }
    const encoded = encodePayload(payload)
    if (!encoded) {
      alert('Unable to prepare invoice payload.')
      return
    }
    clearSelection()
    navigate(`/invoice?calc=${encoded}`)
  }

  const loadAndEdit = (receipt: Receipt) => {
    set('baseCurrency', receipt.baseCurrency)
    set('usdRate', receipt.usdRate)
    set('targetMarginPct', receipt.targetMarginPct || 0)
    setProducts(() => receipt.products.map((product) => ({ ...product })))
    setExtras(() => receipt.extras.map((extra) => ({ ...extra })))
    setEditingReceiptId(receipt.id)
    navigate('/')
  }

  const handleDownloadPdf = () => {
    if (!selectedCalc || typeof window === 'undefined' || typeof document === 'undefined') return
    const blob = generateReceiptPdf(selectedCalc, computedMarkupPct)
    if (!blob) {
      alert('Unable to prepare PDF download.')
      return
    }
    const baseLabel =
      selectedCalc.label || selectedCalc.products[0]?.name || 'calculation'
    const slug = baseLabel
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    const parsedDate = new Date(selectedCalc.createdAt)
    const safeDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate
    const dateStamp = safeDate.toISOString().split('T')[0]
    const fileName = `${slug || 'calculation'}-${dateStamp}.pdf`
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(() => {
      URL.revokeObjectURL(objectUrl)
    }, 2000)
  }

  const handleOpenInvoice = (record: InvoiceRecord, asNew?: boolean) => {
    const encoded = encodeInvoiceForUrl(record.invoice)
    if (!encoded) {
      alert('Unable to open invoice in builder.')
      return
    }
    if (!asNew) {
      setEditingInvoiceId(record.id)
      navigate(`/invoice?draft=${encoded}&draftId=${record.id}`)
    } else {
      setEditingInvoiceId(null)
      navigate(`/invoice?draft=${encoded}`)
    }
  }

  const handleShareInvoice = async (record: InvoiceRecord) => {
    const encoded = encodeInvoiceForUrl(record.invoice)
    if (!encoded || typeof window === 'undefined') {
      alert('Unable to prepare share link.')
      return
    }
    const url = `${window.location.origin}/invoice?share=${encoded}`
    try {
      await navigator.clipboard.writeText(url)
      alert('Share link copied to clipboard.')
    } catch {
      alert(`Share link: ${url}`)
    }
  }

  const handlePrintInvoice = (record: InvoiceRecord) => {
    const encoded = encodeInvoiceForUrl(record.invoice)
    if (!encoded || typeof window === 'undefined') return
    window.open(`/invoice?share=${encoded}`, '_blank', 'noopener,noreferrer,width=900,height=1200')
  }

  const renderCalcTab = () => (
    <>
      {selectedForInvoice.length > 0 && (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {selectedForInvoice.length} calculation{selectedForInvoice.length === 1 ? '' : 's'} selected for invoicing.
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-500 bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-soft hover:bg-emerald-700"
                onClick={handleCreateInvoiceFromSelection}
              >
                <FilePlus2 className="h-3.5 w-3.5" /> Create invoice
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                onClick={clearSelection}
              >
                Clear selection
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 md:[grid-template-columns:minmax(0,1fr)_minmax(0,2fr)]">
        <Card
          title="Saved calculations"
          subtitle="Tap to preview or edit. Use the checkbox to add to an invoice."
        >
          <div ref={calcListTopRef} className="relative mb-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-9 pr-3 text-sm text-slate-700 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              value={calcSearch}
              onChange={(e) => {
                setCalcSearch(e.target.value)
                setCalcPage(0)
              }}
              placeholder="Search calculations"
              aria-label="Search calculations"
            />
          </div>
          {calcItems.length > 0 && (
            <div className="mb-2 text-xs text-slate-500">
              {filteredCalcItems.length} match{filteredCalcItems.length === 1 ? '' : 'es'} found
            </div>
          )}
          <div className="divide-y">
            {calcItems.length === 0 && (
              <div className="text-sm text-slate-600">No calculations saved yet.</div>
            )}
            {calcItems.length > 0 && filteredCalcItems.length === 0 && (
              <div className="px-2 py-3 text-sm text-slate-500">No calculations match your search.</div>
            )}
            {calcItems.length > 0 && filteredCalcItems.length > 0 && pagedCalcItems.map((receipt) => {
              const isActive = selectedCalc?.id === receipt.id
              const totalQuantity = sumQuantity(receipt)
              const isSelected = !!selectionMap[receipt.id]
              return (
                <div
                  key={receipt.id}
                  className={`group relative rounded-lg border px-3 py-3 ${
                    isActive ? 'border-emerald-300 bg-emerald-50/60' : 'border-transparent hover:bg-slate-50'
                  }`}
                  aria-selected={isActive}
                  role="button"
                  onClick={() => handleSelectCalc(receipt)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex shrink-0 items-start gap-2">
                      <button
                        className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded border bg-white text-slate-500 hover:bg-slate-100"
                        onClick={(e) => { e.stopPropagation(); handleToggleSelection(receipt) }}
                        aria-label={isSelected ? 'Remove from invoice selection' : 'Add to invoice selection'}
                      >
                        {isSelected ? <CheckSquare className="h-4 w-4 text-emerald-600" /> : <Square className="h-4 w-4" />}
                      </button>
                      <div className="min-w-0">
                        <div className="truncate text-[15px] font-semibold leading-snug">
                          {receipt.label || receipt.products[0]?.name || 'Untitled'}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {receipt.products.length} product{receipt.products.length === 1 ? '' : 's'} • Qty {totalQuantity.toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex w-full flex-wrap items-center justify-end gap-2 sm:mt-0 sm:w-auto">
                      <button
                        className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs hover:bg-slate-100"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSelectCalc(receipt)
                          setShowReport(true)
                        }}
                      >
                        <FileText className="h-4 w-4" />
                        <span className="hidden sm:inline">Report</span>
                      </button>
                      <button
                        className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs hover:bg-slate-100"
                        onClick={(e) => { e.stopPropagation(); loadAndEdit(receipt) }}
                      >
                        <Edit className="h-4 w-4" />
                        <span className="hidden sm:inline">Edit</span>
                      </button>
                      <button
                        className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs hover:bg-red-50 hover:text-red-700"
                        onClick={(e) => {
                          e.stopPropagation()
                          void handleDeleteReceipt(receipt.id)
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="hidden sm:inline">Delete</span>
                      </button>
                    </div>
                  </div>
                  <div className="mt-1 pl-7 text-xs text-slate-500">
                    {new Date(receipt.createdAt).toLocaleString()}
                  </div>
                  {isActive && <div className="absolute left-0 top-0 h-full w-1 rounded-l bg-emerald-500" />}
                </div>
              )
            })}
          </div>
          {calcHasPagination && filteredCalcItems.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
              <span>
                Showing {calcShowingStart}-{calcShowingEnd} of {filteredCalcItems.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => {
                    setCalcPage((prev) => Math.max(0, prev - 1))
                    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
                      window.requestAnimationFrame(() => scrollToListTop('calc'))
                    } else {
                      scrollToListTop('calc')
                    }
                  }}
                  disabled={calcPage === 0}
                >
                  Previous
                </button>
                <span className="font-medium text-slate-600">
                  Page {calcPage + 1} of {calcPageCount}
                </span>
                <button
                  className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => {
                    setCalcPage((prev) => Math.min(calcPageCount - 1, prev + 1))
                    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
                      window.requestAnimationFrame(() => scrollToListTop('calc'))
                    } else {
                      scrollToListTop('calc')
                    }
                  }}
                  disabled={calcPage >= calcPageCount - 1}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </Card>

        <div ref={calcPreviewRef} className="space-y-4">
          {selectedCalc ? (
            <>
              <Card
                title="Actions"
                bodyClassName="!mt-0"
                actions={
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50"
                      onClick={() => setShowReport(true)}
                    >
                      <FileText className="h-4 w-4" /> View full report
                    </button>
                    <button
                      className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50"
                      onClick={handleDownloadPdf}
                    >
                      <FileDown className="h-4 w-4" /> Download PDF
                    </button>
                    <button
                      className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm text-red-600 hover:border-red-200 hover:bg-red-50"
                      onClick={() => {
                        void handleDeleteReceipt(selectedCalc.id)
                      }}
                    >
                      <Trash2 className="h-4 w-4" /> Delete
                    </button>
                  </div>
                }
              >
                <div className="text-sm text-slate-600">
                  Open a detailed report or download a print-friendly PDF.
                </div>
              </Card>

              <ReceiptSummary
                title="Receipt"
                productName={selectedCalc.label || selectedCalc.products[0]?.name}
                currency={selectedCalc.baseCurrency}
                results={selectedCalc.results}
                quantity={sumQuantity(selectedCalc)}
                products={selectedCalc.products}
                usdRate={selectedCalc.usdRate}
              />

              {showReport && selectedCalc && (
                <ReportModal
                  onClose={() => setShowReport(false)}
                  receipt={selectedCalc}
                  computedMarkupPct={computedMarkupPct}
                />
              )}
            </>
          ) : (
            <Card title="Preview">
              <div className="text-sm text-slate-600">Select a calculation from the left.</div>
            </Card>
          )}
        </div>
      </div>
    </>
  )

  const renderInvoiceTab = () => (
    <div className="mt-4 grid grid-cols-1 gap-4 md:[grid-template-columns:minmax(0,1fr)_minmax(0,2fr)]">
      <Card
        title="Saved invoices"
        subtitle="Tap to preview. Actions let you open, share, or print."
      >
        <div ref={invoiceListTopRef} className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-9 pr-3 text-sm text-slate-700 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            value={invoiceSearch}
            onChange={(e) => {
              setInvoiceSearch(e.target.value)
              setInvoicePage(0)
            }}
            placeholder="Search invoices"
            aria-label="Search invoices"
          />
        </div>
        {invoiceItems.length > 0 && (
          <div className="mb-2 text-xs text-slate-500">
            {filteredInvoiceItems.length} match{filteredInvoiceItems.length === 1 ? '' : 'es'} found
          </div>
        )}
        <div className="divide-y">
          {invoiceItems.length === 0 && (
            <div className="text-sm text-slate-600">No invoices saved yet.</div>
          )}
          {invoiceItems.length > 0 && filteredInvoiceItems.length === 0 && (
            <div className="px-2 py-3 text-sm text-slate-500">No invoices match your search.</div>
          )}
          {invoiceItems.length > 0 && filteredInvoiceItems.length > 0 && pagedInvoiceItems.map((record) => {
            const isActive = selectedInvoice?.id === record.id
            const clientName = record.invoice.to.name || 'Client'
            const invoiceRate = record.usdRate ?? calcState.usdRate
            return (
              <div
                key={record.id}
                className={`group relative rounded-lg border px-3 py-3 ${
                  isActive ? 'border-emerald-300 bg-emerald-50/60' : 'border-transparent hover:bg-slate-50'
                }`}
                  onClick={() => handleSelectInvoice(record)}
                role="button"
                aria-selected={isActive}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-semibold leading-snug">
                      {record.invoice.invoiceNumber || record.label || 'Invoice'}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {clientName} • {new Date(record.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="mt-3 flex w-full flex-wrap items-center justify-end gap-2 sm:mt-0 sm:w-auto">
                    <button
                      className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs hover:bg-slate-100"
                      onClick={(e) => { e.stopPropagation(); handleOpenInvoice(record) }}
                    >
                      <Edit className="h-4 w-4" />
                      <span className="hidden sm:inline">Open</span>
                    </button>
                    <button
                      className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs hover:bg-slate-100"
                      onClick={(e) => { e.stopPropagation(); handleShareInvoice(record) }}
                    >
                      <Share2 className="h-4 w-4" />
                      <span className="hidden sm:inline">Share</span>
                    </button>
                    <button
                      className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs hover:bg-slate-100"
                      onClick={(e) => { e.stopPropagation(); handlePrintInvoice(record) }}
                    >
                      <Printer className="h-4 w-4" />
                      <span className="hidden sm:inline">Print</span>
                    </button>
                    <button
                      className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs hover:bg-red-50 hover:text-red-700"
                      onClick={(e) => {
                        e.stopPropagation()
                        void handleDeleteInvoice(record.id)
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="hidden sm:inline">Delete</span>
                    </button>
                  </div>
                </div>
                <div className="mt-1 flex flex-col items-start gap-1 text-xs text-slate-500 sm:items-end">
                  <MoneyValue
                    currency={record.invoice.currency}
                    amount={record.totals.total}
                    usdRate={invoiceRate}
                    align="start"
                    primaryClassName="font-semibold text-slate-700"
                    secondaryClassName="text-[10px] text-slate-500"
                  />
                  <span>{record.invoice.items.length} item{record.invoice.items.length === 1 ? '' : 's'}</span>
                </div>
                {isActive && <div className="absolute left-0 top-0 h-full w-1 rounded-l bg-emerald-500" />}
              </div>
            )
          })}
        </div>
        {invoiceHasPagination && filteredInvoiceItems.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
            <span>
              Showing {invoiceShowingStart}-{invoiceShowingEnd} of {filteredInvoiceItems.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => {
                  setInvoicePage((prev) => Math.max(0, prev - 1))
                  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
                    window.requestAnimationFrame(() => scrollToListTop('invoice'))
                  } else {
                    scrollToListTop('invoice')
                  }
                }}
                disabled={invoicePage === 0}
              >
                Previous
              </button>
              <span className="font-medium text-slate-600">
                Page {invoicePage + 1} of {invoicePageCount}
              </span>
              <button
                className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => {
                  setInvoicePage((prev) => Math.min(invoicePageCount - 1, prev + 1))
                  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
                    window.requestAnimationFrame(() => scrollToListTop('invoice'))
                  } else {
                    scrollToListTop('invoice')
                  }
                }}
                disabled={invoicePage >= invoicePageCount - 1}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </Card>

      <div ref={invoicePreviewRef} className="space-y-4">
        {selectedInvoice ? (
          <InvoiceHistoryPreview
            record={selectedInvoice}
            onOpen={() => handleOpenInvoice(selectedInvoice)}
            onOpenAsNew={() => handleOpenInvoice(selectedInvoice, true)}
            onShare={() => handleShareInvoice(selectedInvoice)}
            onPrint={() => handlePrintInvoice(selectedInvoice)}
            onDelete={() => {
              void handleDeleteInvoice(selectedInvoice.id)
            }}
            usdRate={selectedInvoice.usdRate ?? calcState.usdRate}
          />
        ) : (
          <Card title="Preview">
            <div className="text-sm text-slate-600">Select an invoice from the left.</div>
          </Card>
        )}
      </div>
    </div>
  )

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <h1 className="flex items-center gap-2 text-xl font-semibold md:text-2xl">
        <HistoryIcon className="h-5 w-5" /> History
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        You have {calcItems.length} saved calculation{calcItems.length === 1 ? '' : 's'} and {invoiceItems.length} invoice{invoiceItems.length === 1 ? '' : 's'} stored on the server.
      </p>

      {loadError && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
          <button
            className="ml-3 inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
            onClick={() => {
              void refresh()
            }}
          >
            Retry
          </button>
        </div>
      )}
      {loading && !loadError && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600">
          Syncing history...
        </div>
      )}

      <div className="mt-4 inline-flex items-center gap-2 rounded-full border bg-white p-1 shadow-soft">
        <button
          className={`rounded-full px-3 py-1 text-sm font-medium ${activeTab === 'calc' ? 'bg-emerald-100 text-emerald-700' : 'text-slate-600 hover:bg-slate-100'}`}
          onClick={() => setActiveTab('calc')}
        >
          Calculations
        </button>
        <button
          className={`rounded-full px-3 py-1 text-sm font-medium ${activeTab === 'invoice' ? 'bg-emerald-100 text-emerald-700' : 'text-slate-600 hover:bg-slate-100'}`}
          onClick={() => setActiveTab('invoice')}
        >
          Invoices
        </button>
      </div>

      {activeTab === 'calc' ? renderCalcTab() : renderInvoiceTab()}
    </div>
  )
}

function renderReportHtml(receipt: Receipt, markupPct: number) {
  const date = new Date(receipt.createdAt).toLocaleString()
  const formatMoney = (value: number) => formatWithConversion(receipt.baseCurrency, value, receipt.usdRate)
  const totalsRows = receipt.products
    .map((product, index) => {
      const base = (product.unitSupplierCost || 0) + (product.unitProductionOverhead || 0)
      const revenue = (product.unitSellPrice || 0) * (product.quantity || 0)
      return `<tr>
        <td>${product.name || `Product ${index + 1}`}</td>
        <td style="text-align:right">${product.quantity || 0}</td>
        <td style="text-align:right">${formatMoney(product.unitSellPrice || 0)}</td>
        <td style="text-align:right">${formatMoney(revenue)}</td>
        <td style="text-align:right">${formatMoney(base)}</td>
      </tr>`
    })
    .join('')

  const extrasRows = (receipt.extras || [])
    .map((extra: any) => {
      const label = extra.label || (extra.kind === 'percent' ? 'Percent extra' : 'Extra')
      const detail =
        extra.kind === 'percent'
          ? `${(extra.percent || 0).toFixed(2)}% • ${extra.allocation}`
          : `${extra.currency || receipt.baseCurrency} ${fmt(extra.amount || 0)} • ${extra.allocation}`
      return `<tr><td>${label}</td><td style="text-align:right">${detail}</td></tr>`
    })
    .join('')

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${receipt.label || 'Receipt'} - Report</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { font: 14px/1.45 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif; color: #0f172a; margin: 24px; }
    h1 { font-size: 18px; margin: 0 0 12px; }
    h2 { font-size: 15px; margin: 16px 0 8px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 6px 0; border-bottom: 1px solid #e2e8f0; }
    th { text-align:left; }
    .meta { color:#475569; font-size:12px; margin-bottom: 12px; }
    .grid { display:grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 12px; }
    @media print { body { margin: 0; padding: 24px; } }
  </style>
</head>
<body>
  <h1>Full Report${receipt.label ? ` • ${receipt.label}` : ''}</h1>
  <div class="meta">Created: ${date} • Base: ${receipt.baseCurrency} • Products: ${receipt.products.length} • Qty: ${sumQuantity(receipt).toLocaleString()}</div>

  <div class="grid">
    <div>
      <h2>Products</h2>
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th style="text-align:right">Qty</th>
            <th style="text-align:right">Sell / unit</th>
            <th style="text-align:right">Revenue</th>
            <th style="text-align:right">Base cost / unit</th>
          </tr>
        </thead>
        <tbody>
          ${totalsRows || '<tr><td colspan="5" style="color:#64748b">No products</td></tr>'}
        </tbody>
      </table>

      <h2>Extras</h2>
      <table>
        ${extrasRows || '<tr><td style="color:#64748b">None</td><td></td></tr>'}
      </table>
    </div>

    <div>
      <h2>Totals</h2>
      <table>
        <tr><td>Revenue</td><td style="text-align:right">${formatMoney(receipt.results?.revenue || 0)}</td></tr>
        <tr><td>Supplier total</td><td style="text-align:right">${formatMoney(receipt.results?.supplier || 0)}</td></tr>
        <tr><td>Production overhead total</td><td style="text-align:right">${formatMoney(receipt.results?.prodOverhead || 0)}</td></tr>
        <tr><td>Extras total</td><td style="text-align:right">${formatMoney(receipt.results?.extrasTotal || 0)}</td></tr>
        <tr><td><strong>WHT (2%)</strong></td><td style="text-align:right;color:#b45309"><strong>${formatMoney(receipt.results?.withholdingTax || 0)}</strong></td></tr>
        <tr><td><strong>Net revenue (after WHT)</strong></td><td style="text-align:right"><strong>${formatMoney(receipt.results?.netRevenue || 0)}</strong></td></tr>
        <tr><td>Gross profit</td><td style="text-align:right">${formatMoney(receipt.results?.grossProfit || 0)}</td></tr>
        <tr><td>Margin</td><td style="text-align:right">${(receipt.results?.marginPct || 0).toFixed(2)}%</td></tr>
        <tr><td>Average markup</td><td style="text-align:right">${markupPct.toFixed(2)}%</td></tr>
        <tr><td>Profit / unit</td><td style="text-align:right">${formatMoney(receipt.results?.profitPerUnit || 0)}</td></tr>
        <tr><td>Net revenue / unit</td><td style="text-align:right">${formatMoney(receipt.results?.netRevenuePerUnit || 0)}</td></tr>
      </table>
    </div>
  </div>
</body>
</html>`
}

function ReportModal({ onClose, receipt, computedMarkupPct }: { onClose: () => void; receipt: Receipt; computedMarkupPct: number }) {
  const totalQuantity = sumQuantity(receipt)
  const formatMoney = (value: number) => formatWithConversion(receipt.baseCurrency, value, receipt.usdRate)
  return (
    <div className="fixed inset-0 z-30 bg-black/40 p-3 md:p-6" role="dialog" aria-modal="true">
      <div className="mx-auto w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
        <div className="border-b bg-slate-50 px-4 py-3 text-center">
          <div className="text-xs tracking-widest text-slate-500">CALCULATION SUMMARY</div>
          <div className="mt-1 text-lg font-bold text-slate-900">{receipt.label || 'Untitled calculation'}</div>
          <div className="text-[11px] text-slate-500">{new Date(receipt.createdAt).toLocaleString()}</div>
        </div>
        <div className="px-4 py-4">
          <div className="grid grid-cols-2 gap-2 text-[12px] text-slate-600">
            <div>Base: <span className="font-medium">{receipt.baseCurrency}</span></div>
            <div className="text-right">Qty: <span className="font-medium">{totalQuantity.toLocaleString()}</span></div>
          </div>
          <Section title="Products">
            {receipt.products.map((product, index) => {
              const baseCost = (product.unitSupplierCost || 0) + (product.unitProductionOverhead || 0)
              return (
                <div key={product.id} className="rounded-lg border px-3 py-2 text-[12px] text-slate-600">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-800">{product.name || `Product ${index + 1}`}</span>
                    <span>{product.quantity || 0} units</span>
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-1">
                    <KV label="Supplier / unit" value={formatMoney(product.unitSupplierCost || 0)} />
                    <KV label="Overhead / unit" value={formatMoney(product.unitProductionOverhead || 0)} />
                    <KV label="Base cost / unit" value={formatMoney(baseCost)} />
                    <KV label="Sell / unit" value={formatMoney(product.unitSellPrice || 0)} />
                  </div>
                </div>
              )
            })}
            {receipt.products.length === 0 && (
              <div className="text-[12px] text-slate-500">No products captured yet.</div>
            )}
          </Section>

          <Section title="Extras">
            {(receipt.extras || []).length === 0 && (
              <div className="text-[12px] text-slate-500">None</div>
            )}
            {(receipt.extras || []).map((extra: any) => (
              <KV
                key={extra.id}
                label={extra.label || (extra.kind === 'percent' ? 'Percent extra' : 'Extra')}
                value={
                  extra.kind === 'percent'
                    ? `${(extra.percent || 0).toFixed(2)}% • ${extra.allocation}`
                    : `${extra.currency || receipt.baseCurrency} ${fmt(extra.amount || 0)} • ${extra.allocation}`
                }
              />
            ))}
          </Section>

          <div className="mt-4 rounded-xl border p-3">
            <div className="mb-2 text-xs font-semibold tracking-wider text-slate-600">TOTALS</div>
            <KV label="Revenue" value={formatMoney(receipt.results.revenue)} />
            <KV label="Supplier total" value={formatMoney(receipt.results.supplier)} />
            <KV label="Production overhead total" value={formatMoney(receipt.results.prodOverhead)} />
            <KV label="Extras total" value={formatMoney(receipt.results.extrasTotal)} />
            <div className="my-2 border-t border-dotted"></div>
            <KV label="WHT (2%)" value={formatMoney(receipt.results.withholdingTax)} variant="warning" strong />
            <KV label="Net revenue (after WHT)" value={formatMoney(receipt.results.netRevenue)} strong />
            <KV label="Gross profit" value={formatMoney(receipt.results.grossProfit)} />
            <KV label="Margin" value={`${receipt.results.marginPct.toFixed(2)}%`} />
            <KV label="Average markup" value={`${computedMarkupPct.toFixed(2)}%`} />
            <div className="my-2 border-t border-dotted"></div>
            <KV label="Profit / unit" value={formatMoney(receipt.results.profitPerUnit)} />
            <KV label="Net revenue / unit" value={formatMoney(receipt.results.netRevenuePerUnit)} />
          </div>

          <div className="mt-4 flex justify-center">
            <button className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <div className="mb-1 text-[11px] font-semibold tracking-wider text-slate-600">{title}</div>
      <div className="rounded-lg border p-3">
        <div className="space-y-1">{children}</div>
      </div>
    </div>
  )
}

function KV({
  label,
  value,
  strong,
  variant,
}: {
  label: string
  value: string | number
  strong?: boolean
  variant?: 'default' | 'warning'
}) {
  const isWarning = variant === 'warning'
  return (
    <div className={clsx('flex items-center justify-between text-[13px]', isWarning && 'text-amber-800')}>
      <span className={clsx('text-slate-600', isWarning && 'text-amber-700 font-semibold')}>{label}</span>
      <span
        className={clsx(
          strong ? 'font-semibold text-slate-900' : 'text-slate-900',
          isWarning && 'text-amber-800 font-semibold',
        )}
      >
        {value}
      </span>
    </div>
  )
}

function InvoiceHistoryPreview({
  record,
  onOpen,
  onOpenAsNew,
  onShare,
  onPrint,
  onDelete,
  usdRate,
}: {
  record: InvoiceRecord
  onOpen: () => void
  onOpenAsNew: () => void
  onShare: () => void
  onPrint: () => void
  onDelete: () => void
  usdRate: number
}) {
  const { invoice, totals } = record
  const renderAmount = (
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
  return (
    <>
      <Card
        title={invoice.invoiceNumber || record.label || 'Invoice'}
        subtitle={`Issued ${new Date(record.createdAt).toLocaleString()}`}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50" onClick={onOpen}>
              <Edit className="h-4 w-4" /> Open
            </button>
            <button className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50" onClick={onOpenAsNew}>
              <FilePlus2 className="h-4 w-4" /> Duplicate
            </button>
            <button className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50" onClick={onShare}>
              <Share2 className="h-4 w-4" /> Share
            </button>
            <button className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50" onClick={onPrint}>
              <Printer className="h-4 w-4" /> Print
            </button>
            <button className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm text-red-600 hover:border-red-200 hover:bg-red-50" onClick={onDelete}>
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </div>
        }
      >
        <div className="space-y-4 text-sm text-slate-600">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border bg-slate-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">From</div>
              <div className="mt-1 text-sm text-slate-700">
                <div className="font-semibold text-slate-900">{invoice.from.name}</div>
                {invoice.from.email && <div>{invoice.from.email}</div>}
                {invoice.from.phone && <div>{invoice.from.phone}</div>}
                {invoice.from.address && <div className="mt-1 whitespace-pre-wrap">{invoice.from.address}</div>}
              </div>
            </div>
            <div className="rounded-xl border bg-slate-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">Bill to</div>
              <div className="mt-1 text-sm text-slate-700">
                <div className="font-semibold text-slate-900">{invoice.to.name || 'Client'}</div>
                {invoice.to.email && <div>{invoice.to.email}</div>}
                {invoice.to.phone && <div>{invoice.to.phone}</div>}
                {invoice.to.address && <div className="mt-1 whitespace-pre-wrap">{invoice.to.address}</div>}
              </div>
            </div>
          </div>

          <div className="rounded-xl border overflow-hidden">
            <table className="w-full table-auto text-sm">
              <thead className="bg-slate-100 text-xs uppercase tracking-widest text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Description</th>
                  <th className="px-4 py-3 text-left font-semibold">Qty</th>
                  <th className="px-4 py-3 text-left font-semibold">Unit price</th>
                  <th className="px-4 py-3 text-left font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item) => {
                  const amount = Math.max(item.quantity, 0) * Math.max(item.unitPrice, 0)
                  return (
                    <tr key={item.id} className="border-t align-top">
                      <td className="px-4 py-3 text-slate-700">
                        <div className="font-medium text-slate-900">{item.description || '—'}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{item.quantity}</td>
                      <td className="px-4 py-3 text-slate-600">{renderAmount(item.unitPrice, 'start', 'font-medium text-slate-700')}</td>
                      <td className="px-4 py-3 text-right text-slate-900 font-semibold">{renderAmount(amount, 'end', 'font-semibold text-slate-900')}</td>
                    </tr>
                  )
                })}
                {invoice.items.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                      No items yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border bg-white px-4 py-3 shadow-inner">
            <div className="space-y-2 text-sm text-slate-600">
              <div className="flex items-center justify-between">
                <span>Subtotal</span>
                <span className="font-medium text-slate-900">{renderAmount(totals.subtotal, 'end', 'font-medium text-slate-900')}</span>
              </div>
              {totals.discount > 0 && (
                <div className="flex items-center justify-between">
                  <span>Discount ({invoice.discountPct ?? 0}%)</span>
                  <span className="font-medium text-slate-900">- {renderAmount(totals.discount, 'end', 'font-medium text-slate-900')}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span>Taxable amount</span>
                <span className="font-medium text-slate-900">{renderAmount(totals.taxable, 'end', 'font-medium text-slate-900')}</span>
              </div>
              {totals.tax > 0 && (
                <div className="flex items-center justify-between">
                  <span>Tax ({invoice.taxPct ?? 0}%)</span>
                  <span className="font-medium text-slate-900">{renderAmount(totals.tax, 'end', 'font-medium text-slate-900')}</span>
                </div>
              )}
              {totals.shipping > 0 && (
                <div className="flex items-center justify-between">
                  <span>Shipping</span>
                  <span className="font-medium text-slate-900">{renderAmount(totals.shipping, 'end', 'font-medium text-slate-900')}</span>
                </div>
              )}
              <div className="flex items-center justify-between border-t pt-2 text-lg font-semibold text-slate-900">
                <span>Total</span>
                <span>{renderAmount(totals.total, 'end', 'text-2xl font-semibold text-emerald-800')}</span>
              </div>
            </div>
          </div>

          {(invoice.notes || invoice.terms) && (
            <div className="rounded-xl border bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {invoice.notes && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Notes</div>
                  <div className="mt-1 whitespace-pre-wrap">{invoice.notes}</div>
                </div>
              )}
              {invoice.terms && (
                <div className="mt-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Payment terms</div>
                  <div className="mt-1 whitespace-pre-wrap">{invoice.terms}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>
    </>
  )
}
