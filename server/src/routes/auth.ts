import { Router } from 'express'
import * as ctrl from '../controllers/auth'
import { requireAuth } from '../middleware/auth'

export const router = Router()

router.post('/register', ctrl.register)
router.post('/login', ctrl.login)
router.post('/logout', ctrl.logout)
router.get('/me', requireAuth, ctrl.me)
router.post('/request-reset', ctrl.requestReset)
router.post('/reset-password', ctrl.resetPassword)
router.post('/change-password', requireAuth, ctrl.changePassword)
