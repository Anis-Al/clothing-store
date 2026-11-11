import "server-only"
import { headers } from "next/headers"

// The store's public origin, for absolute URLs in Open Graph tags (WhatsApp / Facebook need them): SITE_URL when set,
// else the request's own host (works on a bare IP demo and behind Caddy, which sets x-forwarded-proto).
export async function siteUrl() {
  const env = process.env.SITE_URL?.trim().replace(/\/+$/, "")
  if (env) return new URL(env)
  const h = await headers()
  return new URL(`${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`)
}

// Open Graph image URL: the upload resized by Next's image route (≤ 1200px, so WhatsApp's size cap isn't hit).
// The optimizer refuses SVG (the demo seed's silhouettes): those go out as they are.
export const ogImage = (url: string) => (url.endsWith(".svg") ? url : `/_next/image?url=${encodeURIComponent(url)}&w=1200&q=75`)
