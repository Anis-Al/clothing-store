-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "method" TEXT NOT NULL DEFAULT 'HOME',
    "stopDeskId" TEXT,
    "totalAmount" INTEGER NOT NULL,
    "shippingFee" INTEGER NOT NULL DEFAULT 0,
    "fullName" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "wilaya" TEXT NOT NULL DEFAULT '',
    "commune" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "courier" TEXT NOT NULL DEFAULT '',
    "tracking" TEXT NOT NULL DEFAULT '',
    "labelUrl" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_stopDeskId_fkey" FOREIGN KEY ("stopDeskId") REFERENCES "StopDesk" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("address", "commune", "createdAt", "fullName", "id", "labelUrl", "method", "note", "phone", "shippingFee", "status", "stopDeskId", "totalAmount", "tracking", "userId", "wilaya") SELECT "address", "commune", "createdAt", "fullName", "id", "labelUrl", "method", "note", "phone", "shippingFee", "status", "stopDeskId", "totalAmount", "tracking", "userId", "wilaya" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE TABLE "new_Settings" (
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
    "storeAddress" TEXT NOT NULL DEFAULT '',
    "pickupEnabled" BOOLEAN NOT NULL DEFAULT false,
    "stopdeskEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lowStock" INTEGER NOT NULL DEFAULT 3,
    "courier" TEXT NOT NULL DEFAULT '',
    "courierKeys" TEXT NOT NULL DEFAULT '',
    "courierFromWilaya" TEXT NOT NULL DEFAULT ''
);
INSERT INTO "new_Settings" ("deliveryFee", "heroImage", "heroTitleAr", "heroTitleFr", "id", "lowStock", "pickupEnabled", "shippingTextAr", "shippingTextFr", "stopdeskEnabled", "storeAddress", "storeName", "taglineAr", "taglineFr", "whatsapp") SELECT "deliveryFee", "heroImage", "heroTitleAr", "heroTitleFr", "id", "lowStock", "pickupEnabled", "shippingTextAr", "shippingTextFr", "stopdeskEnabled", "storeAddress", "storeName", "taglineAr", "taglineFr", "whatsapp" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
CREATE TABLE "new_StopDesk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "wilaya" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "commune" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "fee" INTEGER NOT NULL,
    "deskId" TEXT NOT NULL DEFAULT ''
);
INSERT INTO "new_StopDesk" ("address", "commune", "fee", "id", "name", "wilaya") SELECT "address", "commune", "fee", "id", "name", "wilaya" FROM "StopDesk";
DROP TABLE "StopDesk";
ALTER TABLE "new_StopDesk" RENAME TO "StopDesk";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

