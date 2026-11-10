import { CartView } from "@/components/store/cart-view"
import { db } from "@/lib/db"
import { getI18n, getSettings } from "@/lib/i18n"
import { communesOf, WILAYAS, wilayaValue } from "@/lib/wilayas"

export async function generateMetadata() {
  return { title: (await getI18n()).t.cart.title }
}

export default async function CartPage() {
  const [{ locale }, s, desks, tariffs] = await Promise.all([
    getI18n(),
    getSettings(),
    db.stopDesk.findMany({ orderBy: [{ wilaya: "asc" }, { name: "asc" }], omit: { deskId: true, commune: true } }),
    db.wilayaFee.findMany(),
  ])
  // fee per wilaya: [home, relay point] — the cart shows the one for the wilaya picked; checkout re-reads it
  const fees = Object.fromEntries(tariffs.map((f) => [f.wilaya, [f.home, f.desk] as [number, number]]))
  // shop address as one line in the UI language: "street, commune, wilaya" (each part optional)
  const w = WILAYAS.find((x) => wilayaValue(x) === s.storeWilaya)
  const c = communesOf(s.storeWilaya).find(([fr]) => fr === s.storeCommune)
  const storeAddress = [s.storeAddress, c && (locale === "ar" ? c[1] : c[0]), w && (locale === "ar" ? w[2] : w[1])].filter(Boolean).join(", ")
  return <CartView fees={fees} home={s.homeEnabled} pickup={s.pickupEnabled} storeAddress={storeAddress} desks={s.stopdeskEnabled ? desks : []} />
}
