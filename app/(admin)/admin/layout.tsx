import Link from "next/link"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { getI18n } from "@/lib/i18n"
import { logout, setLocale } from "@/lib/actions/auth"

export const metadata = { robots: { index: false } }

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [session, { t, locale }] = await Promise.all([auth(), getI18n()])
  if (session?.user.role !== "ADMIN") redirect("/login?callbackUrl=/admin")
  const pending = await db.order.count({ where: { status: "PENDING" } })
  const links = [
    ["/admin", t.admin.dashboard],
    ["/admin/products", t.admin.products],
    ["/admin/inventory", t.admin.inventory],
    ["/admin/orders", t.admin.orders],
    ["/admin/settings", t.admin.settings],
  ]
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      {/* phones: the aside is display: contents, so the nav row alone sticks to the top while the
          store name and the links below it scroll away */}
      <aside className="contents text-canvas md:flex md:w-60 md:shrink-0 md:flex-col md:gap-1 md:bg-ink md:p-6">
        <Link href="/admin" className="bg-ink px-4 pt-4 pb-2 font-display text-3xl tracking-wide md:mb-4 md:p-0">{t.store.name}</Link>
        <nav className="sticky top-0 z-30 flex gap-1 overflow-x-auto bg-ink px-4 py-2 md:static md:flex-col md:p-0">
          {links.map(([href, label]) => (
            <Link key={href} href={href} className="flex items-center gap-2 rounded-full px-4 py-2 font-medium whitespace-nowrap hover:bg-charcoal">
              {label}
              {href === "/admin/orders" && pending > 0 && (
                <span className="grid min-w-6 place-items-center rounded-full bg-canvas px-1.5 text-xs text-ink tabular-nums">{pending}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="flex flex-wrap gap-x-4 gap-y-2 bg-ink px-4 pt-2 pb-4 text-sm text-stone md:mt-auto md:flex-col md:p-0">
          <Link href="/" className="hover:text-canvas">{t.admin.backToStore}</Link>
          <form action={setLocale.bind(null, locale === "ar" ? "fr" : "ar")}>
            <button type="submit" className="hover:text-canvas">{locale === "ar" ? "Français" : "العربية"}</button>
          </form>
          <form action={logout}><button type="submit" className="hover:text-canvas">{t.nav.logout}</button></form>
          <span dir="ltr" className="truncate text-xs">{session.user.name}</span>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-10">{children}</main>
    </div>
  )
}
