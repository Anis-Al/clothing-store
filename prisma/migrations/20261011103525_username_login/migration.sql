-- Admin logs in with a plain username instead of an email. Rename keeps existing rows.
ALTER TABLE "User" RENAME COLUMN "email" TO "username";
DROP INDEX "User_email_key";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
-- The seeded admin becomes "admin".
UPDATE "User" SET "username" = 'admin' WHERE "username" = 'admin@store.local';
