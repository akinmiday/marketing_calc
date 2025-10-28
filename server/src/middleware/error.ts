import type { Request, Response, NextFunction } from 'express'

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: 'Not found' })
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  console.error(err)
  const status = err?.status ?? 500
  const message = err?.message ?? 'Internal server error'
  res.status(status).json({ error: message })
}
