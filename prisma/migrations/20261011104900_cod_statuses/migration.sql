-- OrderStatus: PENDING, PAID, SHIPPED → PENDING, CONFIRMED, SHIPPED, DELIVERED, CANCELLED.
-- SQLite stores the enum as TEXT, so no DDL: only rows using the removed value change.
-- PAID meant "money received", which for cash on delivery is a delivered order.
UPDATE "Order" SET "status" = 'DELIVERED' WHERE "status" = 'PAID';
