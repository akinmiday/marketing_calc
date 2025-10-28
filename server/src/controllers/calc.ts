import { Request, Response, NextFunction } from 'express'
import { CalcInput, computeCalculator } from '../utils/totals'

export async function compute(req: Request, res: Response, next: NextFunction) {
  try {
    const data = CalcInput.parse(req.body)
    const results = computeCalculator(data)
    res.json({ input: data, results })
  } catch (err) {
    next(err)
  }
}
