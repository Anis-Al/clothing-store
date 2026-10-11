// Create an admin or change its password:  npx tsx scripts/admin.mts <username> <password>
import bcrypt from "bcryptjs"
import { PrismaClient } from "@prisma/client"

const [username, password] = process.argv.slice(2)
if (!username || !password) {
  console.error("Usage: npx tsx scripts/admin.mts <username> <password>")
  process.exit(1)
}

const prisma = new PrismaClient()
const passwordHash = await bcrypt.hash(password, 10)
await prisma.user.upsert({
  where: { username },
  update: { passwordHash, role: "ADMIN" },
  create: { username, passwordHash, role: "ADMIN" },
})
console.log(`Admin "${username}" saved.`)
await prisma.$disconnect()
