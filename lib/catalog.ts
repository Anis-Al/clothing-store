import type { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { unique } from "@/lib/utils"

export type Filters = { q?: string; category?: string; size?: string; color?: string; sort?: string }

export async function getProducts(f: Filters = {}, take?: number) {
  const variant = { ...(f.size && { size: f.size }), ...(f.color && { color: f.color }) }
  const where: Prisma.ProductWhereInput = {
    ...(f.q && { name: { contains: f.q } }),
    ...(f.category && { category: inCategory(f.category) }),
    ...(Object.keys(variant).length && { variants: { some: variant } }),
  }
  const rows = await db.product.findMany({
    where,
    take,
    orderBy: { createdAt: "desc" },
    include: { category: true, variants: true, images: { take: 1 } },
  })
  const out = rows.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    category: p.category.name,
    image: p.images[0]?.url,
    colors: unique(p.variants.map((v) => v.color)),
    minPrice: Math.min(...p.variants.map((v) => v.price)),
    soldOut: p.variants.every((v) => v.stockCount === 0),
  }))
  // ponytail: price sort in JS (min variant price isn't a column); fine for a few hundred products
  if (f.sort === "price-asc") out.sort((a, b) => a.minPrice - b.minPrice)
  if (f.sort === "price-desc") out.sort((a, b) => b.minPrice - a.minPrice)
  // Sold-out last. sort() is stable, so the order above holds inside each group.
  return out.sort((a, b) => Number(a.soldOut) - Number(b.soldOut))
}

export type ProductCardData = Awaited<ReturnType<typeof getProducts>>[number]

// ?category=<slug> on a main category covers its sub-categories too.
const inCategory = (slug: string) => ({ OR: [{ slug }, { parent: { slug } }] }) satisfies Prisma.CategoryWhereInput

// Storefront menus list only categories that have products (directly or through a sub-category):
// an empty one would be a dead end.
const HAS_PRODUCTS = { products: { some: {} } } satisfies Prisma.CategoryWhereInput
export const SHOWN_CATEGORY = { OR: [HAS_PRODUCTS, { children: { some: HAS_PRODUCTS } }] } satisfies Prisma.CategoryWhereInput

// Main categories with their non-empty sub-categories, for the navbar and the catalog filters.
export const getShownCategories = () =>
  db.category.findMany({
    where: { parentId: null, ...SHOWN_CATEGORY },
    orderBy: { name: "asc" },
    include: { children: { where: HAS_PRODUCTS, orderBy: { name: "asc" } } },
  })

export type CategoryTree = Awaited<ReturnType<typeof getShownCategories>>

// Sizes/colors only from the selected category, so pants sizes don't show on shirts.
export async function getFacets(category?: string) {
  const [categories, variants] = await Promise.all([
    getShownCategories(),
    db.productVariant.findMany({
      where: category ? { product: { category: inCategory(category) } } : {},
      select: { size: true, color: true },
      distinct: ["size", "color"],
    }),
  ])
  return { categories, sizes: unique(variants.map((v) => v.size)), colors: unique(variants.map((v) => v.color)) }
}
