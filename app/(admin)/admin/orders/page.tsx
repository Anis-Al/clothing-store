import Link from "next/link"
import { DeliveryMethod, OrderStatus, type Prisma } from "@prisma/client"
import { Check, CircleCheck, Clock, MapPin, Package, Phone, RefreshCw, Search, Store, Truck, Undo2, X } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ConfirmButton, MoreMenu, NoteInput, OrderCard } from "@/components/admin/client"
import { FiltersPill, Notice, Pager } from "@/components/admin/fields"
import { FormSelect } from "@/components/form-select"
import { WhatsAppIcon } from "@/components/whatsapp-icon"
import { sendToCourier, trackAll, trackOrder, updateOrderNote, updateOrderStatus } from "@/lib/actions/admin"
import { trackable } from "@/lib/tracking"
import { courierReady } from "@/lib/courier"
import { courierOf } from "@/lib/couriers"
import { db } from "@/lib/db"
import { fill, formatDate, formatPrice, getI18n, getSettings } from "@/lib/i18n"
import { cn, FINAL_STATUSES, listParams, paginate } from "@/lib/utils"
import { communeLabel, communesOf, WILAYAS, wilayaValue } from "@/lib/wilayas"

const STATUSES = Object.values(OrderStatus) // schema order: the COD flow
const METHODS = Object.values(DeliveryMethod)
const PER_PAGE = 3 // cards are tall (user's call)
// ?sort=<column>-<asc|desc>, none = newest first. Wilaya sorts as text ("16 - Alger"): it groups a wilaya's parcels,
// codes aren't in numeric order. Status isn't a sort: the tabs filter it.
const SORTS = { date: "createdAt", wilaya: "wilaya", total: "totalAmount" } as const
type SortKey = keyof typeof SORTS
// one colour per status: the dot in the tabs and on each card's top line
const TONE: Record<OrderStatus, string> = {
  PENDING: "bg-[#b45309]", CONFIRMED: "bg-info", SHIPPED: "bg-ink", DELIVERED: "bg-success", RETURNED: "bg-sale", CANCELLED: "bg-stone",
}
const Dot = ({ s }: { s: OrderStatus }) => <span aria-hidden className={cn("size-2 shrink-0 rounded-full", TONE[s])} />
// the card's status, shown once and loud: a solid chip in the status' colour with its own icon, then (desktop) how far
// the order got along PENDING → CONFIRMED → SHIPPED → DELIVERED (a returned one ends red, a cancelled one stays empty)
const CHIP: Record<OrderStatus, string> = {
  PENDING: "bg-[#b45309] text-canvas", CONFIRMED: "bg-info text-canvas", SHIPPED: "bg-ink text-canvas",
  DELIVERED: "bg-success text-canvas", RETURNED: "bg-sale text-canvas", CANCELLED: "bg-hairline text-ink",
}
const STATUS_ICON = { PENDING: Clock, CONFIRMED: Check, SHIPPED: Package, DELIVERED: CircleCheck, RETURNED: Undo2, CANCELLED: X } as const
const StatusChip = ({ s, label }: { s: OrderStatus; label: string }) => {
  const Icon = STATUS_ICON[s]
  return (
    <span className={cn("inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full ps-2 pe-3 text-sm font-semibold whitespace-nowrap", CHIP[s])}>
      <Icon className="size-4" aria-hidden />{label}
    </span>
  )
}
const FLOW = ["PENDING", "CONFIRMED", "SHIPPED", "DELIVERED"] as const
const Progress = ({ s }: { s: OrderStatus }) => {
  const reached = s === "CANCELLED" ? -1 : s === "RETURNED" ? 3 : FLOW.indexOf(s as (typeof FLOW)[number])
  return (
    <span aria-hidden className="flex items-center gap-1">
      {FLOW.map((step, i) => (
        <span key={step} className={cn("h-1.5 w-6 rounded-full", i > reached ? "bg-hairline-soft" : s === "RETURNED" ? (i === 3 ? "bg-sale" : "bg-ink") : TONE[s])} />
      ))}
    </span>
  )
}
const METHOD_ICON = { HOME: Truck, PICKUP: Store, STOPDESK: MapPin } as const

