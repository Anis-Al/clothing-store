"use server"
import { unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { OrderStatus, Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireAdmin } from "@/auth"
import { db } from "@/lib/db"
import { getSettings } from "@/lib/i18n"
import { MIME, UPLOAD_DIR } from "@/lib/uploads"
import { makeSku, slugify, stockDirection, unique } from "@/lib/utils"

// Every action re-checks the role: proxy.ts guards pages, not direct action calls.

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim()
const int = (f: FormData, k: string) => Math.max(0, Math.floor(Number(f.get(k)) || 0))
const list = (f: FormData, k: string) => unique(str(f, k).split(",").map((s) => s.trim()).filter(Boolean))
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
const done = () => revalidatePath("/", "layout")

function matrix(slug: string, f: FormData) {
  const price = int(f, "price")
  const stockCount = int(f, "stock")
  return list(f, "colors").flatMap((color) =>
    list(f, "sizes").map((size) => ({ color, size, price, stockCount, sku: makeSku(slug, color, size) })),
  )
}

// URL slug comes from the name, never typed: "Chemise en lin" → chemise-en-lin, then -2, -3… if taken.
// Products and categories both use it; neither slug changes on rename, so shared links keep working.
async function freeSlug(name: string, fallback: string, taken: (slug: string) => Promise<unknown>) {
  const base = slugify(name) || fallback
  for (let i = 1; ; i++) {
    const slug = i === 1 ? base : `${base}-${i}`
    if (!(await taken(slug))) return slug
  }
}

export async function createProduct(f: FormData) {
  await requireAdmin()
  const name = str(f, "name")
  if (!name || !str(f, "categoryId") || !matrix("x", f).length) redirect("/admin/products/new?error=required")
  const slug = await freeSlug(name, "produit", (slug) => db.product.findUnique({ where: { slug }, select: { id: true } }))
  const variants = matrix(slug, f)
  let id: string
  try {
    ;({ id } = await db.product.create({
      data: { name, slug, description: str(f, "description"), categoryId: str(f, "categoryId"), variants: { create: variants } },
    }))
  } catch (e) {
    if (isUnique(e)) redirect("/admin/products/new?error=duplicate")
    throw e
  }
  done()
  redirect(`/admin/products/${id}?saved=1`)
}

// Slug is left alone on edit so links already shared keep working.
// Saves product fields and every variant row (inputs named price_<id>, stock_<id>) in one submit.
export async function updateProduct(id: string, f: FormData) {
  await requireAdmin()
  const name = str(f, "name")
  if (!name) redirect(`/admin/products/${id}?error=required`)
  const variants = await db.productVariant.findMany({ where: { productId: id }, select: { id: true } })
  try {
    await db.$transaction([
      db.product.update({ where: { id }, data: { name, description: str(f, "description"), categoryId: str(f, "categoryId") } }),
      ...variants
        .filter((v) => f.has(`price_${v.id}`))
        .map((v) => db.productVariant.update({ where: { id: v.id }, data: { price: int(f, `price_${v.id}`), stockCount: int(f, `stock_${v.id}`) } })),
    ])
  } catch (e) {
    if (isUnique(e)) redirect(`/admin/products/${id}?error=duplicate`)
    throw e
  }
  done()
  redirect(`/admin/products/${id}?saved=1`)
}

export async function addVariants(id: string, f: FormData) {
  await requireAdmin()
  const p = await db.product.findUniqueOrThrow({ where: { id }, include: { variants: true } })
  const fresh = matrix(p.slug, f).filter((v) => !p.variants.some((x) => x.color === v.color && x.size === v.size))
  try {
    await db.productVariant.createMany({ data: fresh.map((v) => ({ ...v, productId: id })) })
  } catch (e) {
    if (isUnique(e)) redirect(`/admin/products/${id}?error=duplicate`)
    throw e
  }
  done()
  redirect(`/admin/products/${id}?saved=1`)
}

export async function deleteVariant(productId: string, variantId: string) {
  await requireAdmin()
  if (await db.orderItem.count({ where: { variantId } })) redirect(`/admin/products/${productId}?error=hasOrders`)
  await db.productVariant.delete({ where: { id: variantId } })
  done()
  redirect(`/admin/products/${productId}?saved=1`)
}

export async function deleteProduct(id: string) {
  await requireAdmin()
  if (await db.orderItem.count({ where: { variant: { productId: id } } })) redirect(`/admin/products/${id}?error=hasOrders`)
  const images = await db.image.findMany({ where: { productId: id } })
  await db.product.delete({ where: { id } })
  await Promise.all(images.map(removeFile))
  done()
  redirect("/admin/products")
}

const CATS = "/admin/settings/categories"
// ?open=<main category id> unfolds that group on the page (the others start folded after every save).

// Two levels max: a parent must be a main category (not itself), and a category with sub-categories stays main.
async function parentOk(id: string | null, parentId: string | null) {
  if (!parentId) return true
  const parent = await db.category.findUnique({ where: { id: parentId } })
  if (!parent || parent.parentId || parent.id === id) return false
  return !id || !(await db.category.count({ where: { parentId: id } }))
}

export async function createCategory(f: FormData) {
  await requireAdmin()
  const name = str(f, "name").slice(0, 60)
  const parentId = str(f, "parentId") || null
  if (!name) redirect(CATS)
  if (await db.category.findFirst({ where: { name } })) redirect(`${CATS}?error=catDuplicate`)
  if (!(await parentOk(null, parentId))) redirect(`${CATS}?error=catDepth`)
  const slug = await freeSlug(name, "categorie", (slug) => db.category.findUnique({ where: { slug }, select: { id: true } }))
  const { id } = await db.category.create({ data: { name, slug, parentId } })
  done()
  redirect(`${CATS}?saved=1&open=${parentId ?? id}`) // unfold the group it landed in
}

// Name and parent. The slug never changes, so /products?category=… links keep working.
export async function updateCategory(id: string, f: FormData) {
  await requireAdmin()
  const name = str(f, "name").slice(0, 60)
  const parentId = str(f, "parentId") || null
  const back = `${CATS}?open=${parentId ?? id}&`
  if (!name) redirect(back)
  if (await db.category.findFirst({ where: { name, id: { not: id } } })) redirect(`${back}error=catDuplicate`)
  if (!(await parentOk(id, parentId))) redirect(`${back}error=catDepth`)
  await db.category.update({ where: { id }, data: { name, parentId } })
  done()
  redirect(`${back}saved=1`)
}

// Only empty categories can go: products and sub-categories must be moved first (no silent cascade).
export async function deleteCategory(id: string) {
  await requireAdmin()
  if (await db.product.count({ where: { categoryId: id } })) redirect(`${CATS}?error=catHasProducts`)
  if (await db.category.count({ where: { parentId: id } })) redirect(`${CATS}?error=catHasChildren`)
  const { parentId } = await db.category.delete({ where: { id } })
  done()
  redirect(`${CATS}?saved=1${parentId ? `&open=${parentId}` : ""}`)
}

const MAX_BYTES = 8 * 1024 * 1024

// FormData file → buffer → public/uploads/<Date.now()>-<name> → its URL; null if not an accepted image.
async function saveUpload(file: File) {
  const ext = path.extname(file.name).toLowerCase()
  // SVG excluded: admin-uploaded SVG could carry script.
  if (!MIME[ext] || ext === ".svg" || file.size > MAX_BYTES) return null
  const name = `${Date.now()}-${slugify(path.basename(file.name, ext)).slice(0, 40) || "image"}${ext}`
  await writeFile(path.join(UPLOAD_DIR, name), Buffer.from(await file.arrayBuffer()))
  return `/uploads/${name}`
}

export async function uploadImages(productId: string, f: FormData) {
  await requireAdmin()
  const files = f.getAll("files").filter((x): x is File => x instanceof File && x.size > 0)
  const color = str(f, "color")
  const variant = color ? await db.productVariant.findFirst({ where: { productId, color } }) : null
  for (const file of files) {
    const url = (await saveUpload(file)) ?? redirect(`/admin/products/${productId}?error=badImage`)
    await db.image.create({ data: { url, productId, variantId: variant?.id } })
  }
  done()
  redirect(`/admin/products/${productId}?saved=1`)
}

async function removeFile(img: { url: string }) {
  await unlink(path.join(UPLOAD_DIR, path.basename(img.url))).catch(() => {})
}

export async function deleteImage(productId: string, imageId: string) {
  await requireAdmin()
  await removeFile(await db.image.delete({ where: { id: imageId } }))
  done()
  redirect(`/admin/products/${productId}`)
}

// Réglages. Empty text fields fall back to the built-in FR/AR defaults (lib/i18n getI18n).
// Each tab (`tab`, only used for the redirect) posts its own fields: absent fields are left as they are.
export async function updateSettings(tab: string, f: FormData) {
  await requireAdmin()
  const back = `/admin/settings?${tab === "store" ? "" : `tab=${encodeURIComponent(tab)}&`}`
  const whatsapp = str(f, "whatsapp").replace(/\D/g, "")
  if (whatsapp && (whatsapp.length < 8 || whatsapp.length > 15)) redirect(`${back}error=badWhatsapp`)
  const old = await getSettings()
  const file = f.get("heroImage")
  const heroImage = file instanceof File && file.size
    ? ((await saveUpload(file)) ?? redirect(`${back}error=badImage`))
    : f.has("removeHero") ? "" : old.heroImage
  const all = {
    storeName: str(f, "storeName").slice(0, 40),
    taglineFr: str(f, "taglineFr").slice(0, 120), taglineAr: str(f, "taglineAr").slice(0, 120),
    heroTitleFr: str(f, "heroTitleFr").slice(0, 60), heroTitleAr: str(f, "heroTitleAr").slice(0, 60),
    shippingTextFr: str(f, "shippingTextFr").slice(0, 500), shippingTextAr: str(f, "shippingTextAr").slice(0, 500),
    heroImage, whatsapp, deliveryFee: int(f, "deliveryFee"), lowStock: int(f, "lowStock"),
  }
  const data: Partial<typeof all> = Object.fromEntries(Object.entries(all).filter(([k]) => f.has(k)))
  await db.settings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data })
  if (old.heroImage && old.heroImage !== heroImage) await removeFile({ url: old.heroImage })
  done()
  redirect(`${back}saved=1`)
}

