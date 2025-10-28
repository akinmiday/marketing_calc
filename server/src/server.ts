import { createApp } from './app/createApp'
import { env } from './config/env'
import { prisma } from './services/prisma'

async function main() {
  try {
    await prisma.$connect()
    const app = createApp()
    app.listen(env.PORT, () => {
      console.log(`Server listening on http://localhost:${env.PORT}`)
    })
  } catch (err) {
    console.error('Failed to start server:', err)
    process.exit(1)
  }
}

main()
