import { NextFunction, Request, Response } from 'express'
import { ZodSchema } from 'zod'

export function validate(schema: ZodSchema<any>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const input = req.method === 'GET' || req.method === 'DELETE' ? req.query : req.body
    const parsed = schema.safeParse(input)
    if (!parsed.success) {
      const issues = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
      return next({ status: 400, message: `Validation failed: ${issues}` })
    }
    if (req.method === 'GET' || req.method === 'DELETE') {
      req.query = parsed.data
    } else {
      req.body = parsed.data
    }
    next()
  }
}
