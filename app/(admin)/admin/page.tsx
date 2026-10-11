import Link from "next/link"
import { OrderStatus } from "@prisma/client"
import { DashboardCharts, type Day } from "@/components/admin/charts"
import { db } from "@/lib/db"
import { formatPrice, getI18n, getSettings } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const RANGES = [7, 30, 90] // labels in t.admin.ranges, same order (Arabic plural differs per number)

export default async function Dashboard({ searchParams }: PageProps<"/admin">) {
  const sp = await searchParams
  const range = RANGES.find((n) => String(n) === sp.days) ?? 30
  // Day buckets in the server's time zone (set TZ on the server so they match the shop's days).
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - range + 1)
  const since = { createdAt: { gte: start } }

  const { lowStock } = await getSettings()
  const [{ t, locale }, products, pending, low, revenue, orders, sold] = await Promise.all([
    getI18n(),
    db.product.count(),
    db.order.count({ where: { status: "PENDING" } }),
    db.productVariant.count({ where: { stockCount: { lte: lowStock } } }),
    // Cash on delivery: money is only in hand once the order is delivered.
    db.order.aggregate({ where: { status: "DELIVERED" }, _sum: { totalAmount: true } }),
    db.order.findMany({ where: since, select: { createdAt: true, status: true, totalAmount: true } }),
    // ponytail: rows summed in JS; fine for a shop's volume, a raw SQL GROUP BY if it ever gets slow
    db.orderItem.findMany({
      where: { order: { ...since, status: { not: "CANCELLED" } } },
      select: { quantity: true, variant: { select: { product: { select: { id: true, name: true } } } } },
    }),
  ])

  const key = (d: Date) => d.toLocaleDateString("en-CA") // YYYY-MM-DD, local
  const dayLabel = new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-FR", { day: "numeric", month: "short" })
  const days: Day[] = Array.from({ length: range }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return { date: key(d), label: dayLabel.format(d), orders: 0, amount: 0 }
  })
  const byDay = new Map(days.map((d) => [d.date, d]))
  for (const o of orders) {
    const d = byDay.get(key(o.createdAt))
    if (!d) continue
    d.orders++
    if (o.status !== "CANCELLED") d.amount += o.totalAmount
  }
  const statuses = Object.values(OrderStatus).map((s) => ({ name: t.status[s], value: orders.filter((o) => o.status === s).length }))
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
    cn("inline-flex h-10 items-center rounded-full border px-4 text-sm font-medium", on ? "border-ink bg-ink text-canvas" : "border-hairline hover:border-ink")
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-[32px] font-medium">{t.admin.dashboard}</h1>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="flex flex-col gap-2 bg-cloud p-6 hover:bg-hairline-soft">
            <span className="text-sm font-medium text-mute">{c.label}</span>
            <span className="text-[32px] font-medium">{c.value}</span>
          </Link>
        ))}
      </div>

      <section className="flex flex-col gap-4">
        {/* one range for every chart below */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-2xl font-medium">{t.admin.activity}</h2>
          <nav className="flex gap-2" aria-label={t.admin.activity}>
            {RANGES.map((n, i) => (
              <Link key={n} href={n === 30 ? "/admin" : `/admin?days=${n}`} aria-current={n === range || undefined} className={chip(n === range)}>
                {t.admin.ranges[i]}
              </Link>
            ))}
          </nav>
        </div>
        <DashboardCharts days={days} statuses={statuses} top={top} />
      </section>
    </div>
  )
}
