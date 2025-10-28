import { Router } from 'express'
import { router as receipts } from './receipts'
import { router as invoices } from './invoices'
import { router as calc } from './calc'
import { router as health } from './health'
import { router as auth } from './auth'

export const router = Router()

router.use('/auth', auth)
router.use('/health', health)
router.use('/receipts', receipts)
router.use('/invoices', invoices)
router.use('/calc', calc)
