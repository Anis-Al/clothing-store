import type { Order, OrderItem, OrderStatus, Product, ProductVariant, StopDesk } from "@prisma/client"
import { courierOf } from "@/lib/couriers"

// Parcel creation through dzship (freeship.dzbuild.com): a free gateway with one request shape for ~100 Algerian
// couriers (Yalidine, ZR Express, Maystro, NOEST, the Ecotrack tenants…). It takes the shop's own courier credentials
// with each call (and says it stores nothing). Server-side only: the credentials must never reach the browser.
const GATEWAY = "https://freeship.dzbuild.com"

export type CourierSettings = { courier: string; courierKeys: string; courierFromWilaya: string }

// Settings.courierKeys = JSON object of the courier's credential fields ({ apiId, apiToken } for Yalidine…)
export const parseKeys = (json: string): Record<string, string> => {
  try { const o = JSON.parse(json || "{}"); return o && typeof o === "object" ? o : {} } catch { return {} }
}

// The feature is on when a known courier has every credential it needs; the Yalidine family also needs the origin wilaya.
export function courierReady(s: CourierSettings) {
  const c = courierOf(s.courier)
  if (!c) return false
  const keys = parseKeys(s.courierKeys)
  return c[3].every((f) => keys[f]) && (c[2] !== "yalidine" || !!s.courierFromWilaya)
}

export type OrderToSend = Order & { items: (OrderItem & { variant: ProductVariant & { product: Product } })[]; stopDesk: StopDesk | null }

// dzship's order body. Wilaya code = the first two digits of the stored "16 - Alger"; commune names come from the
// checkout's list (the gateway maps spellings per courier). A relay order routes by the point's commune, plus the
// courier's own desk id where it has one (Yalidine, NOEST…; Ecotrack / Maystro go by the commune alone).
// Shop-wide parcel options (Réglages › Livraison, debug): open before paying, insure at the order total, a fixed weight.
export type ParcelOptions = { parcelOpenable?: boolean; parcelInsured?: boolean; parcelWeightKg?: number }

export function parcelFor(o: OrderToSend, opts: ParcelOptions = {}) {
  const stop = o.method === "STOPDESK"
  return {
    reference: o.id.slice(-8).toUpperCase(), // the ref shown in the admin and on /merci
    recipient: {
      fullName: o.fullName.slice(0, 120),
      phone: o.phone,
      wilayaCode: Number(o.wilaya.slice(0, 2)),
      communeName: stop ? (o.stopDesk?.commune ?? "") : o.commune,
      ...(!stop && { addressLine: o.address.slice(0, 255) }),
    },
    deliveryType: stop ? "stopdesk" : "home",
    ...(stop && o.stopDesk?.deskId && { stopDeskId: o.stopDesk.deskId }),
    productList: o.items.map((i) => `${i.variant.product.name} ${i.variant.color}/${i.variant.size} x${i.quantity}`).join(", "),
    // what the courier collects = the total the customer saw (items + the fee from Réglages). freeShipping stops the
    // courier from adding its own fee on top: the shop pays it out of codAmount.
    codAmount: o.totalAmount,
    freeShipping: true,
    ...(opts.parcelOpenable && { hasOpenPackage: true }),
    ...(opts.parcelInsured && { declaredValue: o.totalAmount }),
    ...(opts.parcelWeightKg && opts.parcelWeightKg > 0 && { weightKg: opts.parcelWeightKg }),
  }
}

export type ParcelResult = { ok: true; tracking: string; labelUrl: string } | { ok: false; message: string }
type Failure = { ok: false; message: string }

// One POST to the gateway with the shop's courier + credentials (+ origin wilaya). Network errors and gateway
// refusals both come back as { ok: false, message } (the message, plus the fields it names, goes to the toast).
async function call(path: string, s: CourierSettings, extra: object): Promise<{ ok: true; j: Record<string, unknown> } | Failure> {
  const body = {
    courier: s.courier,
    credentials: parseKeys(s.courierKeys),
    ...(s.courierFromWilaya && { options: { fromWilaya: Number(s.courierFromWilaya.slice(0, 2)) } }),
    ...extra,
  }
  let r: Response
  try {
    r = await fetch(`${GATEWAY}${path}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000),
    })
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string; fields?: Record<string, unknown> } }
  if (!r.ok || j.error) {
    const fields = Object.entries(j.error?.fields ?? {}).map(([k, v]) => `${k.replace(/^order\.(recipient\.)?/, "")}: ${v}`).join(", ")
    return { ok: false, message: [j.error?.message ?? `HTTP ${r.status}`, fields].filter(Boolean).join(" — ") }
  }
  return { ok: true, j }
}

export async function createParcel(parcel: ReturnType<typeof parcelFor>, s: CourierSettings): Promise<ParcelResult> {
  const res = await call("/v1/orders", s, { order: parcel })
  if (!res.ok) return res
  if (typeof res.j.trackingNumber !== "string") return { ok: false, message: "no trackingNumber" }
  return { ok: true, tracking: res.j.trackingNumber, labelUrl: typeof res.j.labelUrl === "string" ? res.j.labelUrl : "" }
}

// dzship's tracking: the parcel's status in its one vocabulary for every courier (docs/statuses.md in the dzship
// zip: created → pending_pickup → picked_up → in_transit → at_hub → out_for_delivery → delivery_attempted →
// delivered, or on_hold | returned | return_in_transit | cancelled | lost | unknown) + the courier's own wording.
export type TrackResult = { ok: true; status: string; raw: string } | Failure

export async function trackParcel(trackingNumber: string, s: CourierSettings): Promise<TrackResult> {
  const res = await call("/v1/track", s, { trackingNumber })
  if (!res.ok) return res
  const events = Array.isArray(res.j.events) ? (res.j.events as { rawStatus?: unknown }[]) : []
  const raw = events.at(-1)?.rawStatus // oldest first
  return { ok: true, status: typeof res.j.status === "string" ? res.j.status : "unknown", raw: typeof raw === "string" ? raw : "" }
}

// What a courier status does to the order. Only moves forward, only on open orders: a parcel on its way makes a
// pending / confirmed order SHIPPED, delivered → DELIVERED, returned → RETURNED (via SHIPPED, the only status a return
// leaves from). cancelled / lost / on_hold and the early statuses change nothing: the admin decides (call the customer…).
const MOVING = ["picked_up", "in_transit", "at_hub", "out_for_delivery", "delivery_attempted", "return_in_transit", "returned", "delivered"]
export function statusSteps(courierStatus: string, current: OrderStatus): OrderStatus[] {
  if (!["PENDING", "CONFIRMED", "SHIPPED"].includes(current) || !MOVING.includes(courierStatus)) return []
  const steps: OrderStatus[] = current === "SHIPPED" ? [] : ["SHIPPED"]
  if (courierStatus === "delivered") return ["DELIVERED"] // DELIVERED is allowed from any open status
  if (courierStatus === "returned") return [...steps, "RETURNED"]
  return steps
}
