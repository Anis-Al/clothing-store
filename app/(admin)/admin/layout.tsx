import Link from "next/link"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { getI18n } from "@/lib/i18n"
import { logout, setLocale } from "@/lib/actions/auth"
import { Boxes, Home, Settings, Shirt, ShoppingBag } from "lucide-react"
import { AdminNavLink, MoreMenu } from "@/components/admin/client"

export const metadata = { robots: { index: false } }

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [session, { t, locale }] = await Promise.all([auth(), getI18n()])
  if (session?.user.role !== "ADMIN") redirect("/login?callbackUrl=/admin")
  const pending = await db.order.count({ where: { status: "PENDING" } })
  const links: [string, string, string, typeof Home][] = [
    ["/admin", t.admin.dashboard, t.admin.dashboardShort, Home],
    ["/admin/products", t.admin.products, t.admin.products, Shirt],
    ["/admin/inventory", t.admin.inventory, t.admin.inventory, Boxes],
    ["/admin/orders", t.admin.orders, t.admin.orders, ShoppingBag],
    ["/admin/settings", t.admin.settings, t.admin.settings, Settings],
  ]
  // store / language / logout: a "⋯" menu on phones, the end of the sidebar on desktop
  const item = "flex h-10 w-full items-center rounded-xl px-3 text-start text-sm hover:bg-cloud md:h-auto md:w-auto md:rounded-none md:p-0 md:text-stone md:hover:bg-transparent md:hover:text-canvas"
  const extras = (
    <>
      {/* the shop in a new tab: the admin page stays open behind it */}
      <a href="/" target="_blank" rel="noopener" className={item}>{t.admin.backToStore}</a>
      <form action={setLocale.bind(null, locale === "ar" ? "fr" : "ar")} className="contents">
        <button type="submit" className={item}>{locale === "ar" ? "Français" : "العربية"}</button>
      </form>
      <form action={logout} className="contents"><button type="submit" className={item}>{t.nav.logout}</button></form>
      <span dir="ltr" className="truncate px-3 pt-1 pb-1.5 text-xs text-mute md:p-0 md:text-stone">{session.user.name}</span>
    </>
  )
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      {/* phones: the aside is display: contents. A thin bar (store name + ⋯ menu) scrolls away; the nav below it is a
          row of five equal tabs (icon + short label, no sideways scroll) that sticks to the top. Desktop: pinned
          sidebar, one viewport tall, so the links at its end (store, language, logout) are always in view. */}
      <aside className="contents text-canvas md:sticky md:top-0 md:flex md:h-dvh md:w-60 md:shrink-0 md:flex-col md:gap-1 md:overflow-y-auto md:bg-ink md:p-6">
        <div className="flex items-center justify-between bg-ink px-4 pt-2 md:mb-4 md:p-0">
          <Link href="/admin" className="font-display text-2xl tracking-wide md:text-3xl">{t.store.name}</Link>
          <div className="md:hidden">
            <MoreMenu label={t.admin.account} triggerClassName="text-canvas hover:bg-charcoal">{extras}</MoreMenu>
          </div>
        </div>
        <nav className="sticky top-0 z-30 grid grid-cols-5 gap-1 bg-ink px-2 py-1.5 md:static md:flex md:flex-col md:p-0">
          {links.map(([href, label, short, Icon]) => (
            <AdminNavLink key={href} href={href} activeClassName="bg-charcoal text-canvas"
              className="relative flex min-w-0 flex-col items-center gap-0.5 rounded-xl px-0 py-1.5 text-[11px] font-medium tracking-tight text-stone hover:text-canvas md:flex-row md:gap-2.5 md:rounded-full md:px-3 md:py-2 md:text-base md:text-canvas md:hover:bg-charcoal">
              <Icon className="size-5 shrink-0" aria-hidden />
              <span className="max-w-full truncate md:hidden">{short}</span>
              <span className="truncate max-md:hidden">{label}</span>
              {href === "/admin/orders" && pending > 0 && (
                <span className="grid min-w-5 place-items-center rounded-full bg-canvas px-1 text-[11px] leading-5 text-ink tabular-nums max-md:absolute max-md:top-0.5 max-md:start-[calc(50%+0.25rem)] md:min-w-6 md:text-xs">{pending}</span>
              )}
            </AdminNavLink>
          ))}
        </nav>
        <div className="flex flex-col gap-2 text-sm max-md:hidden md:mt-auto">{extras}</div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-10">{children}</main>
    </div>
  )
}
