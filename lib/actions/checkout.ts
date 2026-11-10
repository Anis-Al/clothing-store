"use server"
import { headers } from "next/headers"
import { db } from "@/lib/db"
import { fill, getI18n, getSettings } from "@/lib/i18n"
import { isCommune, normalizePhone } from "@/lib/wilayas"

class StockError extends Error {}
class PriceError extends Error {
  prices: Record<string, number>
  constructor(prices: Record<string, number>) {
    super()
    this.prices = prices
  }
}

// Guest checkout, cash on delivery. Prices come from the DB, never from the client: the prices and fee the
// cart showed (`price`, `fee`) are only compared, so the customer never orders at a total they didn't see.
// method PICKUP (collected at the shop): name + phone only, no fee; offered only while Réglages has a pickup address.
// method STOPDESK: a StopDesk row (stopDeskId) gives wilaya and address text; name + phone from the customer.
// The fee comes from WilayaFee (Réglages › Livraison): the destination wilaya's home or relay tariff.
export type Shipping = {
  method?: "HOME" | "PICKUP" | "STOPDESK"; stopDeskId?: string
  fullName: string; phone: string; wilaya: string; commune: string; address: string
}

// ponytail: in-memory per-IP limit (10 attempts / 10 min, failed ones count), reset by a restart; per-IP rules in Caddy if it must survive
const recent = new Map<string, number[]>()
const LIMIT = 10
const WINDOW = 10 * 60_000

function tooMany(ip: string) {
  const now = Date.now()
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW)
  if (hits.length >= LIMIT) return true
  recent.set(ip, [...hits, now])
  if (recent.size > 5000) for (const [k, v] of recent) if (now - v[v.length - 1] >= WINDOW) recent.delete(k)
  return false
}

export async function checkout(lines: { variantId: string; qty: number; price: number }[], fee: number, shipping: Shipping) {
  const { t } = await getI18n()
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() || "unknown"
  if (tooMany(ip)) return { error: t.errors.tooMany }

  const qty = new Map<string, number>()
  const shown = new Map<string, number>()
  for (const l of Array.isArray(lines) ? lines.slice(0, 100) : []) {
    const n = Math.floor(Number(l?.qty))
    if (typeof l?.variantId === "string" && n > 0 && n <= 99) {
      qty.set(l.variantId, (qty.get(l.variantId) ?? 0) + n)
      shown.set(l.variantId, Number(l.price))
    }
  }
  if (!qty.size) return { error: t.cart.empty }

  const method = (["HOME", "PICKUP", "STOPDESK"] as const).find((x) => x === shipping?.method) ?? "HOME"
  const pickup = method === "PICKUP"
  const desk = method === "STOPDESK" ? await db.stopDesk.findUnique({ where: { id: String(shipping?.stopDeskId ?? "") } }) : null
  if (method === "STOPDESK" && !desk) return { error: t.cart.missingDesk }
  const fullName = String(shipping?.fullName ?? "").trim().slice(0, 100)
  const address = pickup ? "" : desk ? `${desk.name} — ${desk.address}`.replace(/ — $/, "") : String(shipping?.address ?? "").trim().slice(0, 300)
  const wilaya = pickup ? "" : desk ? desk.wilaya : String(shipping?.wilaya ?? "")
  const commune = method === "HOME" ? String(shipping?.commune ?? "") : ""
  // the commune must belong to the wilaya: couriers need both exactly
  if (!fullName || (method === "HOME" && (!address || !isCommune(wilaya, commune))))
    return { error: pickup ? t.cart.missingPickup : desk ? t.cart.missingDesk : t.cart.missing }
  const phone = normalizePhone(String(shipping?.phone ?? ""))
  if (!phone) return { error: t.cart.badPhone }

  const { homeEnabled, pickupEnabled, stopdeskEnabled } = await getSettings()
  // method switched off since the cart loaded: same path as a fee change (the cart refreshes without the option)
  if ((pickup && !pickupEnabled) || (desk && !stopdeskEnabled) || (method === "HOME" && !homeEnabled)) return { error: t.errors.priceChanged, prices: {} }
  const tariff = pickup ? null : await db.wilayaFee.findUnique({ where: { wilaya } })
  const shippingFee = pickup ? 0 : desk ? (tariff?.desk ?? 0) : (tariff?.home ?? 0)
  try {
    const order = await db.$transaction(async (tx) => {
      const variants = await tx.productVariant.findMany({ where: { id: { in: [...qty.keys()] } }, include: { product: true } })
      // The cart keeps the price from when the item was added; the admin may have changed it (or the fee) since.
      if (Number(fee) !== shippingFee || variants.some((v) => v.price !== shown.get(v.id)))
        throw new PriceError(Object.fromEntries(variants.map((v) => [v.id, v.price])))
      let total = 0
      for (const [id, n] of qty) {
        const v = variants.find((x) => x.id === id)
        if (!v) throw new StockError("?")
        // Conditional decrement: never goes below zero even with concurrent checkouts.
        const { count } = await tx.productVariant.updateMany({
          where: { id, stockCount: { gte: n } },
          data: { stockCount: { decrement: n } },
        })
        if (!count) throw new StockError(`${v.product.name} — ${v.color} / ${v.size}`)
        total += v.price * n
      }
      return tx.order.create({
        data: {
          totalAmount: total + shippingFee,
          shippingFee,
          method, stopDeskId: desk?.id,
          fullName, phone, wilaya, commune, address,
          items: { create: [...qty].map(([variantId, quantity]) => ({ variantId, quantity, priceAtPurchase: variants.find((v) => v.id === variantId)!.price })) },
        },
      })
    })
    return { orderId: order.id }
  } catch (e) {
    if (e instanceof StockError) return { error: fill(t.errors.stock, { item: e.message }) }
    if (e instanceof PriceError) return { error: t.errors.priceChanged, prices: e.prices }
    throw e
  }
}
