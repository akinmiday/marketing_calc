import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { prisma } from '../services/prisma'
import { CalcInput, computeCalculator } from '../utils/totals'

const ReceiptCreateSchema = z.object({
  label: z.string().optional(),
  input: CalcInput,
})

const ReceiptUpdateSchema = z.object({
  label: z.string().optional(),
  input: CalcInput.optional(),
})

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' })
    const q = String(req.query.q || '').toLowerCase()
    const items = await prisma.receipt.findMany({
      where: { userId: req.user.id },
      orderBy: { receiptNumber: 'desc' },
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
    const item = await prisma.receipt.findFirst({ where: { id, userId: req.user.id } })
    if (!item) return res.status(404).json({ error: 'Receipt not found' })
    res.json({
      ...item,
      payload: ((): any => {
        try {
          return JSON.parse(item.payload as any)
        } catch {
          return item.payload
        }
      })(),
    })
  } catch (err) {
    next(err)
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' })
    const body = ReceiptCreateSchema.parse(req.body)
    const results = computeCalculator(body.input)
    const payloadObj = { input: body.input, results }
    const created = await prisma.$transaction(async (tx) => {
      const last = await tx.receipt.findFirst({
        where: { userId: req.user!.id },
        orderBy: { receiptNumber: 'desc' },
        select: { receiptNumber: true },
      })
      const nextReceiptNumber = (last?.receiptNumber ?? 0) + 1
      return tx.receipt.create({
        data: {
          label: body.label,
          payload: JSON.stringify(payloadObj),
          userId: req.user!.id,
          receiptNumber: nextReceiptNumber,
        },
      })
    })
    res.status(201).json({ ...created, payload: payloadObj })
  } catch (err) {
    next(err)
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' })
    const { id } = req.params
    const body = ReceiptUpdateSchema.parse(req.body)
    const found = await prisma.receipt.findFirst({ where: { id, userId: req.user.id } })
    if (!found) return res.status(404).json({ error: 'Receipt not found' })
    let payload: any = JSON.parse(found.payload as any)
    if (body.input) {
      const results = computeCalculator(body.input)
      payload = { input: body.input, results }
    }
    const updated = await prisma.receipt.update({
      where: { id },
      data: {
        label: body.label ?? found.label,
        payload: JSON.stringify(payload),
      },
    })
    res.json({ ...updated, payload })
  } catch (err) {
    next(err)
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' })
    const { id } = req.params
    const existing = await prisma.receipt.findFirst({ where: { id, userId: req.user.id } })
    if (!existing) return res.status(404).json({ error: 'Receipt not found' })
    await prisma.receipt.delete({ where: { id } })
    res.status(204).send()
  } catch (err) {
    next(err)
  }
}
