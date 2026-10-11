import { NextResponse } from "next/server"
import { auth } from "@/auth"

// First gate for /admin. Admin pages and actions re-check with requireAdmin().
export default auth((req) => {
  if (req.auth?.user.role === "ADMIN") return
  const url = new URL("/login", req.nextUrl)
  url.searchParams.set("callbackUrl", req.nextUrl.pathname)
  return NextResponse.redirect(url)
})

export const config = { matcher: ["/admin/:path*"] }
