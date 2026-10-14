import NextAuth, { CredentialsSignin, type DefaultSession } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"

declare module "next-auth" {
  interface User { role?: string }
  interface Session { user: { id: string; role: string } & DefaultSession["user"] }
}

// Brute-force guard: 10 wrong passwords, each within 15 minutes of the last, lock that username for 15 minutes.
// Only existing admins are tracked, so the map can't grow. The login action shows t.auth.locked for this code.
// ponytail: in memory (one process, cleared on restart). Someone can keep the admin locked out by failing on
// purpose; if that happens, rate-limit /login per IP in the reverse proxy instead.
const fails = new Map<string, { n: number; until: number }>()
const LOCK_TRIES = 10
const LOCK_MS = 15 * 60_000
class Locked extends CredentialsSignin {
  code = "locked"
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { username: {}, password: {} },
      async authorize(c) {
        // Plain username + password, no format rules.
        const username = String(c?.username ?? "").trim()
        const f = fails.get(username)
        const recent = f && Date.now() < f.until ? f.n : 0
        if (recent >= LOCK_TRIES) throw new Locked()
        const user = username && (await db.user.findUnique({ where: { username } }))
        // Only admins sign in: customers check out as guests and have no accounts.
        if (!user || user.role !== "ADMIN") return null
        if (!(await bcrypt.compare(String(c?.password ?? ""), user.passwordHash))) {
          fails.set(username, { n: recent + 1, until: Date.now() + LOCK_MS })
          return null
        }
        fails.delete(username)
        return { id: user.id, name: user.username, role: user.role }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) Object.assign(token, { id: user.id, role: user.role })
      return token
    },
    session({ session, token }) {
      session.user.id = token.id as string
      session.user.role = token.role as string
      return session
    },
  },
})

export async function requireAdmin() {
  const session = await auth()
  if (session?.user.role !== "ADMIN") throw new Error("Accès refusé")
  return session
}
