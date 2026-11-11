import type { MetadataRoute } from "next"
import { siteUrl } from "@/lib/site"

// /admin, /login and /merci are unlinked and noindex: listing them here would only advertise them.
export default async function robots(): Promise<MetadataRoute.Robots> {
  return { rules: { userAgent: "*", disallow: "/cart" }, sitemap: new URL("/sitemap.xml", await siteUrl()).href }
}
