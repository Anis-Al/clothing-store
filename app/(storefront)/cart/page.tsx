import { CartView } from "@/components/store/cart-view"
import { db } from "@/lib/db"
import { getI18n, getSettings } from "@/lib/i18n"

export async function generateMetadata() {
  return { title: (await getI18n()).t.cart.title }
}

export default async function CartPage() {
  const [s, desks, tariffs] = await Promise.all([
    getSettings(),
    db.stopDesk.findMany({ orderBy: [{ wilaya: "asc" }, { name: "asc" }], omit: { deskId: true, commune: true } }),
    db.wilayaFee.findMany(),
  ])
  // fee per wilaya: [home, relay point] — the cart shows the one for the wilaya picked; checkout re-reads it
  const fees = Object.fromEntries(tariffs.map((f) => [f.wilaya, [f.home, f.desk] as [number, number]]))
  return <CartView fees={fees} pickup={s.pickupEnabled} storeAddress={s.storeAddress} desks={s.stopdeskEnabled ? desks : []} />
}
