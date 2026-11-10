import type { Order, OrderItem, Product, ProductVariant, StopDesk } from "@prisma/client"
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
export function parcelFor(o: OrderToSend) {
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
  }
}

export type ParcelResult = { ok: true; tracking: string; labelUrl: string } | { ok: false; message: string }

export async function createParcel(parcel: ReturnType<typeof parcelFor>, s: CourierSettings): Promise<ParcelResult> {
  const body = {
    courier: s.courier,
    credentials: parseKeys(s.courierKeys),
    ...(s.courierFromWilaya && { options: { fromWilaya: Number(s.courierFromWilaya.slice(0, 2)) } }),
    order: parcel,
  }
  let r: Response
  try {
    r = await fetch(`${GATEWAY}/v1/orders`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000),
    })
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
  const j = (await r.json().catch(() => ({}))) as { trackingNumber?: unknown; labelUrl?: unknown; error?: { message?: string; fields?: Record<string, unknown> } }
  if (!r.ok || typeof j.trackingNumber !== "string") {
    const fields = Object.entries(j.error?.fields ?? {}).map(([k, v]) => `${k.replace(/^order\.(recipient\.)?/, "")}: ${v}`).join(", ")
    return { ok: false, message: [j.error?.message ?? `HTTP ${r.status}`, fields].filter(Boolean).join(" — ") }
  }
  return { ok: true, tracking: j.trackingNumber, labelUrl: typeof j.labelUrl === "string" ? j.labelUrl : "" }
}