// Commandes: one card per order (customer · delivery · items · total + status), status tabs on top, then the method
// and sort selects, the date range and the search. Everything is in the URL; `href(patch)` builds every link and the
// `back` of the status / note / courier actions, `keep(...)` the hidden inputs of the GET forms.
export default async function Orders({ searchParams }: PageProps<"/admin/orders">) {
  const sp = await searchParams
  const status = STATUSES.find((s) => s === sp.status)
  const method = METHODS.find((s) => s === sp.method)
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
  // q matches the buyer's name, phone (spaces ignored) or the 8-char ref shown on the card
  const base: Prisma.OrderWhereInput = {
    ...(q && {
      OR: [
        { fullName: { contains: q } },
        ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
        { id: { endsWith: q.replace(/^#/, "").toLowerCase() } },
      ],
    }),
    ...(method && { method }),
    ...((from || to) && { createdAt: { ...(from && { gte: dayStart(from) }), ...(to && { lt: dayStart(to, 1) }) } }),
  }
  const where = { ...base, ...(status && { status }) }
  const [{ t, locale }, settings, total, counts] = await Promise.all([
    getI18n(),
    getSettings(),
    db.order.count({ where }),
    db.order.groupBy({ by: ["status"], where: base, _count: true }), // tab counts follow search, method + dates
  ])
  // "Envoyer à <courier>" once the courier is set up (Réglages › Livraison, debug)
  const courier = courierReady(settings) ? courierOf(settings.courier)?.[1] : undefined
  // open parcels at that courier: "Tout actualiser" asks about all of them (the cron sync does the same every few hours)
  const tracked = courier ? await db.order.count({ where: trackable(settings.courier) }) : 0
  const { page, pages, skip, take } = paginate(total, asked, PER_PAGE)
  const orders = await db.order.findMany({
    where, skip, take,
    orderBy: [{ [SORTS[sortKey]]: sortDir } as Prisma.OrderOrderByWithRelationInput, { createdAt: "desc" }],
    include: { items: { include: { variant: { include: { product: true } } } } },
  })
  const count = (s?: OrderStatus) => counts.reduce((n, c) => n + (!s || c.status === s ? c._count : 0), 0)
  // Same list with some params changed. Filters, search and sorting go back to page 1; a status change or
  // note passes the current page. Empty values and page 1 stay out of the URL.
  const cur = { status, method, q, sort, from, to }
  const href = (patch: Partial<typeof cur> & { page?: number } = {}) => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...cur, page: 1, ...patch })) if (v && v !== 1) p.set(k, String(v))
    return `/admin/orders${p.size ? `?${p}` : ""}`
  }
  // GET forms carry the other params
  const keep = (...keys: (keyof typeof cur)[]) => keys.map((k) => cur[k] && <input key={k} type="hidden" name={k} value={cur[k]} />)
  const methodLabel = { HOME: t.admin.homeDelivery, PICKUP: t.admin.pickup, STOPDESK: t.admin.stopdesk }
  // "Akbou, Béjaïa": names only, in the UI language (stored values stay "06 - Béjaïa" + the Latin commune);
  // a commune named like its wilaya ("Oran, Oran") shows once
  const place = (wilaya: string, commune: string) => {
    const w = WILAYAS.find((x) => wilayaValue(x) === wilaya)
    const wName = w ? (locale === "ar" ? w[2] : w[1]) : wilaya.replace(/^\d+ - /, "")
    const c = communesOf(wilaya).find(([fr]) => fr === commune)
    const cName = c ? (locale === "ar" ? c[1] : communeLabel(c[0])) : commune
    return [cName && cName !== wName && !(w && commune === w[1]) ? cName : "", wName].filter(Boolean).join(locale === "ar" ? "، " : ", ")
  }
  // a pickup order isn't shipped: Expédiée reads "Prête en boutique", Livrée "Retirée", Retournée "Non retirée"
  // (same states, same stock rules)
  const statusLabel = (s: OrderStatus, mth: DeliveryMethod) => mth !== "PICKUP" ? t.status[s]
    : s === "SHIPPED" ? t.admin.readyPickup : s === "DELIVERED" ? t.admin.collected : s === "RETURNED" ? t.admin.notCollected : t.status[s]
  // Status changes as next-step buttons: one main button for the usual next step of the COD flow, the others (going
  // back after a wrong click, return, cancel) in the ⋯ menu. Final targets ask first. The action re-checks every move.
  type Step = { to: OrderStatus; label: string }
  const stepsOf = (s: OrderStatus, mth: DeliveryMethod): { next?: Step; more: Step[] } => {
    const pickup = mth === "PICKUP"
    const cancel = { to: "CANCELLED" as const, label: t.admin.actCancel }
    if (s === "PENDING") return { next: { to: "CONFIRMED", label: t.admin.actConfirm }, more: [cancel] }
    if (s === "CONFIRMED") return {
      next: { to: "SHIPPED", label: pickup ? t.admin.actReady : t.admin.actShip },
      more: [{ to: "PENDING", label: t.admin.actBackPending }, cancel],
    }
    if (s === "SHIPPED") return {
      next: { to: "DELIVERED", label: pickup ? t.admin.actCollect : t.admin.actDeliver },
      more: [{ to: "RETURNED", label: pickup ? t.admin.actNotCollected : t.admin.actReturn }, { to: "CONFIRMED", label: t.admin.actBackConfirmed }, cancel],
    }
    return { more: [] }
  }
  // column caption on the card (Détails over the delivery column, Articles over the items)
  const caption = "text-xs font-medium text-mute"
  const pill = "inline-flex h-8 items-center gap-1.5 rounded-full bg-cloud px-3 text-sm hover:bg-hairline-soft"
  // the delivery method as an ink disc with its icon (À domicile truck, Retrait store, Point relais pin)
  const MethodMark = ({ m, small }: { m: DeliveryMethod; small?: boolean }) => {
    const Icon = METHOD_ICON[m]
    return (
      <span aria-hidden className={cn("grid shrink-0 place-items-center rounded-full bg-ink text-canvas", small ? "size-6" : "size-8")}>
        <Icon className={small ? "size-3.5" : "size-4"} />
      </span>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-baseline gap-3 text-[32px] font-medium">
          {t.admin.orders}
          <span className="text-base font-normal text-mute tabular-nums">{fill(t.admin.ordersCount, { n: total })}</span>
        </h1>
        {tracked > 0 && (
          <form action={trackAll.bind(null, href({ page }))}>
            <button type="submit" className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "gap-2")}>
              <RefreshCw className="size-4" />{t.admin.trackAll}<span className="tabular-nums text-mute">{tracked}</span>
            </button>
          </form>
        )}
      </div>
      <Notice t={t} sp={searchParams} />

      <div className="flex flex-wrap items-center gap-2 md:gap-3">
        <form action="/admin/orders" role="search" className="relative max-md:flex-1 md:order-last md:ms-auto">
          {keep("status", "method", "sort", "from", "to")}
          <Search className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2" />
          <input name="q" type="search" defaultValue={q} placeholder={t.admin.searchOrders} aria-label={t.admin.search}
            className="h-10 w-full rounded-[24px] bg-cloud ps-10 pe-4 outline-none focus:bg-canvas focus:ring-2 focus:ring-ink md:w-64" />
        </form>
        <FiltersPill t={t} active={(status ? 1 : 0) + (method ? 1 : 0) + (from || to ? 1 : 0)} />
        {/* phones: everything below in the fold. Desktop (md:contents): row 1 = status tab strip (Nike sub-nav: text,
            ink underline on the current one), row 2 = method + sort, dates, search at the end */}
        <div className="flex flex-wrap items-center gap-2 max-md:hidden max-md:basis-full peer-open:flex md:contents">
          <nav aria-label={t.admin.status} className="flex min-w-0 basis-full flex-wrap items-center gap-2 md:max-w-full md:flex-nowrap md:gap-5 md:overflow-x-auto md:shadow-[inset_0_-1px_0_var(--color-hairline-soft)]">
            {[undefined, ...STATUSES].map((s) => (
              <Link key={s ?? "all"} href={href({ status: s })} aria-current={status === s || undefined}
                className={cn("inline-flex items-center gap-1.5 text-sm font-medium whitespace-nowrap",
                  "max-md:h-10 max-md:rounded-full max-md:border max-md:px-4 md:h-12 md:border-b-2",
                  status === s
                    ? "max-md:border-ink max-md:bg-ink max-md:text-canvas md:border-ink"
                    : "max-md:border-hairline max-md:hover:border-ink md:border-transparent md:text-mute md:hover:text-ink")}>
                {s && <Dot s={s} />}
                {s ? t.status[s] : t.admin.all}
                <span className="tabular-nums opacity-60">{count(s)}</span>
              </Link>
            ))}
          </nav>
          {/* method + sort: one GET form, each select submits it ("all" / "date-desc" = no param) */}
          <form action="/admin/orders" className="flex items-center gap-2 max-md:w-full">
            {keep("status", "q", "from", "to")}
            <FormSelect name="method" autoSubmit size="sm" aria-label={t.admin.delivery} defaultValue={method ?? "all"} className="w-44 max-md:flex-1"
              items={[{ value: "all", label: t.admin.allMethods }, ...METHODS.map((x) => ({ value: x, label: methodLabel[x] }))]} />
            <FormSelect name="sort" autoSubmit size="sm" aria-label={t.catalog.sortBy} defaultValue={sort || "date-desc"} className="w-44 max-md:flex-1"
              items={[
                { value: "date-desc", label: t.admin.sortNewest }, { value: "date-asc", label: t.admin.sortOldest },
                { value: "total-desc", label: t.admin.sortTotalDesc }, { value: "total-asc", label: t.admin.sortTotalAsc },
                { value: "wilaya-asc", label: t.admin.sortWilaya },
              ]} />
          </form>
          {/* a button, not auto-submit: typing a year in a date field fires change at every digit */}
          <form action="/admin/orders" className="flex flex-wrap items-center gap-2 text-sm max-md:w-full">
            {keep("status", "method", "q", "sort")}
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

      <ul className="flex flex-col gap-3">
        {orders.map((o) => {
          const final = FINAL_STATUSES.includes(o.status)
          const qty = o.items.reduce((n, i) => n + i.quantity, 0)
          const { next, more } = final ? { next: undefined, more: [] } : stepsOf(o.status, o.method)
          // a submit button posts its own name/value: status=<target>
          const step = (st: Step, cls: string) => FINAL_STATUSES.includes(st.to) ? (
            <ConfirmButton key={st.to} name="status" value={st.to} message={t.admin.confirmFinal} className={cls}>{st.label}</ConfirmButton>
          ) : (
            <button key={st.to} type="submit" name="status" value={st.to} className={cls}>{st.label}</button>
          )
          const statusForm = (withMenu: boolean) => (
            <form action={updateOrderStatus.bind(null, o.id, href({ page }))} className="flex shrink-0 items-center gap-2">
              {next && step(next, buttonVariants({ size: "sm" }))}
              {withMenu && (
                <MoreMenu label={t.admin.moreActions}>
                  {more.map((st) => step(st, cn("h-10 rounded-xl px-3 text-start text-sm hover:bg-cloud", st.to === "CANCELLED" && "text-sale")))}
                </MoreMenu>
              )}
            </form>
          )
          return (
            <OrderCard key={o.id} label={`#${o.id.slice(-8).toUpperCase()} · ${o.fullName}`}
              className={cn("rounded-2xl border border-hairline-soft px-4 py-3 hover:border-hairline", o.status === "CANCELLED" && "bg-cloud/50")}
              // phones, collapsed: status · date · total, then the name; the next step stays one tap away
              top={<>
                <StatusChip s={o.status} label={statusLabel(o.status, o.method)} />
                <span className="min-w-0 truncate text-mute">{formatDate(o.createdAt, locale)}</span>
                <span className="ms-auto shrink-0 tabular-nums text-mute">{formatPrice(o.totalAmount, locale)}</span>
              </>}
              bottom={<>
                <span className="min-w-0 truncate font-medium">{o.fullName || "—"}</span>
              </>}
              action={next && statusForm(false)}>

              {/* status first: the list scans by it (phones: already in the summary row) */}
              <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="flex items-center gap-3 max-md:hidden">
                  <StatusChip s={o.status} label={statusLabel(o.status, o.method)} /><Progress s={o.status} />
                </span>
                <span className="font-mono text-xs" dir="ltr">#{o.id.slice(-8).toUpperCase()}</span>
                <span className="text-mute max-md:hidden">{formatDate(o.createdAt, locale)}</span>
              </div>

              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 md:gap-x-6 md:gap-y-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_12rem]">
                {/* customer: call / WhatsApp right here, then the call's outcome as a note */}
                <div className="flex min-w-0 flex-col gap-1">
                  {/* phones: name and the call / WhatsApp pills on one row */}
                  <div className="flex flex-wrap items-center justify-between gap-2 md:flex-col md:items-start md:justify-start md:gap-1.5">
                  {/* phones: name, date and total are already in the summary row above */}
                  <p className="min-w-0 truncate font-medium max-md:hidden">{o.fullName || "—"}</p>
                  {o.phone && (
                    <div className="flex items-center gap-2">
                      <a href={`tel:${o.phone}`} className={pill} aria-label={`${t.admin.call} ${o.phone}`}>
                        <Phone className="size-3.5" /><span dir="ltr" className="tabular-nums">{o.phone}</span>
                      </a>
                      {/* phone is stored as 0XXXXXXXXX → wa.me wants 213XXXXXXXXX */}
                      <a href={`https://wa.me/213${o.phone.slice(1)}`} target="_blank" rel="noopener noreferrer" title="WhatsApp" aria-label="WhatsApp"
                        className={cn(pill, "px-2")}>
                        <WhatsAppIcon className="size-4 text-[#25D366]" />
                      </a>
                    </div>
                  )}
                  </div>
                  {/* reads as text; a dashed line on hover shows it's editable. Saves on Enter or when leaving the field changed */}
                  <form action={updateOrderNote.bind(null, o.id, href({ page }))}>
                    <NoteInput name="note" defaultValue={o.note} maxLength={500} placeholder={t.admin.notePlaceholder} aria-label={t.admin.note}
                      className="h-7 w-full border-b border-dashed border-transparent bg-transparent text-sm outline-none placeholder:text-mute hover:border-hairline focus:border-solid focus:border-ink" />
                  </form>
                </div>

                {/* delivery: the method as the column's header, then where it goes and the courier parcel (or the button) */}
                <div className="flex min-w-0 flex-col gap-1 text-sm">
                  <p className={caption}>{t.admin.orderDetails}</p>
                  <p className="flex items-center gap-2 font-medium">
                    <MethodMark m={o.method} small />{methodLabel[o.method]}
                  </p>
                  {o.method !== "PICKUP" && (
                    <>
                      <p className="font-medium">{place(o.wilaya, o.commune) || "—"}</p>
                      <p className="text-mute max-md:line-clamp-1">{o.address}</p>
                      {o.tracking ? (
                        <>
                          {/* courier + parcel number, then its last status at the courier (dzship /v1/track, refreshed by hand;
                              "unknown" shows the courier's wording): one line that wraps */}
                          <div className="flex flex-wrap items-center gap-x-2">
                            <span className="text-mute">{courierOf(o.courier)?.[1] ?? o.courier}</span>
                            <span className="font-mono text-xs" dir="ltr">{o.tracking}</span>
                            {o.labelUrl && <a href={o.labelUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{t.admin.label}</a>}
                            {o.courierStatus && (
                              <span className="font-medium">
                                {o.courierStatus === "unknown" && o.courierRaw ? o.courierRaw : (t.courierStatus[o.courierStatus] ?? o.courierStatus)}
                              </span>
                            )}
                            {o.courierCheckedAt && <span className="text-xs text-mute">{fill(t.admin.checkedOn, { date: formatDate(o.courierCheckedAt, locale) })}</span>}
                            {courier && !final && o.courier === settings.courier && (
                              <form action={trackOrder.bind(null, o.id, href({ page }))}>
                                <button type="submit" aria-label={t.admin.refreshTracking} title={t.admin.refreshTracking}
                                  className={cn("inline-flex h-6 items-center gap-1.5 rounded-full text-sm text-mute hover:bg-cloud hover:text-ink", o.courierStatus ? "px-2" : "-ms-2 px-2")}>
                                  <RefreshCw className="size-3.5" />{!o.courierStatus && t.admin.refreshTracking}
                                </button>
                              </form>
                            )}
                          </div>
                        </>
                      ) : courier && !final && (
                        <form action={sendToCourier.bind(null, o.id, href({ page }))}>
                          <ConfirmButton message={fill(t.admin.confirmCourier, { courier })}
                            // long courier names ("Sandbox (test courier)"): wrap instead of pushing the page wider
                            className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "h-auto min-h-9 max-w-full py-1.5 text-start whitespace-normal")}>
                            {fill(t.admin.sendCourier, { courier })}
                          </ConfirmButton>
                        </form>
                      )}
                    </>
                  )}
                </div>

                <ul aria-label={t.admin.items} className="flex min-w-0 flex-col gap-1 text-sm">
                  <li aria-hidden className={caption}>{t.admin.items}</li>
                  {o.items.map((i) => (
                    <li key={i.id} className="flex gap-2">
                      <span className="shrink-0 tabular-nums text-mute">{i.quantity} ×</span>
                      <span className="min-w-0">
                        {i.variant.product.name} <span className="text-mute">· {i.variant.color} · {i.variant.size}</span>
                      </span>
                    </li>
                  ))}
                  {o.items.length > 1 && <li className="text-mute max-md:hidden">{fill(t.admin.itemsCount, { n: qty })}</li>}
                </ul>

                {/* total (with the delivery fee in it) + status: final ones are a badge, open ones the next-step button + ⋯ */}
                <div className="flex items-center justify-between gap-4 max-md:border-t max-md:border-hairline-soft max-md:pt-2.5 md:flex-col md:items-end md:justify-start md:gap-2">
                  <div className="md:text-end">
                    <p className="text-lg font-medium tabular-nums max-md:hidden">{formatPrice(o.totalAmount, locale)}</p>
                    {o.shippingFee > 0 && <p className="text-xs text-mute">{t.admin.delivery} {formatPrice(o.shippingFee, locale)}</p>}
                  </div>
                  {/* final orders: nothing to do, the chip on top says where they ended */}
                  {!final && statusForm(true)}
                </div>
              </div>
            </OrderCard>
          )
        })}
      </ul>
      {!orders.length && <p className="text-mute">{t.admin.none}</p>}
      <Pager t={t} page={page} pages={pages} href={(n) => href({ page: n })} />
    </div>
  )
}
