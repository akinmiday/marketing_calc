import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import morgan from 'morgan'
import { env } from '../config/env'
import { errorHandler, notFound } from '../middleware/error'
import { router as api } from '../routes'

export function createApp() {
  const app = express()
  app.use(helmet())
  app.use(express.json({ limit: '1mb' }))
  app.use(express.urlencoded({ extended: true }))
  app.use(compression())
  app.use(morgan('dev'))
  app.use(cors({ origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
    if (!origin) return cb(null, true)
    if (env.CORS_ARRAY.length === 0 || env.CORS_ARRAY.includes(origin)) return cb(null, true)
    return cb(new Error('Not allowed by CORS'))
  }, credentials: true }))

  app.get('/health', (_req, res) => res.json({ status: 'ok' }))
  app.use('/api/v1', api)

  app.use(notFound)
  app.use(errorHandler)

  return app
}
