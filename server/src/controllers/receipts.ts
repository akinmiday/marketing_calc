import { Request, Response, NextFunction } from 'express'
import { prisma } from '../services/prisma'
import { CalcInput, computeCalculator } from '../utils/totals'
import { z } from 'zod'

const ReceiptCreateSchema = z.object({
  label: z.string().optional(),
  input: CalcInput
})

const ReceiptUpdateSchema = z.object({
  label: z.string().optional(),
  input: CalcInput.optional()
})

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const q = String(req.query.q || '').toLowerCase()
    const items = await prisma.receipt.findMany({ orderBy: { createdAt: 'desc' } })
    const filtered = q ? items.filter(i => (i.label || '').toLowerCase().includes(q)) : items
    res.json(filtered.map(i => ({ ...i, payload: ((): any => { try { return JSON.parse(i.payload as any) } catch { return i.payload } })() })))
  } catch (err) { next(err) }
}

export async function getOne(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params
    const item = await prisma.receipt.findUnique({ where: { id } })
    if (!item) return res.status(404).json({ error: 'Receipt not found' })
    res.json({ ...item, payload: ((): any => { try { return JSON.parse(item.payload as any) } catch { return item.payload } })() })
  } catch (err) { next(err) }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const body = ReceiptCreateSchema.parse(req.body)
    const results = computeCalculator(body.input)
    const payloadObj = { input: body.input, results }
    const created = await prisma.receipt.create({
      data: { label: body.label, payload: JSON.stringify(payloadObj) }
    })
    res.status(201).json({ ...created, payload: payloadObj })
  } catch (err) { next(err) }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params
    const body = ReceiptUpdateSchema.parse(req.body)
    const found = await prisma.receipt.findUnique({ where: { id } })
    if (!found) return res.status(404).json({ error: 'Receipt not found' })
    let payload: any = JSON.parse(found.payload as any)
    if (body.input) {
      const results = computeCalculator(body.input)
      payload = { input: body.input, results }
    }
    const updated = await prisma.receipt.update({
      where: { id },
      data: { label: body.label ?? found.label, payload: JSON.stringify(payload) }
    })
    res.json({ ...updated, payload })
  } catch (err) { next(err) }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try { const { id } = req.params; await prisma.receipt.delete({ where: { id } }); res.status(204).send() }
  catch (err) { next(err) }
}
