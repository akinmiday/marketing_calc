import type { Receipt } from './storage'
import { fmt } from './currency'

type FontName = 'F1' | 'F2' | 'F3'

type LineSpec = {
  text: string
  font: FontName
  size: number
  x: number
  y: number
}

type TableColumn = {
  header: string
  width: number
  align?: 'left' | 'right'
}

const PDF_WIDTH = 612 // 8.5in * 72
const PDF_HEIGHT = 792 // 11in * 72
const MARGIN_X = 48
const TOP_MARGIN = 64
const BOTTOM_MARGIN = 64

const encoder = new TextEncoder()

const escapePdfText = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/\r?\n/g, '\\n')

const truncate = (value: string, width: number) => {
  if (value.length <= width) return value
  if (width <= 3) return value.slice(0, width)
  return `${value.slice(0, width - 3)}...`
}

const padCell = (value: string, width: number, align: 'left' | 'right') => {
  const truncated = truncate(value, width)
  return align === 'right' ? truncated.padStart(width, ' ') : truncated.padEnd(width, ' ')
}

const padNumber = (value: number, length = 10) => value.toString().padStart(length, '0')

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

class PdfBuilder {
  private pages: LineSpec[][] = [[]]
  private currentY = PDF_HEIGHT - TOP_MARGIN

  addLine(
    text: string,
    options?: { font?: FontName; size?: number; lineHeight?: number; xOffset?: number },
  ) {
    const font = options?.font ?? 'F1'
    const size = options?.size ?? 12
    const lineHeight = options?.lineHeight ?? Math.max(Math.round(size * 1.35), size + 2)
    const xOffset = options?.xOffset ?? 0

    if (text.trim().length === 0) {
      this.addSpacer(lineHeight)
      return
    }

    this.ensureSpace(lineHeight)

    const line: LineSpec = {
      text,
      font,
      size,
      x: MARGIN_X + xOffset,
      y: this.currentY,
    }

    this.currentPage().push(line)
    this.currentY -= lineHeight
  }

  addSpacer(height: number) {
    if (height <= 0) return
    this.ensureSpace(height)
    this.currentY -= height
  }

  addDivider(width = 60) {
    const safeWidth = clamp(Math.floor(width), 16, 84)
    const line = ''.padEnd(safeWidth, '-')
    this.addLine(line, { font: 'F3', size: 9, lineHeight: 12 })
  }

  addTable(columns: TableColumn[], rows: string[][], options?: { headerSize?: number; rowSize?: number }) {
    if (!columns.length) return
    const headerSize = options?.headerSize ?? 11
    const rowSize = options?.rowSize ?? 10

    const headerLine = columns
      .map((column, index) => padCell(column.header.toUpperCase(), columns[index].width, column.align ?? 'left'))
      .join('  ')
    this.addLine(headerLine, { font: 'F3', size: headerSize })

    const divider = columns
      .map((column) => ''.padEnd(column.width, '-'))
      .join('  ')
    this.addLine(divider, { font: 'F3', size: rowSize })

    if (rows.length === 0) {
      this.addLine('No data available.', { font: 'F3', size: rowSize })
      return
    }

    for (const row of rows) {
      const line = columns
        .map((column, index) => padCell(row[index] ?? '', column.width, column.align ?? 'left'))
        .join('  ')
      this.addLine(line, { font: 'F3', size: rowSize })
    }
  }

  addKeyValue(label: string, value: string, options?: { strong?: boolean }) {
    const labelWidth = 34
    const valueWidth = 30
    const labelText = padCell(label, labelWidth, 'left')
    const valueText = padCell(value, valueWidth, 'right')
    this.addLine(`${labelText}${valueText}`, {
      font: 'F3',
      size: options?.strong ? 11 : 10,
    })
  }

