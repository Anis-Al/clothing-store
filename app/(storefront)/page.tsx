import Image from "next/image"
import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import { ProductGrid } from "@/components/store/product-card"
import { getProducts, SHOWN_CATEGORY } from "@/lib/catalog"
import { db } from "@/lib/db"
import { getI18n, getSettings } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { storePlace } from "@/lib/wilayas"
import { WhatsAppIcon } from "@/components/whatsapp-icon"

const LATEST_IMAGE = { products: { take: 1, orderBy: { createdAt: "desc" }, include: { images: { take: 1 } } } } as const

export default async function Home() {
  const [{ t, locale }, settings, latest, categories] = await Promise.all([
    getI18n(),
    getSettings(),
    getProducts({}, 6),
    // main categories; the tile image comes from the group's own products or its sub-categories'
    db.category.findMany({
      where: { parentId: null, ...SHOWN_CATEGORY },
      orderBy: { name: "asc" },
      include: { ...LATEST_IMAGE, children: { include: LATEST_IMAGE } },
    }),
  ])
  const many = categories.length > 2
  const { heroImage, storeLat: lat, storeLng: lng } = settings
  // the shop on a map (Réglages › Boutique coordinates): Google Maps' keyless embed (`output=embed`, no API key, no
  // script of ours; labels in the shop's language). ponytail: not an official API; if Google ever drops it, switch to
  // the Maps Embed API (`/maps/embed/v1/place?key=…&q=lat,lng`) with a key in Réglages.
  const hasMap = lat != null && lng != null
  // opening hours in the visitor's language, the other one when only one was typed
  const hours = locale === "ar" ? settings.storeHoursAr || settings.storeHoursFr : settings.storeHoursFr || settings.storeHoursAr
  const place = storePlace(settings, locale)
  const mapSrc = hasMap ? `https://maps.google.com/maps?q=${lat},${lng}&z=16&hl=${locale}&output=embed` : ""

  return (
    <div className="flex flex-col gap-12 pt-2 md:gap-12">
      {/* campaign-tile: the photo from Réglages if any, else the ink block carries the display lockup alone */}
      <section className="relative -mx-4 flex min-h-[440px] flex-col justify-end gap-6 bg-ink p-6 text-canvas md:mx-0 md:min-h-[560px] md:p-12">
        {heroImage && (
          <>
            <Image src={heroImage} alt="" fill priority sizes="100vw" className="object-cover" />
            {/* keeps the white lockup readable on any photo */}
            <div className="absolute inset-0 bg-linear-to-t from-ink/80 via-ink/30 to-transparent" />
          </>
        )}
        <h1 className="display-campaign relative max-w-4xl">{t.home.heroTitle}</h1>
        <p className="relative max-w-md text-lg">{t.store.tagline}</p>
        <Link href="/products" className={buttonVariants({ variant: "outline", className: "relative w-fit border-0" })}>
          {t.home.heroCta}
        </Link>
      </section>

      <section className="flex flex-col gap-6">
        <h2 className="text-2xl font-medium md:text-[32px]">{t.home.latest}</h2>
        <ProductGrid products={latest} />
      </section>

      <section className="flex flex-col gap-6">
        <h2 className="text-2xl font-medium md:text-[32px]">{t.home.categories}</h2>
        {/* 1–2 categories: big tiles; more: a denser 2/4-column grid so the page doesn't run for screens */}
        <div className={cn("grid gap-2", many ? "grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2")}>
          {categories.map((c) => {
            const img = [c, ...c.children].flatMap((x) => x.products)[0]?.images[0]?.url
            return (
              <Link key={c.id} href={`/products?category=${c.slug}`}
                className={cn("relative flex aspect-[4/5] items-end bg-cloud", many ? "p-3 md:p-4" : "p-6 sm:aspect-[4/3]")}>
                {img && <Image src={img} alt="" fill sizes={many ? "(max-width: 1023px) 50vw, 25vw" : "(max-width: 640px) 100vw, 50vw"} className="object-cover" />}
                <span className={buttonVariants({
                  variant: "outline", size: many ? "sm" : "default",
                  className: cn("relative border-0", many && "h-auto min-h-10 py-2 text-start whitespace-normal"),
                })}>{c.name}</span>
              </Link>
            )
          })}
        </div>
      </section>

      {/* the shop: address, hours, directions + WhatsApp, and the map when Réglages has its coordinates */}
      {(hasMap || place || hours) && (
        <section className={cn("grid grid-cols-1 gap-6", hasMap && "md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:items-center")}>
          <div className="flex flex-col gap-4">
            <h2 className="text-2xl font-medium md:text-[32px]">{t.home.store}</h2>
            {place && <p className="text-lg">{place}</p>}
            {hours && <p className="text-mute"><span className="font-medium text-ink">{t.admin.hours}</span> {hours}</p>}
            <div className="flex flex-wrap gap-2">
              {hasMap && (
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`} target="_blank" rel="noopener noreferrer"
                  className={buttonVariants()}>{t.home.directions}</a>
              )}
              {settings.whatsapp && (
                <a href={`https://wa.me/${settings.whatsapp}`} target="_blank" rel="noopener noreferrer"
                  className={buttonVariants({ variant: "secondary", className: "gap-2" })}>
                  <WhatsAppIcon className="size-5 text-[#25D366]" />{t.home.whatsapp}
                </a>
              )}
            </div>
          </div>
          {hasMap && (
            <iframe src={mapSrc} title={t.home.map} loading="lazy" referrerPolicy="no-referrer"
              className="aspect-[4/3] w-full border-0 bg-cloud md:aspect-[16/10]" />
          )}
        </section>
      )}
    </div>
  )
}
