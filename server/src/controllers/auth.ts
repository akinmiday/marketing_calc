import type { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import jwt, { Secret, SignOptions } from 'jsonwebtoken'
import crypto from 'crypto'
import { prisma } from '../services/prisma'
import { hashPassword, verifyPassword } from '../utils/password'
import { env } from '../config/env'

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const RequestResetSchema = z.object({
  email: z.string().email(),
})

const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
})

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
})

function signToken(userId: string, email: string) {
  const options: SignOptions = { expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'] }
  return jwt.sign({ sub: userId, email }, env.JWT_SECRET as Secret, options)
}

function toPublicUser(user: { id: string; email: string; createdAt: Date; updatedAt: Date }) {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const input = RegisterSchema.parse(req.body)
    const email = input.email.toLowerCase()
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' })
    }

    const passwordHash = await hashPassword(input.password)
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
      },
    })
    const token = signToken(user.id, user.email)
    res.status(201).json({ token, user: toPublicUser(user) })
  } catch (err) {
    next(err)
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const input = LoginSchema.parse(req.body)
    const email = input.email.toLowerCase()
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }
    const valid = await verifyPassword(input.password, user.passwordHash)
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }
    const token = signToken(user.id, user.email)
    res.json({ token, user: toPublicUser(user) })
  } catch (err) {
    next(err)
  }
}

export async function logout(_req: Request, res: Response) {
  res.json({ success: true })
}

export async function me(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' })
  }
  res.json({ user: req.user })
}

export async function requestReset(req: Request, res: Response, next: NextFunction) {
  try {
    const input = RequestResetSchema.parse(req.body)
    const email = input.email.toLowerCase()
    const user = await prisma.user.findUnique({ where: { email } })

    if (!user) {
      return res.json({ success: true, message: 'If the account exists, a reset link has been generated.' })
    }

    const rawToken = crypto.randomBytes(32).toString('hex')
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex')
    const expiresAt = new Date(Date.now() + env.RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000)

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: hashedToken,
        resetTokenExpiresAt: expiresAt,
      },
    })

    const response: Record<string, unknown> = {
      success: true,
      message: 'Password reset token created.',
    }

    if (env.NODE_ENV !== 'production') {
      response.token = rawToken
    }

    res.json(response)
  } catch (err) {
    next(err)
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const input = ResetPasswordSchema.parse(req.body)
    const hashedToken = crypto.createHash('sha256').update(input.token).digest('hex')
    const now = new Date()

    const user = await prisma.user.findFirst({
      where: {
        resetToken: hashedToken,
        resetTokenExpiresAt: {
          gt: now,
        },
      },
    })

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' })
    }

    const passwordHash = await hashPassword(input.password)

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExpiresAt: null,
      },
    })

    res.json({ success: true })
  } catch (err) {
    next(err)
  }
}

export async function changePassword(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' })
    const input = ChangePasswordSchema.parse(req.body)
    const user = await prisma.user.findUnique({ where: { id: req.user.id } })
    if (!user) return res.status(401).json({ error: 'Authentication required' })
    const matches = await verifyPassword(input.currentPassword, user.passwordHash)
    if (!matches) {
      return res.status(400).json({ error: 'Current password is incorrect' })
    }
    if (input.currentPassword === input.newPassword) {
      return res.status(400).json({ error: 'New password must be different' })
    }
    const passwordHash = await hashPassword(input.newPassword)
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    })
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
}
