import Link from "next/link"
import { getI18n } from "@/lib/i18n"

export async function Footer() {
  const { t } = await getI18n()
  return (
    <footer className="mt-12 border-t border-hairline">
      <div className="mx-auto grid max-w-[1440px] gap-8 px-4 py-10 text-sm font-medium text-mute sm:grid-cols-3 md:px-12">
        <div>
          <p className="mb-3 text-base text-ink">{t.store.name}</p>
          <p>{t.store.tagline}</p>
        </div>
        <div className="flex flex-col gap-2">
          <p className="mb-1 text-base text-ink">{t.nav.shop}</p>
          <Link href="/products" className="hover:text-ink">{t.catalog.all}</Link>
          <Link href="/cart" className="hover:text-ink">{t.nav.cart}</Link>
        </div>
        <div className="flex flex-col gap-2">
          <p className="mb-1 text-base text-ink">{t.nav.help}</p>
          <p>{t.product.shippingText}</p>
        </div>
      </div>
      <p className="mx-auto max-w-[1440px] border-t border-hairline px-4 py-4 text-[11px] text-mute md:px-12">
        © {new Date().getFullYear()} {t.store.name}
      </p>
    </footer>
  )
}
