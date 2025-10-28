import { Router } from 'express'
import * as ctrl from '../controllers/receipts'
import { requireAuth } from '../middleware/auth'

export const router = Router()

router.use(requireAuth)
router.get('/', ctrl.list)
router.get('/:id', ctrl.getOne)
router.post('/', ctrl.create)
router.put('/:id', ctrl.update)
router.delete('/:id', ctrl.remove)
