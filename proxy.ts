import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { DEBUG_COOKIE } from "@/lib/debug"

// First gate for /admin. Admin pages and actions re-check with requireAdmin().
// Then debug mode (lib/debug.ts): ?debug=1 / ?debug=0 sets / clears the cookie, with one redirect to the same URL so
// the layout (which can't read search params) already shows the right menu.
export default auth((req) => {
  if (req.auth?.user.role !== "ADMIN") {
    const url = new URL("/login", req.nextUrl)
    url.searchParams.set("callbackUrl", req.nextUrl.pathname)
    return NextResponse.redirect(url)
  }
  const want = req.nextUrl.searchParams.get("debug")
  const on = req.cookies.get(DEBUG_COOKIE)?.value === "1"
  if (req.method !== "GET" || !((want === "1" && !on) || (want === "0" && on))) return
  const res = NextResponse.redirect(req.nextUrl)
  if (want === "1") res.cookies.set(DEBUG_COOKIE, "1", { path: "/admin", httpOnly: true, sameSite: "lax" })
  else res.cookies.delete({ name: DEBUG_COOKIE, path: "/admin" })
  return res
})

export const config = { matcher: ["/admin/:path*"] }
