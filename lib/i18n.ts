// Server only (reads the DB). Client components import from lib/dict.
import { cookies } from "next/headers"
import { cache } from "react"
import { db } from "@/lib/db"
import { DICTS, type Dict, type Locale } from "@/lib/dict"

export * from "@/lib/dict"

// Réglages: one row (id 1, inserted by its migration). Empty text = the dictionary default.
export const getSettings = cache(async () =>
  (await db.settings.findUnique({ where: { id: 1 } })) ?? db.settings.create({ data: { id: 1 } }))

export async function getLocale(): Promise<Locale> {
  return (await cookies()).get("lang")?.value === "ar" ? "ar" : "fr"
}

export async function getI18n() {
  const [locale, s] = await Promise.all([getLocale(), getSettings()])
  const d = DICTS[locale]
  const ar = locale === "ar"
  const t: Dict = {
    ...d,
    store: { name: s.storeName || d.store.name, tagline: (ar ? s.taglineAr : s.taglineFr) || d.store.tagline },
    home: { ...d.home, heroTitle: (ar ? s.heroTitleAr : s.heroTitleFr) || d.home.heroTitle },
    product: { ...d.product, shippingText: (ar ? s.shippingTextAr : s.shippingTextFr) || d.product.shippingText },
  }
  return { locale, t }
}
