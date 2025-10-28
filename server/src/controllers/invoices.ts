import { Request, Response, NextFunction } from 'express'
import { prisma } from '../services/prisma'
import { InvoiceData, computeInvoiceTotals } from '../utils/totals'
import { z } from 'zod'

const InvoiceCreateSchema = z.object({
  label: z.string().optional(),
  usdRate: z.number().optional(),
  invoice: InvoiceData
})

const InvoiceUpdateSchema = z.object({
  label: z.string().optional(),
  usdRate: z.number().optional(),
  invoice: InvoiceData.optional()
})

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const q = String(req.query.q || '').toLowerCase()
    const items = await prisma.invoice.findMany({ orderBy: { createdAt: 'desc' } })
    const filtered = q ? items.filter(i => (i.label || '').toLowerCase().includes(q)) : items
    res.json(filtered.map(i => ({
      ...i,
      payload: ((): any => { try { return JSON.parse(i.payload as any) } catch { return i.payload } })(),
      totals: ((): any => { try { return JSON.parse(i.totals as any) } catch { return i.totals } })()
    })))
  } catch (err) { next(err) }
}

export async function getOne(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params
    const item = await prisma.invoice.findUnique({ where: { id } })
    if (!item) return res.status(404).json({ error: 'Invoice not found' })
    res.json({ ...item, payload: JSON.parse(item.payload as any), totals: JSON.parse(item.totals as any) })
  } catch (err) { next(err) }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const body = InvoiceCreateSchema.parse(req.body)
    const totals = computeInvoiceTotals(body.invoice)
    const created = await prisma.invoice.create({
      data: {
        label: body.label,
        usdRate: body.usdRate,
        payload: JSON.stringify(body.invoice),
        totals: JSON.stringify(totals)
      }
    })
    res.status(201).json({ ...created, payload: body.invoice, totals })
  } catch (err) { next(err) }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params
    const body = InvoiceUpdateSchema.parse(req.body)
    const found = await prisma.invoice.findUnique({ where: { id } })
    if (!found) return res.status(404).json({ error: 'Invoice not found' })
    const invoice = body.invoice ?? JSON.parse(found.payload as any)
    const totals = computeInvoiceTotals(invoice)
    const updated = await prisma.invoice.update({
      where: { id },
      data: {
        label: body.label ?? found.label,
        usdRate: body.usdRate ?? found.usdRate ?? undefined,
        payload: JSON.stringify(invoice),
        totals: JSON.stringify(totals)
      }
    })
    res.json({ ...updated, payload: invoice, totals })
  } catch (err) { next(err) }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try { const { id } = req.params; await prisma.invoice.delete({ where: { id } }); res.status(204).send() }
  catch (err) { next(err) }
}
