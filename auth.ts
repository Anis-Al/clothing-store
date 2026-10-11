import NextAuth, { type DefaultSession } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"

declare module "next-auth" {
  interface User { role?: string }
  interface Session { user: { id: string; role: string } & DefaultSession["user"] }
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
        const user = username && (await db.user.findUnique({ where: { username } }))
        // Only admins sign in: customers check out as guests and have no accounts.
        if (!user || user.role !== "ADMIN" || !(await bcrypt.compare(String(c?.password ?? ""), user.passwordHash))) return null
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
