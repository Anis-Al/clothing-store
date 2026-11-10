import { CartView } from "@/components/store/cart-view"
import { db } from "@/lib/db"
import { getI18n, getSettings } from "@/lib/i18n"
import { storePlace } from "@/lib/wilayas"

export async function generateMetadata() {
  return { title: (await getI18n()).t.cart.title }
}

export default async function CartPage() {
  const [{ t, locale }, s, desks, tariffs] = await Promise.all([
    getI18n(),
    getSettings(),
    db.stopDesk.findMany({ orderBy: [{ wilaya: "asc" }, { name: "asc" }], omit: { deskId: true, commune: true } }),
    db.wilayaFee.findMany(),
  ])
  // fee per wilaya: [home, relay point] — the cart shows the one for the wilaya picked; checkout re-reads it
  const fees = Object.fromEntries(tariffs.map((f) => [f.wilaya, [f.home, f.desk] as [number, number]]))
  // the pickup line: "street, commune, wilaya", then the opening hours on their own line (the cart shows it pre-line)
  const hours = locale === "ar" ? s.storeHoursAr || s.storeHoursFr : s.storeHoursFr || s.storeHoursAr
  const storeAddress = [storePlace(s, locale), hours && `${t.admin.hours} ${hours}`].filter(Boolean).join("\n")
  return <CartView fees={fees} home={s.homeEnabled} pickup={s.pickupEnabled} storeAddress={storeAddress} desks={s.stopdeskEnabled ? desks : []} />
}