  toBlob(): Blob {
    if (this.pages.length === 0) {
      this.pages.push([])
    }

    const pageCount = this.pages.length
    const fontRefs = {
      regular: 3 + 2 * pageCount,
      bold: 4 + 2 * pageCount,
      mono: 5 + 2 * pageCount,
    }

    const objects: string[] = []

    objects.push(
      `1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
`,
    )

    const kids = Array.from({ length: pageCount }, (_, index) => `${3 + index} 0 R`).join(' ')
    objects.push(
      `2 0 obj
<< /Type /Pages /Count ${pageCount} /Kids [${kids}] >>
endobj
`,
    )

    this.pages.forEach((lines, pageIndex) => {
      const pageObjectNumber = 3 + pageIndex
      const contentObjectNumber = 3 + pageCount + pageIndex
      const content = this.buildPageContent(lines)
      const contentData = content.endsWith('\n') ? content : `${content}\n`
      const contentLength = encoder.encode(contentData).length

      objects.push(
        `${pageObjectNumber} 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_WIDTH} ${PDF_HEIGHT}] /Contents ${contentObjectNumber} 0 R /Resources << /Font << /F1 ${fontRefs.regular} 0 R /F2 ${fontRefs.bold} 0 R /F3 ${fontRefs.mono} 0 R >> >> >>
endobj
`,
      )

      objects.push(
        `${contentObjectNumber} 0 obj
<< /Length ${contentLength} >>
stream
${contentData}endstream
endobj
`,
      )
    })

    objects.push(
      `${fontRefs.regular} 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
`,
    )

    objects.push(
      `${fontRefs.bold} 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>
endobj
`,
    )

    objects.push(
      `${fontRefs.mono} 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>
endobj
`,
    )

    const headerBytes = encoder.encode('%PDF-1.4\n')
    const objectBytes = objects.map((entry) => encoder.encode(entry))

    const offsets: number[] = []
    let runningOffset = headerBytes.length
    objectBytes.forEach((bytes) => {
      offsets.push(runningOffset)
      runningOffset += bytes.length
    })

    const xrefOffset = runningOffset

    let xref = `xref
0 ${objects.length + 1}
0000000000 65535 f 
`
    offsets.forEach((offset) => {
      xref += `${padNumber(offset)} 00000 n 
`
    })

    const trailer = `trailer
<< /Size ${objects.length + 1} /Root 1 0 R >>
`

    const startxref = `startxref
${xrefOffset}
%%EOF`

    const pieces: Uint8Array[] = [
      headerBytes,
      ...objectBytes,
      encoder.encode(xref),
      encoder.encode(trailer),
      encoder.encode(startxref),
    ]

    const totalLength = pieces.reduce((sum, chunk) => sum + chunk.length, 0)
    const combined = new Uint8Array(totalLength)
    let pointer = 0
    pieces.forEach((chunk) => {
      combined.set(chunk, pointer)
      pointer += chunk.length
    })

    return new Blob([combined], { type: 'application/pdf' })
  }

  private currentPage() {
    const page = this.pages[this.pages.length - 1]
    if (!page) {
      const fresh: LineSpec[] = []
      this.pages.push(fresh)
      return fresh
    }
    return page
  }

  private ensureSpace(heightNeeded: number) {
    if (this.currentY - heightNeeded < BOTTOM_MARGIN) {
      this.pages.push([])
      this.currentY = PDF_HEIGHT - TOP_MARGIN
    }
  }

  private buildPageContent(lines: LineSpec[]) {
    if (!lines.length) {
      return `BT
/F1 12 Tf
1 0 0 1 ${MARGIN_X} ${PDF_HEIGHT - TOP_MARGIN} Tm
( ) Tj
ET
`
    }

    const parts: string[] = []
    for (const line of lines) {
      parts.push('BT')
      parts.push(`/${line.font} ${line.size.toFixed(2)} Tf`)
      parts.push(`1 0 0 1 ${line.x.toFixed(2)} ${line.y.toFixed(2)} Tm`)
      parts.push(`(${escapePdfText(line.text)}) Tj`)
      parts.push('ET')
    }
    return `${parts.join('\n')}
`
  }
}

const sumQuantity = (receipt: Receipt) =>
  receipt.products.reduce((acc, product) => acc + Math.max(product.quantity || 0, 0), 0)

const formatMoney = (currency: string, value: number) => `${currency} ${fmt(value)}`

const formatPercent = (value: number) =>
  `${Number.isFinite(value) ? Number(value).toFixed(2) : '0.00'}%`

const formatNumber = (value: number) => fmt(Number.isFinite(value) ? value : 0)

