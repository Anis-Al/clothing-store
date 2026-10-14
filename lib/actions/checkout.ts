"use server"
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
export type Shipping = { fullName: string; phone: string; wilaya: string; commune: string; address: string }

export async function checkout(lines: { variantId: string; qty: number; price: number }[], fee: number, shipping: Shipping) {
  const { t } = await getI18n()

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

  const fullName = String(shipping?.fullName ?? "").trim().slice(0, 100)
  const address = String(shipping?.address ?? "").trim().slice(0, 300)
  const wilaya = String(shipping?.wilaya ?? "")
  const commune = String(shipping?.commune ?? "")
  // the commune must belong to the wilaya: couriers need both exactly
  if (!fullName || !address || !isCommune(wilaya, commune)) return { error: t.cart.missing }
  const phone = normalizePhone(String(shipping?.phone ?? ""))
  if (!phone) return { error: t.cart.badPhone }

  const { deliveryFee } = await getSettings()
  try {
    const order = await db.$transaction(async (tx) => {
      const variants = await tx.productVariant.findMany({ where: { id: { in: [...qty.keys()] } }, include: { product: true } })
      // The cart keeps the price from when the item was added; the admin may have changed it (or the fee) since.
      if (Number(fee) !== deliveryFee || variants.some((v) => v.price !== shown.get(v.id)))
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
          totalAmount: total + deliveryFee,
          shippingFee: deliveryFee,
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
