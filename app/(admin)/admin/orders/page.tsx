import Link from "next/link"
import { OrderStatus, type Prisma } from "@prisma/client"
import { Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Notice, Pager } from "@/components/admin/fields"
import { FormSelect } from "@/components/form-select"
import { WhatsAppIcon } from "@/components/whatsapp-icon"
import { updateOrderStatus } from "@/lib/actions/admin"
import { db } from "@/lib/db"
import { formatDate, formatPrice, getI18n } from "@/lib/i18n"
import { cn, FINAL_STATUSES, listParams, paginate } from "@/lib/utils"

const STATUSES = Object.values(OrderStatus) // schema order: the COD flow
const PER_PAGE = 10

export default async function Orders({ searchParams }: PageProps<"/admin/orders">) {
  const sp = await searchParams
  const status = STATUSES.find((s) => s === sp.status)
  const { q, page: asked } = listParams(sp)
  const digits = q.replace(/\D/g, "")
  // q matches the buyer's name, phone (spaces ignored) or the 8-char ref shown in the table
  const where: Prisma.OrderWhereInput = {
    ...(status && { status }),
    ...(q && {
      OR: [
        { fullName: { contains: q } },
        ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
        { id: { endsWith: q.replace(/^#/, "").toLowerCase() } },
      ],
    }),
  }
  const [{ t, locale }, total, counts] = await Promise.all([
    getI18n(),
    db.order.count({ where }),
    db.order.groupBy({ by: ["status"], _count: true }),
  ])
  const { page, pages, skip, take } = paginate(total, asked, PER_PAGE)
  const orders = await db.order.findMany({
    where, skip, take,
    orderBy: { createdAt: "desc" },
    include: { items: { include: { variant: { include: { product: true } } } } },
  })
  const count = (s?: OrderStatus) => counts.reduce((n, c) => n + (!s || c.status === s ? c._count : 0), 0)
  // tabs and search go back to page 1; a status change returns to the current page
  const tab = (s?: OrderStatus, n = 1) => {
    const p = new URLSearchParams({ ...(s && { status: s }), ...(q && { q }), ...(n > 1 && { page: String(n) }) })
    return `/admin/orders${p.size ? `?${p}` : ""}`
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[32px] font-medium">{t.admin.orders}</h1>
      <Notice t={t} sp={searchParams} />
      <div className="flex flex-wrap items-center gap-2">
        {[undefined, ...STATUSES].map((s) => (
          <Link key={s ?? "all"} href={tab(s)} aria-current={status === s || undefined}
            className={cn("inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium",
              status === s ? "border-ink bg-ink text-canvas" : "border-hairline hover:border-ink")}>
            {s ? t.status[s] : t.admin.all}
            <span className="tabular-nums opacity-60">{count(s)}</span>
          </Link>
        ))}
        <form action="/admin/orders" role="search" className="relative ms-auto">
          {status && <input type="hidden" name="status" value={status} />}
          <Search className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2" />
          <input name="q" type="search" defaultValue={q} placeholder={t.admin.searchOrders} aria-label={t.admin.search}
            className="h-10 w-64 rounded-[24px] bg-cloud ps-10 pe-4 outline-none focus:bg-canvas focus:ring-2 focus:ring-ink" />
        </form>
      </div>
      <Table stack>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>{t.admin.date}</TableHead>
            <TableHead>{t.admin.delivery}</TableHead>
            <TableHead>{t.admin.items}</TableHead>
            <TableHead>{t.admin.total}</TableHead>
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
                    <p>{o.wilaya}</p>
                    <p className="text-mute">{o.address}</p>
                  </>
                ) : "—"}
              </TableCell>
              <TableCell className="min-w-56 whitespace-normal max-md:basis-full">
                <ul className="text-sm">
                  {o.items.map((i) => <li key={i.id}>{i.quantity} × {i.variant.product.name} ({i.variant.color} / {i.variant.size})</li>)}
                </ul>
              </TableCell>
              <TableCell className="font-medium">{formatPrice(o.totalAmount, locale)}</TableCell>
              <TableCell className="max-md:ms-auto">
                {FINAL_STATUSES.includes(o.status) ? (
                  <Badge variant={o.status === "CANCELLED" ? "outline" : "secondary"}
                    className={cn("h-9 px-4 text-sm", o.status === "CANCELLED" && "text-mute")}>{t.status[o.status]}</Badge>
                ) : (
                  <form action={updateOrderStatus.bind(null, o.id, tab(status, page))}>
                    <FormSelect name="status" autoSubmit size="sm" defaultValue={o.status} aria-label={t.admin.status}
                      confirm={{ values: FINAL_STATUSES, message: t.admin.confirmFinal }}
                      className={cn("w-40", o.status === "PENDING" && "font-medium")}
                      items={STATUSES.map((s) => ({ value: s, label: t.status[s] }))} />
                  </form>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!orders.length && <p className="text-mute">{t.admin.none}</p>}
      <Pager t={t} page={page} pages={pages} href={(n) => tab(status, n)} />
    </div>
  )
}