export const generateReceiptPdf = (receipt: Receipt, markupPct: number) => {
  try {
    const builder = new PdfBuilder()
    const createdAt = new Date(receipt.createdAt)
    const createdLabel = Number.isNaN(createdAt.getTime())
      ? receipt.createdAt
      : createdAt.toLocaleString()
    const totalQuantity = sumQuantity(receipt)
    const products = receipt.products ?? []
    const extras = receipt.extras ?? []
    const totals = receipt.results
    const receiptNumberValue =
      typeof receipt.receiptNumber === 'number' && Number.isFinite(receipt.receiptNumber)
        ? receipt.receiptNumber
        : null
    const receiptNumberLabel =
      receiptNumberValue && receiptNumberValue > 0
        ? String(receiptNumberValue).padStart(4, '0')
        : null

    if (receiptNumberLabel) {
      builder.addLine(`Receipt #${receiptNumberLabel}`, { font: 'F2', size: 18, lineHeight: 26 })
    } else {
      builder.addLine('Receipt summary', { font: 'F2', size: 18, lineHeight: 26 })
    }
    builder.addLine(receipt.label || receipt.products[0]?.name || 'Untitled calculation', {
      font: 'F1',
      size: 14,
      lineHeight: 20,
    })
    builder.addLine(`Created: ${createdLabel}`, { font: 'F1', size: 11, lineHeight: 15 })
    builder.addLine(
      `Base currency: ${receipt.baseCurrency}   Products: ${products.length}   Quantity: ${fmt(totalQuantity)}`,
      { font: 'F1', size: 11, lineHeight: 15 },
    )
    if (Number.isFinite(receipt.usdRate) && receipt.usdRate > 0) {
      builder.addLine(`USD rate applied: ${receipt.usdRate}`, { font: 'F1', size: 11, lineHeight: 15 })
    }
    builder.addSpacer(14)
    builder.addDivider(56)
    builder.addSpacer(10)

    builder.addLine('Products', { font: 'F2', size: 13, lineHeight: 20 })
    if (products.length === 0) {
      builder.addLine('No products captured yet.', { font: 'F1', size: 11, lineHeight: 15 })
    } else {
      products.forEach((product, index) => {
        const quantity = Math.max(product.quantity || 0, 0)
        const revenue = quantity * Math.max(product.unitSellPrice || 0, 0)
        const baseCost =
          Math.max(product.unitSupplierCost || 0, 0) + Math.max(product.unitProductionOverhead || 0, 0)
        const supplier = Math.max(product.unitSupplierCost || 0, 0)
        const overhead = Math.max(product.unitProductionOverhead || 0, 0)
        const markup = Number.isFinite(product.markupPct) ? Number(product.markupPct) : null
        const title = `${index + 1}. ${product.name || `Product ${index + 1}`}`

        builder.addLine(title, { font: 'F2', size: 12, lineHeight: 18 })
        builder.addLine(
          `   Qty: ${formatNumber(quantity)}   Sell/unit: ${formatMoney(receipt.baseCurrency, product.unitSellPrice || 0)}`,
          { font: 'F3', size: 10, lineHeight: 14 },
        )
        builder.addLine(
          `   Revenue: ${formatMoney(receipt.baseCurrency, revenue)}   Base/unit: ${formatMoney(receipt.baseCurrency, baseCost)}`,
          { font: 'F3', size: 10, lineHeight: 14 },
        )
        builder.addLine(
          `   Supplier/unit: ${formatMoney(receipt.baseCurrency, supplier)}   Overhead/unit: ${formatMoney(receipt.baseCurrency, overhead)}`,
          { font: 'F3', size: 10, lineHeight: 14 },
        )
        if (markup !== null) {
          builder.addLine(`   Markup: ${formatPercent(markup)}`, {
            font: 'F3',
            size: 10,
            lineHeight: 14,
          })
        }
        if (index < products.length - 1) {
          builder.addSpacer(6)
          builder.addDivider(52)
          builder.addSpacer(6)
        }
      })
      builder.addSpacer(8)
      builder.addDivider(56)
    }

    builder.addSpacer(12)
    builder.addLine('Extras', { font: 'F2', size: 13, lineHeight: 20 })
    if (extras.length === 0) {
      builder.addLine('No extras recorded.', { font: 'F1', size: 11, lineHeight: 15 })
    } else {
      extras.forEach((extra) => {
        const label = extra.label || (extra.kind === 'percent' ? 'Percent extra' : 'Additional cost')
        const extraCurrency = extra.currency || receipt.baseCurrency
        const amountLabel =
          extra.kind === 'percent'
            ? `${formatPercent(extra.percent || 0)} of ${extra.allocation}`
            : `${formatMoney(extraCurrency, extra.amount || 0)} • ${extra.allocation}`
        builder.addLine(`• ${label}`, { font: 'F3', size: 10, lineHeight: 14 })
        builder.addLine(`   ${amountLabel}`, { font: 'F3', size: 10, lineHeight: 14 })
        builder.addSpacer(4)
      })
      builder.addDivider(56)
    }

    builder.addSpacer(12)
    builder.addLine('Totals', { font: 'F2', size: 13, lineHeight: 20 })
    builder.addDivider(56)
    builder.addKeyValue('Revenue', formatMoney(receipt.baseCurrency, totals?.revenue ?? 0))
    builder.addKeyValue('Supplier total', formatMoney(receipt.baseCurrency, totals?.supplier ?? 0))
    builder.addKeyValue(
      'Production overhead total',
      formatMoney(receipt.baseCurrency, totals?.prodOverhead ?? 0),
    )
    builder.addKeyValue('Extras total', formatMoney(receipt.baseCurrency, totals?.extrasTotal ?? 0))
    builder.addKeyValue('WHT (2%)', formatMoney(receipt.baseCurrency, totals?.withholdingTax ?? 0), {
      strong: true,
    })
    builder.addKeyValue(
      'Net revenue (after WHT)',
      formatMoney(receipt.baseCurrency, totals?.netRevenue ?? 0),
      { strong: true },
    )
    builder.addKeyValue('Gross profit', formatMoney(receipt.baseCurrency, totals?.grossProfit ?? 0))
    builder.addKeyValue('Margin', formatPercent(totals?.marginPct ?? 0))
    builder.addKeyValue('Average markup', formatPercent(markupPct))
    builder.addKeyValue('Profit / unit', formatMoney(receipt.baseCurrency, totals?.profitPerUnit ?? 0))
    builder.addKeyValue(
      'Net revenue / unit',
      formatMoney(receipt.baseCurrency, totals?.netRevenuePerUnit ?? 0),
    )

    builder.addSpacer(16)
    builder.addLine(`Report generated on ${new Date().toLocaleString()}`, {
      font: 'F1',
      size: 10,
      lineHeight: 14,
    })

    return builder.toBlob()
  } catch (error) {
    console.error('Failed to generate receipt PDF', error)
    return null
  }
}
