"use client"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts"
import { useT } from "@/components/i18n-provider"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { formatPrice } from "@/lib/dict"

// Dashboard charts (shadcn chart = Recharts). Every chart is one series, so one color: ink.
// Data is shaped on the server (app/(admin)/admin/page.tsx); this file only draws it.
export type Day = { date: string; label: string; orders: number; amount: number }
export type Row = { name: string; value: number }

const INK = "var(--foreground)"
const axis = { tickLine: false, axisLine: false, tickMargin: 8 } as const
const short = (s: string) => (s.length > 18 ? `${s.slice(0, 17)}…` : s)

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-4 bg-cloud p-6">
      <h3 className="font-medium">{title}</h3>
      {children}
    </section>
  )
}

// Horizontal bars: category on the left, value at the bar tip (so no value needs the tooltip).
function Ranking({ rows, label }: { rows: Row[]; label: string }) {
  const config = { value: { label, color: INK } } satisfies ChartConfig
  return (
    <ChartContainer config={config} dir="ltr" className="aspect-auto w-full" style={{ height: rows.length * 40 + 16 }}>
      <BarChart data={rows} layout="vertical" accessibilityLayer margin={{ right: 40 }}>
        <XAxis type="number" dataKey="value" hide allowDecimals={false} />
        <YAxis type="category" dataKey="name" {...axis} width={130} tickFormatter={short} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="value" fill="var(--color-value)" radius={[0, 4, 4, 0]} maxBarSize={24}>
          <LabelList dataKey="value" position="right" className="fill-foreground font-medium" />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

export function DashboardCharts({ days, statuses, top }: { days: Day[]; statuses: Row[]; top: Row[] }) {
  const { t, locale } = useT()
  const compact = new Intl.NumberFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", { notation: "compact" })
  const config = { orders: { label: t.admin.orders, color: INK }, amount: { label: t.admin.total, color: INK } } satisfies ChartConfig

  if (!days.some((d) => d.orders)) return <p className="bg-cloud p-6 text-mute">{t.admin.noData}</p>

  return (
    <div className="grid gap-2 lg:grid-cols-2">
      <Panel title={t.admin.ordersPerDay}>
        <ChartContainer config={config} dir="ltr" className="aspect-auto h-56 w-full">
          <BarChart data={days} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" {...axis} minTickGap={24} />
            <YAxis {...axis} allowDecimals={false} width={28} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="orders" fill="var(--color-orders)" radius={[4, 4, 0, 0]} maxBarSize={24} />
          </BarChart>
        </ChartContainer>
      </Panel>

      {/* separate chart, not a second y-axis on the one above: counts and dinars don't share a scale */}
      <Panel title={t.admin.amountPerDay}>
        <ChartContainer config={config} dir="ltr" className="aspect-auto h-56 w-full">
          <AreaChart data={days} accessibilityLayer margin={{ right: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" {...axis} minTickGap={24} />
            <YAxis {...axis} width={44} tickFormatter={(v: number) => compact.format(v)} />
            {/* default "dot" indicator: with "line", shadcn nests the date inside the row this formatter replaces */}
            <ChartTooltip content={<ChartTooltipContent formatter={(v) => (
              <span className="flex w-full justify-between gap-4">
                <span className="text-muted-foreground">{t.admin.total}</span>
                <span className="font-medium">{formatPrice(Number(v), locale)}</span>
              </span>
            )} />} />
            <Area dataKey="amount" type="linear" stroke="var(--color-amount)" strokeWidth={2} fill="var(--color-amount)" fillOpacity={0.1} />
          </AreaChart>
        </ChartContainer>
      </Panel>

      <Panel title={t.admin.byStatus}>
        <Ranking rows={statuses} label={t.admin.orders} />
      </Panel>

      <Panel title={t.admin.topProducts}>
        {top.length ? <Ranking rows={top} label={t.admin.items} /> : <p className="text-mute">{t.admin.noData}</p>}
      </Panel>

      {/* the per-day values for screen readers (the bars and the area have no visible numbers) */}
      <table className="sr-only">
        <caption>{t.admin.ordersPerDay}</caption>
        <thead><tr><th>{t.admin.date}</th><th>{t.admin.orders}</th><th>{t.admin.total}</th></tr></thead>
        <tbody>
          {days.filter((d) => d.orders).map((d) => (
            <tr key={d.date}><td>{d.label}</td><td>{d.orders}</td><td>{formatPrice(d.amount, locale)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
