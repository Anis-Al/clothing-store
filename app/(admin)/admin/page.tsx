import Link from "next/link"
import { DashboardCharts, type Day } from "@/components/admin/charts"
import { db } from "@/lib/db"
import { formatPrice, getI18n, getSettings } from "@/lib/i18n"
import { cn, UNSOLD_STATUSES } from "@/lib/utils"
import { WILAYAS, wilayaValue } from "@/lib/wilayas"

const RANGES = [7, 30, 90] // labels in t.admin.ranges, same order (Arabic plural differs per number); ?days=all = since the first order

export default async function Dashboard({ searchParams }: PageProps<"/admin">) {
  const sp = await searchParams
  const all = sp.days === "all"
  const range = all ? 0 : RANGES.find((n) => String(n) === sp.days) ?? 30
  // Day buckets in the server's time zone (set TZ on the server so they match the shop's days).
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const first = all ? await db.order.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }) : null
  const start = new Date(first?.createdAt ?? today)
  start.setHours(0, 0, 0, 0)
  if (!all) start.setDate(today.getDate() - range + 1)
  const span = Math.round((today.getTime() - start.getTime()) / 864e5) + 1
  // past 90 days a bar per day gets unreadable: one per month instead
  const monthly = span > 90
  const since = all ? {} : { createdAt: { gte: start } }

  const { lowStock } = await getSettings()
  const [{ t, locale }, products, pending, low, revenue, orders, sold] = await Promise.all([
    getI18n(),
    db.product.count(),
    db.order.count({ where: { status: "PENDING" } }),
    db.productVariant.count({ where: { stockCount: { lte: lowStock } } }),
    // Cash on delivery: money is only in hand once the order is delivered.
    db.order.aggregate({ where: { status: "DELIVERED" }, _sum: { totalAmount: true } }),
    db.order.findMany({ where: since, select: { createdAt: true, status: true, totalAmount: true, wilaya: true } }),
    // ponytail: rows summed in JS; fine for a shop's volume, a raw SQL GROUP BY if it ever gets slow
    db.orderItem.findMany({
      where: { order: { ...since, status: { notIn: UNSOLD_STATUSES } } },
      select: { quantity: true, variant: { select: { product: { select: { id: true, name: true } } } } },
    }),
  ])

  const day = (d: Date) => d.toLocaleDateString("en-CA") // YYYY-MM-DD, local
  const key = (d: Date) => (monthly ? day(d).slice(0, 7) : day(d))
  const dayLabel = new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-FR",
    monthly ? { month: "short", year: "numeric" } : { day: "numeric", month: "short" })
  const months = (today.getFullYear() - start.getFullYear()) * 12 + today.getMonth() - start.getMonth() + 1
  const days: Day[] = Array.from({ length: monthly ? months : span }, (_, i) => {
    const d = monthly
      ? new Date(start.getFullYear(), start.getMonth() + i, 1)
      : new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    return { date: key(d), label: dayLabel.format(d), orders: 0, amount: 0 }
  })
  const byDay = new Map(days.map((d) => [d.date, d]))
  for (const o of orders) {
    const d = byDay.get(key(o.createdAt))
    if (!d) continue
    d.orders++
    if (!UNSOLD_STATUSES.includes(o.status)) d.amount += o.totalAmount
  }
  // where the orders go (cancelled ones left out): the top 6 wilayas, pickup orders as their own row
  const perWilaya = new Map<string, number>()
  for (const o of orders) if (o.status !== "CANCELLED") perWilaya.set(o.wilaya, (perWilaya.get(o.wilaya) ?? 0) + 1)
  const wName = (v: string) => {
    if (!v) return t.nav.shop // pickup orders have no wilaya: "Boutique" (the long label gets cut on the axis)
    const w = WILAYAS.find((x) => wilayaValue(x) === v)
    return w ? (locale === "ar" ? w[2] : w[1]) : v.replace(/^\d+ - /, "")
  }
  const wilayas = [...perWilaya].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([v, n]) => ({ name: wName(v), value: n }))
  const qty = new Map<string, { name: string; value: number }>()
  for (const i of sold) {
    const p = i.variant.product
    qty.set(p.id, { name: p.name, value: (qty.get(p.id)?.value ?? 0) + i.quantity })
  }
  const top = [...qty.values()].sort((a, b) => b.value - a.value).slice(0, 5)

  const cards = [
    { label: t.admin.products, value: products, href: "/admin/products" },
    { label: t.admin.pending, value: pending, href: "/admin/orders?status=PENDING" },
    { label: t.admin.lowStock, value: low, href: "/admin/inventory?stock=low" },
    { label: t.admin.revenue, value: formatPrice(revenue._sum.totalAmount ?? 0, locale), href: "/admin/orders?status=DELIVERED" },
  ]
  const chip = (on: boolean) =>
    cn("inline-flex h-9 shrink-0 items-center rounded-full border px-4 text-sm font-medium whitespace-nowrap", on ? "border-ink bg-ink text-canvas" : "border-hairline hover:border-ink")
  return (
    // one screen on a laptop (1280×800): title + range on one row, compact tiles, the four charts in a 2×2 grid
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[28px] font-medium">{t.admin.dashboard}</h1>
        {/* one range for every chart below (the tiles are always "now") */}
        <nav className="flex max-w-full gap-2 overflow-x-auto" aria-label={t.admin.activity}>
          {RANGES.map((n, i) => (
            <Link key={n} href={n === 30 ? "/admin" : `/admin?days=${n}`} aria-current={n === range || undefined} className={chip(n === range)}>
              {t.admin.ranges[i]}
            </Link>
          ))}
          <Link href="/admin?days=all" aria-current={all || undefined} className={chip(all)}>{t.admin.allTime}</Link>
        </nav>
      </div>
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="flex min-w-0 flex-col gap-1 bg-cloud px-4 py-3 hover:bg-hairline-soft">
            <span className="truncate text-sm font-medium text-mute">{c.label}</span>
            <span className="text-2xl font-medium">{c.value}</span>
          </Link>
        ))}
      </div>
      <DashboardCharts days={days} wilayas={wilayas} top={top} monthly={monthly} />
    </div>
  )
}
