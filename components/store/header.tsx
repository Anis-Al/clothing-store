import Link from "next/link"
import { Search, ShoppingBag } from "lucide-react"
import { auth } from "@/auth"
import { getShownCategories } from "@/lib/catalog"
import { getI18n } from "@/lib/i18n"
import { logout, setLocale } from "@/lib/actions/auth"
import { CartCount } from "./cart-count"

const link = "block border-b-2 border-transparent py-1 hover:border-ink"

export async function Header() {
  const [{ t, locale }, session, categories] = await Promise.all([
    getI18n(),
    auth(),
    getShownCategories(), // main categories only; sub-categories open on hover
  ])
  const nav = [{ href: "/products", label: t.catalog.all }, ...categories.map((c) => ({ href: `/products?category=${c.slug}`, label: c.name }))]

  return (
    <header className="sticky top-0 z-40 bg-canvas shadow-[inset_0_-1px_0_var(--color-hairline-soft)]">
      {/* utility-bar */}
      <div className="bg-cloud">
        <div className="mx-auto flex h-9 max-w-[1440px] items-center justify-end gap-4 px-4 text-xs font-medium md:px-12">
          <form action={setLocale.bind(null, locale === "ar" ? "fr" : "ar")}>
            <button type="submit" lang={locale === "ar" ? "fr" : "ar"} className="hover:underline">
              {locale === "ar" ? "Français" : "العربية"}
            </button>
          </form>
          {/* customers have no accounts; only a signed-in admin sees these */}
          {session?.user.role === "ADMIN" && (
            <>
              <span className="text-hairline">|</span>
              <Link href="/admin" className="hover:underline">{t.nav.admin}</Link>
              <form action={logout}>
                <button type="submit" className="hover:underline">{t.nav.logout}</button>
              </form>
            </>
          )}
        </div>
      </div>

      {/* primary-nav */}
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-6 px-4 md:px-12">
        <Link href="/" className="font-display text-3xl tracking-wide">{t.store.name}</Link>
        <nav className="hidden min-w-0 flex-1 items-center justify-center gap-6 font-medium whitespace-nowrap md:flex">
          <Link href="/products" className={link}>{t.catalog.all}</Link>
          {categories.map((c) => (
            <div key={c.id} className="group relative">
              {/* the main link opens the whole group (all its sub-categories) */}
              <Link href={`/products?category=${c.slug}`} className={link}>{c.name}</Link>
              {c.children.length > 0 && (
                // CSS-only menu: hover, or keyboard focus inside it. pt-3 bridges the gap so the pointer can reach it.
                <div className="invisible absolute -start-4 top-full z-50 pt-3 opacity-0 transition-opacity group-hover:visible group-hover:opacity-100 group-has-focus-visible:visible group-has-focus-visible:opacity-100">
                  <ul className="min-w-52 bg-canvas py-2 shadow-[0_0_0_1px_var(--color-hairline)]">
                    {c.children.map((s) => (
                      <li key={s.id}>
                        <Link href={`/products?category=${s.slug}`} className="block px-4 py-2 hover:bg-cloud">{s.name}</Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </nav>
        <div className="ms-auto flex items-center gap-2 md:ms-0">
          <form action="/products" role="search" className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2" />
            <input
              name="q"
              type="search"
              placeholder={t.nav.search}
              aria-label={t.nav.search}
              className="h-10 w-32 rounded-[24px] bg-cloud ps-10 pe-4 outline-none transition-[width] focus:w-44 focus:bg-canvas focus:ring-2 focus:ring-ink sm:w-44 sm:focus:w-56"
            />
          </form>
          <Link href="/cart" aria-label={t.nav.cart} className="relative grid size-10 place-items-center rounded-full hover:bg-cloud">
            <ShoppingBag className="size-6" />
            <CartCount />
          </Link>
        </div>
      </div>
      {/* mobile: nav row scrolls horizontally instead of a drawer */}
      <nav className="flex gap-5 overflow-x-auto px-4 pb-3 text-sm font-medium whitespace-nowrap md:hidden">
        {nav.map((n) => <Link key={n.href} href={n.href}>{n.label}</Link>)}
      </nav>
    </header>
  )
}
