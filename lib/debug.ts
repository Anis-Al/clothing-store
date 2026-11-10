import { cookies } from "next/headers"

// Debug mode (Odoo-style): `?debug=1` on any admin URL turns it on, `?debug=0` turns it off. proxy.ts keeps the choice
// in the `debug` cookie (and redirects once so the very page that asked already sees it). Réglages only exists in debug
// mode: its menu entry and its pages are hidden for the shop's everyday admin. Not a security boundary: any admin
// can type `?debug=1`; it hides technical settings, it doesn't protect them.
export const DEBUG_COOKIE = "debug"

export async function isDebug(sp?: Record<string, string | string[] | undefined>) {
  if (sp?.debug === "0") return false
  return sp?.debug === "1" || (await cookies()).get(DEBUG_COOKIE)?.value === "1"
}
