"use server"
import { db } from "@/lib/db"
import { fill, getI18n, getSettings } from "@/lib/i18n"
import { isWilaya, normalizePhone } from "@/lib/wilayas"

class StockError extends Error {}

// Guest checkout, cash on delivery. Prices come from the DB, never from the client.
export type Shipping = { fullName: string; phone: string; wilaya: string; address: string }

export async function checkout(lines: { variantId: string; qty: number }[], shipping: Shipping) {
  const { t } = await getI18n()

  const qty = new Map<string, number>()
  for (const l of Array.isArray(lines) ? lines.slice(0, 100) : []) {
    const n = Math.floor(Number(l?.qty))
    if (typeof l?.variantId === "string" && n > 0 && n <= 99) qty.set(l.variantId, (qty.get(l.variantId) ?? 0) + n)
  }
  if (!qty.size) return { error: t.cart.empty }

  const fullName = String(shipping?.fullName ?? "").trim().slice(0, 100)
  const address = String(shipping?.address ?? "").trim().slice(0, 300)
  const wilaya = String(shipping?.wilaya ?? "")
  if (!fullName || !address || !isWilaya(wilaya)) return { error: t.cart.missing }
  const phone = normalizePhone(String(shipping?.phone ?? ""))
  if (!phone) return { error: t.cart.badPhone }

  const { deliveryFee } = await getSettings()
  try {
    const order = await db.$transaction(async (tx) => {
      const variants = await tx.productVariant.findMany({ where: { id: { in: [...qty.keys()] } }, include: { product: true } })
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
          fullName, phone, wilaya, address,
          items: { create: [...qty].map(([variantId, quantity]) => ({ variantId, quantity, priceAtPurchase: variants.find((v) => v.id === variantId)!.price })) },
        },
      })
    })
    return { orderId: order.id }
  } catch (e) {
    if (e instanceof StockError) return { error: fill(t.errors.stock, { item: e.message }) }
    throw e
  }
}
