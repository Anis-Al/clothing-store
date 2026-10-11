-- CreateTable
CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "storeName" TEXT NOT NULL DEFAULT '',
    "taglineFr" TEXT NOT NULL DEFAULT '',
    "taglineAr" TEXT NOT NULL DEFAULT '',
    "heroTitleFr" TEXT NOT NULL DEFAULT '',
    "heroTitleAr" TEXT NOT NULL DEFAULT '',
    "heroImage" TEXT NOT NULL DEFAULT '',
    "shippingTextFr" TEXT NOT NULL DEFAULT '',
    "shippingTextAr" TEXT NOT NULL DEFAULT '',
    "whatsapp" TEXT NOT NULL DEFAULT '',
    "deliveryFee" INTEGER NOT NULL DEFAULT 0,
    "lowStock" INTEGER NOT NULL DEFAULT 3
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "totalAmount" INTEGER NOT NULL,
    "shippingFee" INTEGER NOT NULL DEFAULT 0,
    "fullName" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "wilaya" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("address", "createdAt", "fullName", "id", "phone", "status", "totalAmount", "userId", "wilaya") SELECT "address", "createdAt", "fullName", "id", "phone", "status", "totalAmount", "userId", "wilaya" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- The single Réglages row (all defaults).
INSERT INTO "Settings" ("id") VALUES (1);
