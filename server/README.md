# Marketing Calculator — Node/Express/TypeScript Backend (SQLite‑safe)

Matches your `server.ts` + `createApp.ts` pattern. Prisma + SQLite, Zod validation, receipts/invoices CRUD, compute endpoints.

## Quickstart (npm)
```bash
npm i
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

## Notes
- JSON-like fields are stored as TEXT in SQLite and parsed in controllers (SQLite lacks Prisma `Json` type).
- For real JSON columns, switch to Postgres/MySQL and revert `payload`/`totals` to `Json` in `prisma/schema.prisma`.
