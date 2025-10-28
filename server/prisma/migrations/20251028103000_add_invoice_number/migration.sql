/*
  Warnings:

  - Added the required column `invoiceNumber` to the `Invoice` table without a default value. This is not possible if the table is not empty.
*/
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "label" TEXT,
    "usdRate" REAL,
    "payload" TEXT NOT NULL,
    "totals" TEXT NOT NULL,
    "invoiceNumber" INTEGER NOT NULL DEFAULT 0,
    "userId" TEXT NOT NULL,
    CONSTRAINT "Invoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_Invoice" ("createdAt", "id", "label", "payload", "totals", "updatedAt", "usdRate", "userId")
SELECT "createdAt", "id", "label", "payload", "totals", "updatedAt", "usdRate", "userId" FROM "Invoice";

DROP TABLE "Invoice";
ALTER TABLE "new_Invoice" RENAME TO "Invoice";

CREATE INDEX "Invoice_userId_idx" ON "Invoice"("userId");

-- Populate sequential invoice numbers per user (1-based in creation order)
UPDATE "Invoice"
SET "invoiceNumber" = (
  SELECT (
    SELECT COUNT(*)
    FROM "Invoice" AS "i2"
    WHERE "i2"."userId" = "Invoice"."userId"
      AND (
        "i2"."createdAt" < "Invoice"."createdAt"
        OR ("i2"."createdAt" = "Invoice"."createdAt" AND "i2"."id" <= "Invoice"."id")
      )
  )
);

CREATE UNIQUE INDEX "Invoice_userId_invoiceNumber_key" ON "Invoice"("userId", "invoiceNumber");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
