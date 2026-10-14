import Link from "next/link"
import { OrderStatus, type Prisma } from "@prisma/client"
import { ArrowDown, ArrowUp, ChevronsUpDown, Search, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { NoteInput } from "@/components/admin/client"
import { FiltersPill, Notice, Pager } from "@/components/admin/fields"
import { FormSelect } from "@/components/form-select"
import { WhatsAppIcon } from "@/components/whatsapp-icon"
import { updateOrderNote, updateOrderStatus } from "@/lib/actions/admin"
import { db } from "@/lib/db"
import { formatDate, formatPrice, getI18n } from "@/lib/i18n"
import { cn, FINAL_STATUSES, listParams, paginate } from "@/lib/utils"

const STATUSES = Object.values(OrderStatus) // schema order: the COD flow
const PER_PAGE = 10
// Column headers sort: ?sort=<column>-<asc|desc>, none = newest first. Wilaya sorts as text ("16 - Alger"):
// it groups a wilaya's parcels, codes aren't in numeric order. Status: the tabs filter it instead.
const SORTS = { date: "createdAt", wilaya: "wilaya", total: "totalAmount" } as const
type SortKey = keyof typeof SORTS

export default async function Orders({ searchParams }: PageProps<"/admin/orders">) {
  const sp = await searchParams
  const status = STATUSES.find((s) => s === sp.status)
  const { q, page: asked } = listParams(sp)
  const m = /^(date|wilaya|total)-(asc|desc)$/.exec(typeof sp.sort === "string" ? sp.sort : "")
  const [sortKey, sortDir] = (m ? [m[1], m[2]] : ["date", "desc"]) as [SortKey, "asc" | "desc"]
  const sort = m && m[0] !== "date-desc" ? m[0] : ""
  // ?from / ?to = YYYY-MM-DD (native date inputs), both days included, in the server's time zone like the dashboard
  const day = (k: string) => { const v = sp[k]; return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "" }
  let [from, to] = [day("from"), day("to")]
  if (from && to && from > to) [from, to] = [to, from]
  const dayStart = (d: string, plus = 0) => { const x = new Date(`${d}T00:00`); x.setDate(x.getDate() + plus); return x }
  const digits = q.replace(/\D/g, "")
  // q matches the buyer's name, phone (spaces ignored) or the 8-char ref shown in the table
  const base: Prisma.OrderWhereInput = {
    ...(q && {
      OR: [
        { fullName: { contains: q } },
        ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
        { id: { endsWith: q.replace(/^#/, "").toLowerCase() } },
      ],
    }),
    ...((from || to) && { createdAt: { ...(from && { gte: dayStart(from) }), ...(to && { lt: dayStart(to, 1) }) } }),
  }
  const where = { ...base, ...(status && { status }) }
  const [{ t, locale }, total, counts] = await Promise.all([
    getI18n(),
    db.order.count({ where }),
    db.order.groupBy({ by: ["status"], where: base, _count: true }), // tab counts follow search + dates
  ])
  const { page, pages, skip, take } = paginate(total, asked, PER_PAGE)
  const orders = await db.order.findMany({
    where, skip, take,
    orderBy: [{ [SORTS[sortKey]]: sortDir } as Prisma.OrderOrderByWithRelationInput, { createdAt: "desc" }],
    include: { items: { include: { variant: { include: { product: true } } } } },
  })
  const count = (s?: OrderStatus) => counts.reduce((n, c) => n + (!s || c.status === s ? c._count : 0), 0)
  // Same list with some params changed. Filters, search and sorting go back to page 1; a status change or
  // note passes the current page. Empty values and page 1 stay out of the URL.
  const cur = { status, q, sort, from, to }
  const href = (patch: Partial<typeof cur> & { page?: number } = {}) => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...cur, page: 1, ...patch })) if (v && v !== 1) p.set(k, String(v))
    return `/admin/orders${p.size ? `?${p}` : ""}`
  }
  // GET forms carry the other params
  const keep = (...keys: (keyof typeof cur)[]) => keys.map((k) => cur[k] && <input key={k} type="hidden" name={k} value={cur[k]} />)
  // click: same column flips, another one starts newest / highest first (wilaya: A → Z)
  const head = (k: SortKey, label: string) => {
    const on = k === sortKey
    const next = `${k}-${on ? (sortDir === "asc" ? "desc" : "asc") : k === "wilaya" ? "asc" : "desc"}`
    const Icon = !on ? ChevronsUpDown : sortDir === "asc" ? ArrowUp : ArrowDown
    return (
      <TableHead aria-sort={on ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>
        <Link href={href({ sort: next === "date-desc" ? "" : next })} className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
          {label} <Icon className={cn("size-4", !on && "text-mute")} />
        </Link>
      </TableHead>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[32px] font-medium">{t.admin.orders}</h1>
      <Notice t={t} sp={searchParams} />
      <div className="flex flex-wrap items-center gap-2 md:gap-4">
        <form action="/admin/orders" role="search" className="relative max-md:flex-1 md:order-last md:ms-auto">
          {keep("status", "sort", "from", "to")}
          <Search className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2" />
          <input name="q" type="search" defaultValue={q} placeholder={t.admin.searchOrders} aria-label={t.admin.search}
            className="h-10 w-full rounded-[24px] bg-cloud ps-10 pe-4 outline-none focus:bg-canvas focus:ring-2 focus:ring-ink md:w-64" />
        </form>
        <FiltersPill t={t} active={(status ? 1 : 0) + (from || to ? 1 : 0)} />
        {/* phones: status pills + dates in the fold. Desktop (md:contents): row 1 = status tab strip (Nike sub-nav:
            text, ink underline on the current one, hairline under it), row 2 = dates, search at the end */}
        <div className="flex flex-wrap items-center gap-2 max-md:hidden max-md:basis-full peer-open:flex md:contents">
          <nav aria-label={t.admin.status} className="flex basis-full flex-wrap items-center gap-2 md:gap-5 md:shadow-[inset_0_-1px_0_var(--color-hairline-soft)]">
            {[undefined, ...STATUSES].map((s) => (
              <Link key={s ?? "all"} href={href({ status: s })} aria-current={status === s || undefined}
                className={cn("inline-flex items-center gap-1.5 text-sm font-medium whitespace-nowrap",
                  "max-md:h-10 max-md:rounded-full max-md:border max-md:px-4 md:h-12 md:border-b-2",
                  status === s
                    ? "max-md:border-ink max-md:bg-ink max-md:text-canvas md:border-ink"
                    : "max-md:border-hairline max-md:hover:border-ink md:border-transparent md:text-mute md:hover:text-ink")}>
                {s ? t.status[s] : t.admin.all}
                <span className="tabular-nums opacity-60">{count(s)}</span>
              </Link>
            ))}
          </nav>
          {/* a button, not auto-submit: typing a year in a date field fires change at every digit */}
          <form action="/admin/orders" className="flex items-center gap-2 text-sm max-md:w-full max-md:flex-wrap">
            {keep("status", "q", "sort")}
            <label className="flex items-center gap-2 max-md:w-[calc(50%-0.25rem)]">
              {t.admin.dateFrom}
              <Input type="date" name="from" defaultValue={from} className="h-10 px-3 text-sm md:w-40" />
            </label>
            <label className="flex items-center gap-2 max-md:w-[calc(50%-0.25rem)]">
              {t.admin.dateTo}
              <Input type="date" name="to" defaultValue={to} className="h-10 px-3 text-sm md:w-40" />
            </label>
            <Button type="submit" size="sm" variant="secondary">{t.admin.apply}</Button>
            {(from || to) && (
              <Link href={href({ from: "", to: "" })} aria-label={t.admin.clearDates} title={t.admin.clearDates}
                className="grid size-10 place-items-center rounded-full hover:bg-cloud"><X className="size-4" /></Link>
            )}
          </form>
        </div>
      </div>
      <Table stack>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            {head("date", t.admin.date)}
            {head("wilaya", t.admin.delivery)}
            <TableHead>{t.admin.items}</TableHead>
            {head("total", t.admin.total)}
            <TableHead>{t.admin.status}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((o) => (
            <TableRow key={o.id} className="align-top">
              <TableCell className="font-mono text-xs" dir="ltr">{o.id.slice(-8).toUpperCase()}</TableCell>
              <TableCell>{formatDate(o.createdAt, locale)}</TableCell>
              <TableCell className="min-w-48 whitespace-normal text-sm max-md:basis-full">
                {o.wilaya ? (
                  <>
                    <p className="font-medium">{o.fullName}</p>
                    <p className="flex items-center gap-2">
                      <a href={`tel:${o.phone}`} dir="ltr" className="underline underline-offset-4">{o.phone}</a>
                      {/* phone is stored as 0XXXXXXXXX → wa.me wants 213XXXXXXXXX */}
                      <a href={`https://wa.me/213${o.phone.slice(1)}`} target="_blank" rel="noopener noreferrer" title="WhatsApp" aria-label="WhatsApp">
                        <WhatsAppIcon className="size-5 text-[#25D366]" />
                      </a>
                    </p>
                    <p>{o.commune && `${o.commune}, `}{o.wilaya}</p>
                    <p className="text-mute">{o.address}</p>
                  </>
                ) : <p>—</p>}
                {/* the call's outcome, typed right after calling from the link above. Reads as text; a dashed
                    line on hover shows it's editable. Saves on Enter or when leaving the field changed. */}
                <form action={updateOrderNote.bind(null, o.id, href({ page }))} className="mt-2">
                  <NoteInput name="note" defaultValue={o.note} maxLength={500} placeholder={t.admin.notePlaceholder} aria-label={t.admin.note}
                    className="h-8 w-full border-b border-dashed border-transparent bg-transparent text-sm outline-none placeholder:text-mute hover:border-hairline focus:border-solid focus:border-ink" />
                </form>
              </TableCell>
              <TableCell className="min-w-56 whitespace-normal max-md:basis-full">
                <ul className="text-sm">
                  {o.items.map((i) => <li key={i.id}>{i.quantity} × {i.variant.product.name} ({i.variant.color} / {i.variant.size})</li>)}
                </ul>
              </TableCell>
              <TableCell className="font-medium">{formatPrice(o.totalAmount, locale)}</TableCell>
              <TableCell className="max-md:ms-auto">
                {FINAL_STATUSES.includes(o.status) ? (
                  <Badge variant={o.status === "DELIVERED" ? "secondary" : "outline"}
                    className={cn("h-9 px-4 text-sm", o.status === "CANCELLED" && "text-mute", o.status === "RETURNED" && "text-sale")}>
                    {t.status[o.status]}
                  </Badge>
                ) : (
                  <form action={updateOrderStatus.bind(null, o.id, href({ page }))}>
                    <FormSelect name="status" autoSubmit size="sm" defaultValue={o.status} aria-label={t.admin.status}
                      confirm={{ values: FINAL_STATUSES, message: t.admin.confirmFinal }}
                      className={cn("w-40", o.status === "PENDING" && "font-medium")}
                      // only a shipped parcel can come back (the action checks it too)
                      items={STATUSES.filter((s) => s !== "RETURNED" || o.status === "SHIPPED").map((s) => ({ value: s, label: t.status[s] }))} />
                  </form>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!orders.length && <p className="text-mute">{t.admin.none}</p>}
      <Pager t={t} page={page} pages={pages} href={(n) => href({ page: n })} />
    </div>
  )
}
