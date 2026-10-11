// Consistent copy of the live SQLite DB (safe while the app runs):  npx tsx scripts/backup.mts
// Writes prisma/backups/store-YYYY-MM-DD-HHMM.db (inside the DB volume when run in Docker).
import { mkdirSync } from "node:fs"
import path from "node:path"
import { PrismaClient } from "@prisma/client"

const dir = path.resolve("prisma/backups")
mkdirSync(dir, { recursive: true })
const file = path.join(dir, `store-${new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-")}.db`)

const prisma = new PrismaClient()
await prisma.$executeRawUnsafe(`VACUUM INTO '${file.replace(/'/g, "''")}'`)
console.log(file)
await prisma.$disconnect()
