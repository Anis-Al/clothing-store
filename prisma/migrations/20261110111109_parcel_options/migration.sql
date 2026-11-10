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
    "storeWilaya" TEXT NOT NULL DEFAULT '',
    "storeCommune" TEXT NOT NULL DEFAULT '',
    "storeAddress" TEXT NOT NULL DEFAULT '',
    "homeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pickupEnabled" BOOLEAN NOT NULL DEFAULT false,
    "stopdeskEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lowStock" INTEGER NOT NULL DEFAULT 3,
    "courier" TEXT NOT NULL DEFAULT '',
    "courierKeys" TEXT NOT NULL DEFAULT '',
    "courierFromWilaya" TEXT NOT NULL DEFAULT '',
    "parcelOpenable" BOOLEAN NOT NULL DEFAULT false,
    "parcelInsured" BOOLEAN NOT NULL DEFAULT false,
    "parcelWeightKg" REAL NOT NULL DEFAULT 0
);
INSERT INTO "new_Settings" ("courier", "courierFromWilaya", "courierKeys", "heroImage", "heroTitleAr", "heroTitleFr", "homeEnabled", "id", "lowStock", "pickupEnabled", "shippingTextAr", "shippingTextFr", "stopdeskEnabled", "storeAddress", "storeCommune", "storeName", "storeWilaya", "taglineAr", "taglineFr", "whatsapp") SELECT "courier", "courierFromWilaya", "courierKeys", "heroImage", "heroTitleAr", "heroTitleFr", "homeEnabled", "id", "lowStock", "pickupEnabled", "shippingTextAr", "shippingTextFr", "stopdeskEnabled", "storeAddress", "storeCommune", "storeName", "storeWilaya", "taglineAr", "taglineFr", "whatsapp" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
