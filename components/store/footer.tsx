import Link from "next/link"
import { Navigation } from "lucide-react"
import { WhatsAppIcon } from "@/components/whatsapp-icon"
import { getShownCategories } from "@/lib/catalog"
import { getI18n, getSettings } from "@/lib/i18n"
import { storePlace } from "@/lib/wilayas"

const link = "text-hairline hover:text-canvas"

// Ink block that closes every storefront page. Everything comes from Réglages and hides when empty: contact = WhatsApp,
// shop address + hours, directions, social links.
export async function Footer() {
  const [{ t, locale }, s, categories] = await Promise.all([getI18n(), getSettings(), getShownCategories()])
  const place = storePlace(s, locale)
  const hours = locale === "ar" ? s.storeHoursAr || s.storeHoursFr : s.storeHoursFr || s.storeHoursAr
  const hasMap = s.storeLat != null && s.storeLng != null
  const socials = ([["Instagram", s.instagram], ["Facebook", s.facebook], ["TikTok", s.tiktok]] as const).filter(([, url]) => url)
  const contact = s.whatsapp || place || hours || hasMap || socials.length

  return (
    <footer className="mt-12 bg-ink text-canvas">
      <div className="mx-auto max-w-[1440px] px-4 md:px-12">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 py-12 text-sm lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div className="col-span-2 lg:col-span-1">
            <Link href="/" className="font-display text-5xl leading-none tracking-wide md:text-6xl">{t.store.name}</Link>
            <p className="mt-4 max-w-xs text-hairline">{t.store.tagline}</p>
          </div>

          <nav aria-label={t.nav.shop} className="flex flex-col gap-2.5">
            <p className="mb-1 font-medium">{t.nav.shop}</p>
            <Link href="/products" className={link}>{t.catalog.all}</Link>
            {categories.map((c) => <Link key={c.id} href={`/products?category=${c.slug}`} className={link}>{c.name}</Link>)}
          </nav>

          {contact && (
            <div className="flex flex-col gap-2.5">
              <p className="mb-1 font-medium">{t.footer.contact}</p>
              {s.whatsapp && (
                <a href={`https://wa.me/${s.whatsapp}`} target="_blank" rel="noopener noreferrer" className={`${link} flex items-center gap-2`}>
                  <WhatsAppIcon className="size-4 text-[#25D366]" />{t.footer.whatsapp}
                </a>
              )}
              {place && <p className="text-hairline">{place}</p>}
              {hours && <p className="text-hairline">{hours}</p>}
              {hasMap && (
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${s.storeLat},${s.storeLng}`} target="_blank" rel="noopener noreferrer"
                  className={`${link} flex items-center gap-2`}>
                  <Navigation className="size-4" aria-hidden />{t.home.directions}
                </a>
              )}
              {socials.length > 0 && (
                <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  {socials.map(([name, url]) => (
                    <a key={name} href={url} target="_blank" rel="noopener noreferrer" className={`${link} underline-offset-4 hover:underline`}>{name}</a>
                  ))}
                </p>
              )}
            </div>
          )}

          <div className="col-span-2 flex flex-col gap-2.5 lg:col-span-1">
            <p className="mb-1 font-medium">{t.nav.help}</p>
            <p className="text-hairline">{t.product.shippingText}</p>
          </div>
        </div>
      </div>
    </footer>
  )
}
