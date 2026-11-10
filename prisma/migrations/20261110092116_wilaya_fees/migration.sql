-- CreateTable
CREATE TABLE "WilayaFee" (
    "wilaya" TEXT NOT NULL PRIMARY KEY,
    "home" INTEGER NOT NULL,
    "desk" INTEGER NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "storeAddress" TEXT NOT NULL DEFAULT '',
    "pickupEnabled" BOOLEAN NOT NULL DEFAULT false,
    "stopdeskEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lowStock" INTEGER NOT NULL DEFAULT 3,
    "courier" TEXT NOT NULL DEFAULT '',
    "courierKeys" TEXT NOT NULL DEFAULT '',
    "courierFromWilaya" TEXT NOT NULL DEFAULT ''
);
INSERT INTO "new_Settings" ("courier", "courierFromWilaya", "courierKeys", "heroImage", "heroTitleAr", "heroTitleFr", "id", "lowStock", "pickupEnabled", "shippingTextAr", "shippingTextFr", "stopdeskEnabled", "storeAddress", "storeName", "taglineAr", "taglineFr", "whatsapp") SELECT "courier", "courierFromWilaya", "courierKeys", "heroImage", "heroTitleAr", "heroTitleFr", "id", "lowStock", "pickupEnabled", "shippingTextAr", "shippingTextFr", "stopdeskEnabled", "storeAddress", "storeName", "taglineAr", "taglineFr", "whatsapp" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
CREATE TABLE "new_StopDesk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "wilaya" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "commune" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "deskId" TEXT NOT NULL DEFAULT ''
);
INSERT INTO "new_StopDesk" ("address", "commune", "deskId", "id", "name", "wilaya") SELECT "address", "commune", "deskId", "id", "name", "wilaya" FROM "StopDesk";
DROP TABLE "StopDesk";
ALTER TABLE "new_StopDesk" RENAME TO "StopDesk";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

