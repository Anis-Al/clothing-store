"use server"
import { readFile, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { OrderStatus, Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { requireAdmin } from "@/auth"
import { db } from "@/lib/db"
import { isCommune, isWilaya, WILAYAS, wilayaValue } from "@/lib/wilayas"
import { decodeText, parseCsv, planImport, type ImportState } from "@/lib/csv"
import { fill, getI18n, getSettings } from "@/lib/i18n"
import { MIME, UPLOAD_DIR } from "@/lib/uploads"
import { DESK_PAGE, FINAL_STATUSES, makeSku, slugify, unique, UNSOLD_STATUSES } from "@/lib/utils"
import { courierReady, createParcel, parcelFor, parseKeys, statusSteps, trackParcel } from "@/lib/courier"
import { courierOf } from "@/lib/couriers"
import { parseDesks, parseFees } from "@/lib/defaults"

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

// A main category with sub-categories is a group: products go in its children.
const isGroup = async (id: string) => (await db.category.count({ where: { parentId: id } })) > 0

export async function createProduct(f: FormData) {
  await requireAdmin()
  const name = str(f, "name")
  if (!name || !str(f, "categoryId") || !matrix("x", f).length) redirect("/admin/products/new?error=required")
  if (await isGroup(str(f, "categoryId"))) redirect("/admin/products/new?error=catGroup")
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
  // a product already sitting on a group keeps it (the form lists it); moving onto one is refused
  const cur = await db.product.findUnique({ where: { id }, select: { categoryId: true } })
  if (str(f, "categoryId") !== cur?.categoryId && (await isGroup(str(f, "categoryId")))) redirect(`/admin/products/${id}?error=catGroup`)
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

// CSV import (useActionState): every row is checked first, then everything is written in one transaction,
// so a file with errors changes nothing. Rules in lib/csv planImport.
export async function importProducts(_: ImportState, f: FormData): Promise<ImportState> {
  await requireAdmin()
  const { t } = await getI18n()
  const file = f.get("file")
  // ponytail: 1 MB ≈ 10k rows, one query per row in the transaction; batch the writes if imports get bigger
  if (!(file instanceof File) || !/\.csv$/i.test(file.name) || !file.size || file.size > 1024 * 1024) return { errors: [t.admin.importBadFile] }
  const [cats, products] = await Promise.all([
    db.category.findMany(),
    db.product.findMany({ select: { id: true, name: true, slug: true, variants: { select: { id: true, color: true, size: true } } } }),
  ])
  const { errors, plan } = planImport(parseCsv(decodeText(new Uint8Array(await file.arrayBuffer()))), t, cats, products)
  if (errors.length) return { errors: errors.length > 20 ? [...errors.slice(0, 20), fill(t.admin.importMore, { n: errors.length - 20 })] : errors }
  let created = 0, added = 0, updated = 0
  try {
    await db.$transaction(async (tx) => {
      for (const p of plan) {
        let { id, slug } = p
        if (!id || !slug) {
          slug = await freeSlug(p.name, "produit", (s) => tx.product.findUnique({ where: { slug: s }, select: { id: true } }))
          ;({ id } = await tx.product.create({ data: { name: p.name, slug, description: p.description, categoryId: p.categoryId } }))
          created++
        }
        for (const v of p.variants) {
          const data = { price: v.price, stockCount: v.stockCount }
          if (v.id) {
            await tx.productVariant.update({ where: { id: v.id }, data })
            updated++
          } else {
            await tx.productVariant.create({ data: { ...data, productId: id, color: v.color, size: v.size, sku: makeSku(slug, v.color, v.size) } })
            added++
          }
        }
      }
    }, { timeout: 60_000 })
  } catch (e) {
    if (isUnique(e)) return { errors: [t.admin.duplicate] } // two colors with the same Référence ("Bleu ciel" / "bleu-ciel")
    throw e
  }
  done()
  return { done: fill(t.admin.importDone, { created, added, updated }) }
}

// Réglages' ?debug=1 (technical fields) and Catégories' ?edit=1 (edit mode) survive a save: read from the posting
// page's URL. ponytail: referer, not a hidden input in every form; a browser that strips it just drops the mode.
const fromReferer = async (...keys: string[]) => {
  const q = new URL((await headers()).get("referer") ?? "/", "http://x").searchParams
  return keys.filter((k) => q.get(k) === "1").map((k) => `&${k}=1`).join("")
}
const debugQ = () => fromReferer("debug")

const CATS = "/admin/settings/categories"
const catsQ = () => fromReferer("debug", "edit")
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
  const keep = await catsQ()
  if (!name) redirect(`${CATS}?${keep.slice(1)}`)
  if (await db.category.findFirst({ where: { name } })) redirect(`${CATS}?error=catDuplicate${keep}`)
  if (!(await parentOk(null, parentId))) redirect(`${CATS}?error=catDepth${keep}`)
  const slug = await freeSlug(name, "categorie", (slug) => db.category.findUnique({ where: { slug }, select: { id: true } }))
  const { id } = await db.category.create({ data: { name, slug, parentId } })
  done()
  redirect(`${CATS}?saved=1&open=${parentId ?? id}${keep}`) // unfold the group it landed in
}

// Name and parent. The slug never changes, so /products?category=… links keep working.
export async function updateCategory(id: string, f: FormData) {
  await requireAdmin()
  const name = str(f, "name").slice(0, 60)
  const parentId = str(f, "parentId") || null
  const back = `${CATS}?open=${parentId ?? id}${await catsQ()}&`
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
  const keep = await catsQ()
  if (await db.product.count({ where: { categoryId: id } })) redirect(`${CATS}?error=catHasProducts${keep}`)
  if (await db.category.count({ where: { parentId: id } })) redirect(`${CATS}?error=catHasChildren${keep}`)
  const { parentId } = await db.category.delete({ where: { id } })
  done()
  redirect(`${CATS}?saved=1${parentId ? `&open=${parentId}` : ""}${keep}`)
}

const DELIVERY = "/admin/settings?tab=delivery"

// The courier's relay points, typed by the admin from its list (the fee is the wilaya's). Lands on the new point's page.
export async function createStopDesk(f: FormData) {
  await requireAdmin()
  const wilaya = str(f, "wilaya")
  const name = str(f, "name").slice(0, 60)
  if (!isWilaya(wilaya) || !name) redirect(`${DELIVERY}${await debugQ()}`)
  await db.stopDesk.create({ data: {
    wilaya, name, address: str(f, "address").slice(0, 200),
    commune: str(f, "commune").slice(0, 60), deskId: str(f, "deskId").slice(0, 40),
  } })
  const before = await db.stopDesk.count({ where: { OR: [{ wilaya: { lt: wilaya } }, { wilaya, name: { lt: name } }] } })
  done()
  redirect(`${DELIVERY}&dp=${Math.floor(before / DESK_PAGE) + 1}&saved=1${await debugQ()}`)
}

// Delivery fee per wilaya (home / relay): the form posts home_<code> and desk_<code> for the page of rows it shows;
// only those rows are written (the others keep their values).
export async function updateWilayaFees(f: FormData) {
  await requireAdmin()
  await db.$transaction(WILAYAS.filter((w) => f.has(`home_${w[0]}`)).map((w) => {
    const wilaya = wilayaValue(w)
    const data = { home: int(f, `home_${w[0]}`), desk: int(f, `desk_${w[0]}`) }
    return db.wilayaFee.upsert({ where: { wilaya }, create: { wilaya, ...data }, update: data })
  }))
  done()
  const page = int(f, "fp")
  redirect(`${DELIVERY}${page > 1 ? `&fp=${page}` : ""}&saved=1${await debugQ()}`)
}

// Yalidine's tariff + agencies (data/yalidine-*.csv), for a shop whose courier is Yalidine or a sister network:
// the tariff replaces every wilaya's row, agencies not yet present (by deskId) are added. Other couriers: typed in.
export async function loadCourierDefaults() {
  await requireAdmin()
  const s = await getSettings()
  if (courierOf(s.courier)?.[2] !== "yalidine") redirect(`${DELIVERY}${await debugQ()}`)
  const csv = (f: string) => readFile(path.join(process.cwd(), "data", f), "utf8")
  const [fees, desks, have] = await Promise.all([
    csv("yalidine-fees.csv").then(parseFees), csv("yalidine-desks.csv").then(parseDesks),
    db.stopDesk.findMany({ select: { deskId: true } }),
  ])
  const known = new Set(have.map((d) => d.deskId))
  await db.$transaction([
    ...fees.map((f) => db.wilayaFee.upsert({ where: { wilaya: f.wilaya }, create: f, update: { home: f.home, desk: f.desk } })),
    db.stopDesk.createMany({ data: desks.filter((d) => !known.has(d.deskId)) }),
  ])
  done()
  redirect(`${DELIVERY}&saved=1${await debugQ()}`)
}

// Orders keep the point's name + address as text (stopDeskId → null), so deleting never loses delivery info.
export async function deleteStopDesk(id: string, page: number) {
  await requireAdmin()
  await db.stopDesk.delete({ where: { id } })
  done()
  redirect(`${DELIVERY}${page > 1 ? `&dp=${page}` : ""}&saved=1${await debugQ()}`)
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
  const back = `/admin/settings?${tab === "store" ? "" : `tab=${encodeURIComponent(tab)}&`}${(await debugQ()).slice(1) && "debug=1&"}`
  const whatsapp = str(f, "whatsapp").replace(/\D/g, "")
  if (whatsapp && (whatsapp.length < 8 || whatsapp.length > 15)) redirect(`${back}error=badWhatsapp`)
  const fromWilaya = str(f, "courierFromWilaya")
  if (fromWilaya && !isWilaya(fromWilaya)) redirect(`${back}error=required`)
  const storeWilaya = str(f, "storeWilaya")
  if (storeWilaya && !isWilaya(storeWilaya)) redirect(`${back}error=required`)
  const storeCommune = isCommune(storeWilaya, str(f, "storeCommune")) ? str(f, "storeCommune") : "" // must belong to the wilaya
  const courier = str(f, "courier")
  if (f.has("courier") && courier && !courierOf(courier)) redirect(`${back}error=required`)
  // the three method checkboxes post together: the shop must keep at least one way to receive an order
  const on = (k: string) => f.getAll(k).includes("on")
  if (f.has("homeEnabled") && !on("homeEnabled") && !on("pickupEnabled") && !on("stopdeskEnabled")) redirect(`${back}error=noMethod`)
  const old = await getSettings()
  // credentials: one password field per field the courier needs, shown empty: empty = keep the stored value
  // (same courier only; another courier starts from nothing). "" courier = feature off, credentials dropped.
  const kept = courier === old.courier ? parseKeys(old.courierKeys) : {}
  const courierKeys = courier
    ? JSON.stringify(Object.fromEntries((courierOf(courier)?.[3] ?? []).map((k) => [k, str(f, `cred_${k}`).slice(0, 200) || kept[k] || ""])))
    : ""
  const file = f.get("heroImage")
  const heroImage = file instanceof File && file.size
    ? ((await saveUpload(file)) ?? redirect(`${back}error=badImage`))
    : f.has("removeHero") ? "" : old.heroImage
  const all = {
    storeName: str(f, "storeName").slice(0, 40),
    taglineFr: str(f, "taglineFr").slice(0, 120), taglineAr: str(f, "taglineAr").slice(0, 120),
    heroTitleFr: str(f, "heroTitleFr").slice(0, 60), heroTitleAr: str(f, "heroTitleAr").slice(0, 60),
    shippingTextFr: str(f, "shippingTextFr").slice(0, 500), shippingTextAr: str(f, "shippingTextAr").slice(0, 500),
    heroImage, whatsapp, lowStock: int(f, "lowStock"),
    storeWilaya, storeCommune, storeAddress: str(f, "storeAddress").slice(0, 200),
    // checkbox: a hidden "" twin keeps the key in the FormData when unchecked, so `has` still sees it
    homeEnabled: on("homeEnabled"), pickupEnabled: on("pickupEnabled"), stopdeskEnabled: on("stopdeskEnabled"),
    courier, courierKeys, courierFromWilaya: fromWilaya,
  }
  const data: Partial<typeof all> = Object.fromEntries(Object.entries(all).filter(([k]) => f.has(k) || (k === "courierKeys" && f.has("courier"))))
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

// `back` = the orders URL with its tab/search, so the redirect keeps them (and drops an old ?error).
export async function updateOrderStatus(orderId: string, back: string, f: FormData) {
  await requireAdmin()
  if (!back.startsWith("/admin/orders")) back = "/admin/orders"
  const to = str(f, "status") as OrderStatus
  if (!Object.values(OrderStatus).includes(to)) return
  await db.$transaction((tx) => moveStatus(tx, orderId, to))
  done()
  redirect(back)
}

// Only an open order changes: a final one (stale tab, double submit) is left as is,
// so a cancel or return gives the stock back exactly once. Only a shipped parcel can come back.
async function moveStatus(tx: Prisma.TransactionClient, orderId: string, to: OrderStatus) {
  const from = to === "RETURNED" ? "SHIPPED" : { notIn: FINAL_STATUSES }
  const { count } = await tx.order.updateMany({ where: { id: orderId, status: from }, data: { status: to } })
  if (!count || !UNSOLD_STATUSES.includes(to)) return
  for (const i of await tx.orderItem.findMany({ where: { orderId } }))
    await tx.productVariant.update({ where: { id: i.variantId }, data: { stockCount: { increment: i.quantity } } })
}

// Creates the parcel on the shop's courier account (lib/courier.ts) and keeps courier + tracking + label on the
// order. Not for pickup orders, final orders or one already sent. The status is left to the admin (SHIPPED once collected).
export async function sendToCourier(orderId: string, back: string) {
  await requireAdmin()
  if (!back.startsWith("/admin/orders")) back = "/admin/orders"
  const fail = (k: string, detail = "") =>
    redirect(`${back}${back.includes("?") ? "&" : "?"}error=${k}${detail ? `&detail=${encodeURIComponent(detail.slice(0, 300))}` : ""}`)
  const s = await getSettings()
  if (!courierReady(s)) fail("courierSetup")
  const o = await db.order.findUnique({ where: { id: orderId }, include: { items: { include: { variant: { include: { product: true } } } }, stopDesk: true } })
  if (!o || o.method === "PICKUP" || FINAL_STATUSES.includes(o.status)) redirect(back)
  if (o.method === "STOPDESK" && !o.stopDesk?.commune) fail("courierDesk")
  // claim the order first: a double click must not create two parcels. "…" is cleared again on failure.
  const { count } = await db.order.updateMany({ where: { id: orderId, tracking: "" }, data: { tracking: "…" } })
  if (!count) redirect(back)
  const res = await createParcel(parcelFor(o), s)
  await db.order.update({ where: { id: orderId }, data: res.ok ? { courier: s.courier, tracking: res.tracking, labelUrl: res.labelUrl } : { tracking: "" } })
  done()
  if (!res.ok) fail("courierRefused", res.message)
  redirect(`${back}${back.includes("?") ? "&" : "?"}saved=1`)
}

// "Actualiser le suivi": asks dzship where the parcel is (same courier + credentials as at creation), keeps that status
// on the order and moves the order forward when it says so (statusSteps: on its way → SHIPPED, delivered → DELIVERED,
// returned → RETURNED with the stock back, through moveStatus like a manual change). Never on a final order.
export async function trackOrder(orderId: string, back: string) {
  await requireAdmin()
  if (!back.startsWith("/admin/orders")) back = "/admin/orders"
  const fail = (k: string, detail = "") =>
    redirect(`${back}${back.includes("?") ? "&" : "?"}error=${k}${detail ? `&detail=${encodeURIComponent(detail.slice(0, 300))}` : ""}`)
  const s = await getSettings()
  if (!courierReady(s)) fail("courierSetup")
  const o = await db.order.findUnique({ where: { id: orderId } })
  if (!o || !o.tracking || o.tracking === "…" || FINAL_STATUSES.includes(o.status)) redirect(back)
  // the credentials in Réglages belong to the current courier: a parcel made with another one can't be asked about
  if (o.courier !== s.courier) fail("courierOther")
  const res = await trackParcel(o.tracking, s)
  if (!res.ok) fail("courierTrack", res.message)
  else await db.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data: { courierStatus: res.status, courierRaw: res.raw, courierCheckedAt: new Date() } })
    for (const to of statusSteps(res.status, o.status)) await moveStatus(tx, orderId, to)
  })
  done()
  redirect(`${back}${back.includes("?") ? "&" : "?"}saved=1`)
}

// Any status, final ones too (e.g. why a parcel came back). Same `back` rule as the status.
export async function updateOrderNote(orderId: string, back: string, f: FormData) {
  await requireAdmin()
  if (!back.startsWith("/admin/orders")) back = "/admin/orders"
  await db.order.update({ where: { id: orderId }, data: { note: str(f, "note").slice(0, 500) } })
  done()
  redirect(`${back}${back.includes("?") ? "&" : "?"}saved=1`)
}
