import type { MetadataRoute } from "next"
import { SHOWN_CATEGORY } from "@/lib/catalog"
import { db } from "@/lib/db"
import { siteUrl } from "@/lib/site"

// Home, the catalog, every category shown in the shop (as ?category=<slug>, the canonical of those pages) and every
// product that still has a variant. Read at request time (no build-time list of products).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [base, categories, products] = await Promise.all([
    siteUrl(),
    db.category.findMany({ where: SHOWN_CATEGORY, select: { slug: true } }),
    db.product.findMany({ where: { variants: { some: {} } }, select: { slug: true, createdAt: true } }),
  ])
  const url = (path: string) => new URL(path, base).href
  return [
    { url: url("/"), changeFrequency: "daily", priority: 1 },
    { url: url("/products"), changeFrequency: "daily", priority: 0.8 },
    ...categories.map((c) => ({ url: url(`/products?category=${c.slug}`), changeFrequency: "weekly" as const, priority: 0.6 })),
    ...products.map((p) => ({ url: url(`/products/${p.slug}`), lastModified: p.createdAt, changeFrequency: "weekly" as const, priority: 0.7 })),
  ]
}
