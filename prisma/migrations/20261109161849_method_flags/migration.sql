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
    "deliveryFee" INTEGER NOT NULL DEFAULT 0,
    "storeAddress" TEXT NOT NULL DEFAULT '',
    "pickupEnabled" BOOLEAN NOT NULL DEFAULT false,
    "stopdeskEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lowStock" INTEGER NOT NULL DEFAULT 3
);
INSERT INTO "new_Settings" ("deliveryFee", "heroImage", "heroTitleAr", "heroTitleFr", "id", "lowStock", "shippingTextAr", "shippingTextFr", "storeName", "taglineAr", "taglineFr", "whatsapp") SELECT "deliveryFee", "heroImage", "heroTitleAr", "heroTitleFr", "id", "lowStock", "shippingTextAr", "shippingTextFr", "storeName", "taglineAr", "taglineFr", "whatsapp" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

