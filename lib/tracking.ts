import type { Order, OrderStatus, Prisma } from "@prisma/client"
import { courierReady, statusSteps, trackParcel, type CourierSettings, type TrackResult } from "@/lib/courier"
import { db } from "@/lib/db"
import { FINAL_STATUSES, UNSOLD_STATUSES } from "@/lib/utils"

// Parcel tracking shared by the admin ("Actualiser le suivi", "Tout actualiser") and the scheduled sync
// (`npm run track:sync`, run by cron on the server). No Next imports: the script runs it under plain tsx.

// Only an open order changes: a final one (stale tab, double submit, a late sync) is left as is,
// so a cancel or return gives the stock back exactly once. Only a shipped parcel can come back.
export async function moveStatus(tx: Prisma.TransactionClient, orderId: string, to: OrderStatus) {
  const from = to === "RETURNED" ? "SHIPPED" : { notIn: FINAL_STATUSES }
  const { count } = await tx.order.updateMany({ where: { id: orderId, status: from }, data: { status: to } })
  if (!count || !UNSOLD_STATUSES.includes(to)) return
  for (const i of await tx.orderItem.findMany({ where: { orderId } }))
    await tx.productVariant.update({ where: { id: i.variantId }, data: { stockCount: { increment: i.quantity } } })
}

// Orders worth asking about: open, sent to the courier saved in Réglages (its credentials are the ones we have),
// with a real tracking number ("…" = a send in progress).
export const trackable = (courier: string): Prisma.OrderWhereInput => ({
  courier, status: { notIn: FINAL_STATUSES }, tracking: { notIn: ["", "…"] },
})

// One parcel: keep the courier's status on the order, then move the order forward (statusSteps).
export async function syncOrder(o: Order, s: CourierSettings): Promise<TrackResult> {
  const res = await trackParcel(o.tracking, s)
  if (res.ok) await db.$transaction(async (tx) => {
    await tx.order.update({ where: { id: o.id }, data: { courierStatus: res.status, courierRaw: res.raw, courierCheckedAt: new Date() } })
    for (const to of statusSteps(res.status, o.status)) await moveStatus(tx, o.id, to)
  })
  return res
}

export type SyncReport = { ready: boolean; checked: number; moved: number; failed: number; error?: string }

// Every trackable order not checked in the last `minAgeMs`, oldest first, one call at a time with a pause
// (the gateway is free and shared). ponytail: sequential, at most `limit` per run; batch calls if it ever needs to be faster.
export async function syncAll(s: CourierSettings, { minAgeMs = 0, pauseMs = 300, limit = 200 } = {}): Promise<SyncReport> {
  if (!courierReady(s)) return { ready: false, checked: 0, moved: 0, failed: 0 }
  const before = new Date(Date.now() - minAgeMs)
  const orders = await db.order.findMany({
    where: { ...trackable(s.courier), OR: [{ courierCheckedAt: null }, { courierCheckedAt: { lt: before } }] },
    orderBy: { createdAt: "asc" }, take: limit,
  })
  const report: SyncReport = { ready: true, checked: 0, moved: 0, failed: 0 }
  for (const [i, o] of orders.entries()) {
    if (i) await new Promise((r) => setTimeout(r, pauseMs))
    const res = await syncOrder(o, s)
    report.checked++
    if (!res.ok) { report.failed++; report.error ??= `#${o.id.slice(-8).toUpperCase()}: ${res.message}` }
    else if (statusSteps(res.status, o.status).length) report.moved++
  }
  return report
}
