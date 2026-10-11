#!/bin/sh
set -e
mkdir -p /app/prisma /app/public/uploads

# AUTH_SECRET: taken from the environment, else generated once and kept in the DB volume.
if [ -z "$AUTH_SECRET" ]; then
  f=/app/prisma/.auth-secret
  [ -f "$f" ] || node -e "console.log(require('crypto').randomBytes(32).toString('base64'))" > "$f"
  export AUTH_SECRET="$(cat "$f")"
fi

npx prisma migrate deploy --schema db/schema.prisma
npx tsx db/seed.ts # idempotent: admin always, demo categories + products only into an empty store
exec node node_modules/next/dist/bin/next start
