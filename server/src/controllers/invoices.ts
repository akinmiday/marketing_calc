import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { prisma } from '../services/prisma'
import { InvoiceData, computeInvoiceTotals } from '../utils/totals'

const formatInvoiceNumber = (value: number) => `INV-${value.toString().padStart(4, '0')}`

const InvoiceCreateSchema = z.object({
  label: z.string().optional(),
  usdRate: z.number().optional(),
  invoice: InvoiceData,
})

const InvoiceUpdateSchema = z.object({
  label: z.string().optional(),
  usdRate: z.number().optional(),
  invoice: InvoiceData.optional(),
})

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' })
    const q = String(req.query.q || '').toLowerCase()
    const items = await prisma.invoice.findMany({
      where: { userId: req.user.id },
      orderBy: { invoiceNumber: 'desc' },
    })
    const filtered = q ? items.filter(i => (i.label || '').toLowerCase().includes(q)) : items
    res.json(
      filtered.map(i => ({
        ...i,
        payload: ((): any => {
          try {
            return JSON.parse(i.payload as any)
          } catch {
            return i.payload
          }
        })(),
        totals: ((): any => {
          try {
            return JSON.parse(i.totals as any)
          } catch {
            return i.totals
          }
        })(),
      })),
    )
  } catch (err) {
    next(err)
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' })
    const { id } = req.params
    const item = await prisma.invoice.findFirst({ where: { id, userId: req.user.id } })
    if (!item) return res.status(404).json({ error: 'Invoice not found' })
    res.json({
      ...item,
      payload: JSON.parse(item.payload as any),
      totals: JSON.parse(item.totals as any),
    })
  } catch (err) {
    next(err)
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' })
    const body = InvoiceCreateSchema.parse(req.body)
    const created = await prisma.$transaction(async (tx) => {
      const last = await tx.invoice.findFirst({
        where: { userId: req.user!.id },
        orderBy: { invoiceNumber: 'desc' },
        select: { invoiceNumber: true },
      })
      const nextInvoiceNumber = (last?.invoiceNumber ?? 0) + 1
      const formattedNumber = formatInvoiceNumber(nextInvoiceNumber)
      const invoiceData = {
        ...body.invoice,
        invoiceNumber: formattedNumber,
      }
      const totals = computeInvoiceTotals(invoiceData)
      const createdInvoice = await tx.invoice.create({
        data: {
          label: body.label,
          usdRate: body.usdRate,
          payload: JSON.stringify(invoiceData),
          totals: JSON.stringify(totals),
          userId: req.user!.id,
          invoiceNumber: nextInvoiceNumber,
        },
      })
      return { createdInvoice, invoiceData, totals }
    })
    res.status(201).json({
      ...created.createdInvoice,
      payload: created.invoiceData,
      totals: created.totals,
    })
  } catch (err) {
    next(err)
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' })
    const { id } = req.params
    const body = InvoiceUpdateSchema.parse(req.body)
    const found = await prisma.invoice.findFirst({ where: { id, userId: req.user.id } })
    if (!found) return res.status(404).json({ error: 'Invoice not found' })
    const invoice = body.invoice ?? JSON.parse(found.payload as any)
    const invoiceNumber = found.invoiceNumber
    const invoiceWithNumber = {
      ...invoice,
      invoiceNumber: formatInvoiceNumber(invoiceNumber),
    }
    const totals = computeInvoiceTotals(invoiceWithNumber)
    const updated = await prisma.invoice.update({
      where: { id },
      data: {
        label: body.label ?? found.label,
        usdRate: body.usdRate ?? found.usdRate ?? undefined,
        payload: JSON.stringify(invoiceWithNumber),
        totals: JSON.stringify(totals),
      },
    })
    res.json({ ...updated, payload: invoiceWithNumber, totals })
  } catch (err) {
    next(err)
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' })
    const { id } = req.params
    const existing = await prisma.invoice.findFirst({ where: { id, userId: req.user.id } })
    if (!existing) return res.status(404).json({ error: 'Invoice not found' })
    await prisma.invoice.delete({ where: { id } })
    res.status(204).send()
  } catch (err) {
    next(err)
  }
}
