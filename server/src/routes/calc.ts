import { Router } from 'express'
import { compute } from '../controllers/calc'

export const router = Router()
router.post('/compute', compute)