export async function updateStock(variantId: string, f: FormData) {
  await requireAdmin()
  await db.productVariant.update({ where: { id: variantId }, data: { stockCount: int(f, "stock") } })
  done()
}

class StockError extends Error {}

// `back` = the orders URL with its tab/search, so the redirect keeps them (and drops an old ?error).
export async function updateOrderStatus(orderId: string, back: string, f: FormData) {
  await requireAdmin()
  if (!back.startsWith("/admin/orders")) back = "/admin/orders"
  const to = str(f, "status") as OrderStatus
  if (!Object.values(OrderStatus).includes(to)) return
  try {
    await db.$transaction(async (tx) => {
      const o = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } })
      // Conditional on the status just read: a double submit can't move stock twice.
      const { count } = await tx.order.updateMany({ where: { id: orderId, status: o.status }, data: { status: to } })
      const dir = count ? stockDirection(o.status, to) : 0
      for (const i of o.items) {
        if (dir > 0) await tx.productVariant.update({ where: { id: i.variantId }, data: { stockCount: { increment: i.quantity } } })
        if (dir < 0) {
          // Reopening a cancelled order takes the items again, only if they're still in stock.
          const { count } = await tx.productVariant.updateMany({
            where: { id: i.variantId, stockCount: { gte: i.quantity } },
            data: { stockCount: { decrement: i.quantity } },
          })
          if (!count) throw new StockError()
        }
      }
    })
  } catch (e) {
    if (e instanceof StockError) redirect(`${back}${back.includes("?") ? "&" : "?"}error=noStock`)
    throw e
  }
  done()
  redirect(back)
}
