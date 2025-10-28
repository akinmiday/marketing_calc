-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Receipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "label" TEXT,
    "payload" TEXT NOT NULL,
    "receiptNumber" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "Receipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Receipt" ("createdAt", "id", "label", "payload", "receiptNumber", "updatedAt", "userId") SELECT "createdAt", "id", "label", "payload", "receiptNumber", "updatedAt", "userId" FROM "Receipt";
DROP TABLE "Receipt";
ALTER TABLE "new_Receipt" RENAME TO "Receipt";
CREATE INDEX "Receipt_userId_idx" ON "Receipt"("userId");
CREATE UNIQUE INDEX "Receipt_userId_receiptNumber_key" ON "Receipt"("userId", "receiptNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
