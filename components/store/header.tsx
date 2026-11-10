import Link from "next/link"
import { ChevronDown, Search, ShoppingBag } from "lucide-react"
import { auth } from "@/auth"
import { getShownCategories } from "@/lib/catalog"
import { getI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { logout, setLocale } from "@/lib/actions/auth"
import { CartCount } from "./cart-count"
import { MenuDrawer } from "./menu-drawer"

const link = "block border-b-2 border-transparent py-1 hover:border-ink"
// CSS hover / keyboard-focus menu under a navbar entry; pt-3 bridges the gap so the pointer can reach it
const pop = "invisible absolute top-full z-50 pt-3 opacity-0 transition-opacity group-hover:visible group-hover:opacity-100 group-has-focus-visible:visible group-has-focus-visible:opacity-100"
// ponytail: how many main categories fit is set per breakpoint (2 from lg, 4 from xl, 6 from 2xl), the rest go under
// "Plus". Sized for names like "Chaussures & accessoires"; much longer names need a lower count here.
const SHOWN = [["", ""], ["", ""], ["hidden xl:block", "xl:hidden"], ["hidden xl:block", "xl:hidden"], ["hidden 2xl:block", "2xl:hidden"], ["hidden 2xl:block", "2xl:hidden"]]
const shown = (i: number) => SHOWN[i] ?? ["hidden", ""] // [navbar entry, its row in "Plus"]

export async function Header() {
  const [{ t, locale }, session, categories] = await Promise.all([
    getI18n(),
    auth(),
    getShownCategories(), // main categories only; sub-categories open on hover
  ])
  const cat = (slug: string) => `/products?category=${slug}`
  // "Plus" shows only while some category is left out of the navbar at that width
  const more = categories.length <= 2 ? "hidden" : categories.length <= 4 ? "xl:hidden" : categories.length <= 6 ? "2xl:hidden" : ""

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
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-4 lg:gap-6 md:px-12">
        <MenuDrawer label={t.nav.menu}>
          {/* every category, two levels: a main one with sub-categories folds open in place */}
          <ul className="flex flex-col divide-y divide-hairline text-lg font-medium">
            <li><Link href="/products" className="flex h-14 items-center">{t.catalog.all}</Link></li>
            {categories.map((c) => (
              <li key={c.id}>
                {c.children.length ? (
                  <details className="group/cat">
                    <summary className="flex h-14 cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden">
                      {c.name}<ChevronDown className="size-5 text-mute transition-transform group-open/cat:rotate-180" />
                    </summary>
                    <ul className="flex flex-col pb-3 text-base font-normal motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 duration-200">
                      <li><Link href={cat(c.slug)} className="flex h-11 items-center ps-4">{t.catalog.all}</Link></li>
                      {c.children.map((s) => (
                        <li key={s.id}><Link href={cat(s.slug)} className="flex h-11 items-center ps-4">{s.name}</Link></li>
                      ))}
                    </ul>
                  </details>
                ) : (
                  <Link href={cat(c.slug)} className="flex h-14 items-center">{c.name}</Link>
                )}
              </li>
            ))}
          </ul>
        </MenuDrawer>
        <Link href="/" className="shrink-0 font-display text-2xl tracking-wide whitespace-nowrap sm:text-3xl">{t.store.name}</Link>
        <nav className="hidden min-w-0 flex-1 items-center justify-center gap-4 font-medium xl:gap-6 whitespace-nowrap lg:flex">
          <Link href="/products" className={link}>{t.catalog.all}</Link>
          {categories.map((c, i) => (
            <div key={c.id} className={cn("group relative", shown(i)[0])}>
              {/* the main link opens the whole group (all its sub-categories) */}
              <Link href={cat(c.slug)} className={link}>{c.name}</Link>
              {c.children.length > 0 && (
                <div className={cn(pop, "-start-4")}>
                  <ul className="min-w-52 bg-canvas py-2 shadow-[0_0_0_1px_var(--color-hairline)]">
                    {c.children.map((s) => (
                      <li key={s.id}>
                        <Link href={cat(s.slug)} className="block px-4 py-2 hover:bg-cloud">{s.name}</Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
          <div className={cn("group relative", more)}>
            <button type="button" className={cn(link, "flex items-center gap-1")}>{t.nav.more}<ChevronDown className="size-4" /></button>
            <div className={cn(pop, "-end-4")}>
              <ul className="min-w-60 bg-canvas py-2 shadow-[0_0_0_1px_var(--color-hairline)]">
                {categories.map((c, i) => (
                  <li key={c.id} className={shown(i)[1] || "hidden"}>
                    <Link href={cat(c.slug)} className="block px-4 py-2 font-medium hover:bg-cloud">{c.name}</Link>
                    {c.children.map((s) => (
                      <Link key={s.id} href={cat(s.slug)} className="block py-1.5 ps-8 pe-4 text-sm font-normal text-mute hover:bg-cloud hover:text-ink">{s.name}</Link>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </nav>
        <div className="ms-auto flex min-w-0 flex-1 items-center justify-end gap-2 lg:ms-0 lg:flex-none">
          <form action="/products" role="search" className="relative min-w-0 flex-1 sm:flex-none">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2" />
            <input
              name="q"
              type="search"
              placeholder={t.nav.search}
              aria-label={t.nav.search}
              className="h-10 w-full min-w-0 rounded-[24px] bg-cloud ps-10 pe-4 outline-none transition-[width] focus:bg-canvas focus:ring-2 focus:ring-ink sm:w-44 sm:focus:w-56"
            />
          </form>
          <Link href="/cart" aria-label={t.nav.cart} className="relative grid size-10 place-items-center rounded-full hover:bg-cloud">
            <ShoppingBag className="size-6" />
            <CartCount />
          </Link>
        </div>
      </div>
    </header>
  )
}
