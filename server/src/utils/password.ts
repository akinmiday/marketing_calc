import bcrypt from 'bcryptjs'

const SALT_ROUNDS = 10

export function hashPassword(password: string) {
  return bcrypt.hash(password, SALT_ROUNDS)
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash)
}
