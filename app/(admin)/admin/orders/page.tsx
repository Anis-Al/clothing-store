import Link from "next/link"
import { headers } from "next/headers"
import { DeliveryMethod, OrderStatus, type Prisma } from "@prisma/client"
import { Check, ChevronDown, CircleCheck, Clock, MapPin, Package, Phone, RefreshCw, Search, StickyNote, Store, Truck, Undo2, X } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ConfirmButton, CopyButton, MoreMenu, NoteInput, OrderRow, RowToggle } from "@/components/admin/client"
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
// the two dead ends, rare and never acted on: folded under "Plus" in the desktop tab strip
const RARE: OrderStatus[] = ["RETURNED", "CANCELLED"]
const METHODS = Object.values(DeliveryMethod)
const PER_PAGE = 6 // table rows (desktop; user's call)
const PER_PAGE_PHONE = 2 // cards (user's call)
// ?sort=<column>-<asc|desc>, none = newest first. Wilaya sorts as text ("16 - Alger"): it groups a wilaya's parcels,
// codes aren't in numeric order. Status isn't a sort: the tabs filter it.
const SORTS = { date: "createdAt", wilaya: "wilaya", total: "totalAmount" } as const
type SortKey = keyof typeof SORTS
// one colour per status: the dot in the tabs, the chip on each row, the timeline in the details panel
const TONE: Record<OrderStatus, string> = {
  PENDING: "bg-[#b45309]", CONFIRMED: "bg-info", SHIPPED: "bg-ink", DELIVERED: "bg-success", RETURNED: "bg-sale", CANCELLED: "bg-stone",
}
const Dot = ({ s }: { s: OrderStatus }) => <span aria-hidden className={cn("size-2 shrink-0 rounded-full", TONE[s])} />
// the row's status, shown once and loud: a solid chip in the status' colour with its own icon
const CHIP: Record<OrderStatus, string> = {
  PENDING: "bg-[#b45309] text-canvas", CONFIRMED: "bg-info text-canvas", SHIPPED: "bg-ink text-canvas",
  DELIVERED: "bg-success text-canvas", RETURNED: "bg-sale text-canvas", CANCELLED: "bg-hairline text-ink",
}
const STATUS_ICON = { PENDING: Clock, CONFIRMED: Check, SHIPPED: Package, DELIVERED: CircleCheck, RETURNED: Undo2, CANCELLED: X } as const
const StatusChip = ({ s, label }: { s: OrderStatus; label: string }) => {
  const Icon = STATUS_ICON[s]
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full ps-1.5 pe-2.5 text-xs font-semibold whitespace-nowrap", CHIP[s])}>
      <Icon className="size-3.5" aria-hidden />{label}
    </span>
  )
}
const FLOW = ["PENDING", "CONFIRMED", "SHIPPED", "DELIVERED"] as const
const METHOD_ICON = { HOME: Truck, PICKUP: Store, STOPDESK: MapPin } as const
const ymd = (d: Date) => d.toLocaleDateString("en-CA") // YYYY-MM-DD, server time zone (same as the dashboard)

// Commandes: a table of orders (status + ref · customer · delivery · items · total · next step), each row opening a
// details panel (address, parcel, timeline, itemised total, note); phones get the same as cards. Status tabs on top,
// then search, period, method and sort. Everything is in the URL; `href(patch)` builds every link and the `back` of
// the status / note / courier actions, `keep(...)` the hidden inputs of the GET forms.
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
  // q matches the buyer's name, phone (spaces ignored) or the 8-char ref shown on the row
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
  const h = await headers()
  const phone = h.get("sec-ch-ua-mobile") === "?1" || /Mobi/i.test(h.get("user-agent") ?? "")
  const [{ t, locale }, settings, total, counts, lastSync] = await Promise.all([
    getI18n(),
    getSettings(),
    db.order.count({ where }),
    db.order.groupBy({ by: ["status"], where: base, _count: true }), // tab counts follow search, method + dates
    db.order.aggregate({ _max: { courierCheckedAt: true } }),
  ])
  // "Envoyer à <courier>" once the courier is set up (Réglages › Livraison, debug)
  const courier = courierReady(settings) ? courierOf(settings.courier)?.[1] : undefined
  // open parcels at that courier: "Tout actualiser" asks about all of them (the cron sync does the same every few hours)
  const tracked = courier ? await db.order.count({ where: trackable(settings.courier) }) : 0
  const { page, pages, skip, take } = paginate(total, asked, phone ? PER_PAGE_PHONE : PER_PAGE)
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
  // period shortcuts: today / last 7 / last 30 days as from–to pairs; anything else typed is "Personnalisé"
  const today = new Date()
  const ago = (n: number) => { const x = new Date(today); x.setDate(x.getDate() - n); return ymd(x) }
  const presets = [["today", ago(0), t.admin.periodToday], ["d7", ago(6), t.admin.period7], ["d30", ago(29), t.admin.period30]] as const
  const preset = !from && !to ? "all" : (presets.find(([, f]) => f === from && ymd(today) === to)?.[0] ?? "custom")
  const periodLabel = preset === "all" ? "" : preset === "custom" ? `${t.admin.dateFrom} ${from || "…"} ${t.admin.dateTo} ${to || "…"}` : presets.find(([k]) => k === preset)![2]
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
  const caption = "text-xs font-medium tracking-wide text-mute uppercase"
  const seg = (on: boolean) => cn("inline-flex h-8 items-center rounded-full px-3 text-sm font-medium whitespace-nowrap", on ? "bg-canvas text-ink ring-1 ring-hairline" : "text-mute hover:text-ink")
  // desktop table: the same column template for the header row and every order row
  const cols = "lg:grid lg:grid-cols-[8.5rem_minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)_8rem_14.5rem] lg:items-center lg:gap-x-3"

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="flex flex-wrap items-baseline gap-x-3 text-[28px] font-medium">
            {t.admin.orders}
            <span className="text-sm font-normal text-mute tabular-nums">{fill(t.admin.ordersCount, { n: total })}{periodLabel && ` · ${periodLabel}`}</span>
          </h1>
          {lastSync._max.courierCheckedAt && (
            <p className="text-xs text-mute">{fill(t.admin.lastSync, { date: formatDate(lastSync._max.courierCheckedAt, locale) })}</p>
          )}
        </div>
        {tracked > 0 && (
          <form action={trackAll.bind(null, href({ page }))}>
            <button type="submit" className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "gap-2")}>
              <RefreshCw className="size-4" />{t.admin.trackAll}
              <span className="inline-flex h-5 items-center rounded-full bg-ink px-2 text-xs font-semibold text-canvas tabular-nums">{tracked}</span>
            </button>
          </form>
        )}
      </div>
      <Notice t={t} sp={searchParams} />

      {/* status tab strip (desktop: Nike sub-nav with an ink underline; phones: pills inside the Filtres fold) */}
      <nav aria-label={t.admin.status} className="flex min-w-0 flex-wrap items-center gap-2 max-md:hidden md:flex-nowrap md:gap-1 md:shadow-[inset_0_-1px_0_var(--color-hairline-soft)]">
        {[undefined, ...STATUSES].map((s) => (
          <Link key={s ?? "all"} href={href({ status: s })} aria-current={status === s || undefined}
            className={cn("inline-flex h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium whitespace-nowrap",
              s && RARE.includes(s) && "hidden", // in the "Plus" menu below
              status === s ? "border-ink" : "border-transparent text-mute hover:text-ink")}>
            {s && <Dot s={s} />}
            {s ? t.status[s] : t.admin.all}
            <span className="tabular-nums opacity-60">{count(s)}</span>
          </Link>
        ))}
        {/* Retournée / Annulée under one tab; it reads as the picked one while it's the filter */}
        <MoreMenu label={t.nav.more} triggerClassName={cn("inline-flex h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium whitespace-nowrap",
          status && RARE.includes(status) ? "border-ink" : "border-transparent text-mute hover:text-ink")}
          trigger={status && RARE.includes(status)
            ? <><Dot s={status} />{t.status[status]}<span className="tabular-nums opacity-60">{count(status)}</span><ChevronDown className="size-4" /></>
            : <>{t.nav.more}<span className="tabular-nums opacity-60">{RARE.reduce((n, s) => n + count(s), 0)}</span><ChevronDown className="size-4" /></>}>
          {RARE.map((s) => (
            <Link key={s} href={href({ status: s })} aria-current={status === s || undefined}
              className={cn("flex h-10 items-center gap-2 rounded-xl px-3 text-sm hover:bg-cloud", status === s && "font-medium")}>
              <Dot s={s} />{t.status[s]}<span className="ms-auto tabular-nums text-mute">{count(s)}</span>
            </Link>
          ))}
        </MoreMenu>
      </nav>

      {/* filter bar: search first, then the period shortcuts, the method and the sort. Phones: search + Filtres fold */}
      <div className="flex flex-wrap items-center gap-2">
        <form action="/admin/orders" role="search" className="relative min-w-0 flex-1 basis-60">
          {keep("status", "method", "sort", "from", "to")}
          <Search className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-mute" />
          <input name="q" type="search" defaultValue={q} placeholder={t.admin.searchOrders} aria-label={t.admin.search}
            className="h-10 w-full rounded-[24px] bg-cloud ps-10 pe-4 outline-none focus:bg-canvas focus:ring-2 focus:ring-ink" />
        </form>
        <FiltersPill t={t} active={(status ? 1 : 0) + (method ? 1 : 0) + (from || to ? 1 : 0)} />
        <div className="flex flex-wrap items-center gap-2 max-md:hidden max-md:basis-full peer-open:flex md:contents">
          {/* phones: the status pills live in the fold */}
          <div className="flex basis-full flex-wrap gap-2 md:hidden">
            {[undefined, ...STATUSES].map((s) => (
              <Link key={s ?? "all"} href={href({ status: s })} aria-current={status === s || undefined}
                className={cn("inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap",
                  status === s ? "border-ink bg-ink text-canvas" : "border-hairline hover:border-ink")}>
                {s && <Dot s={s} />}{s ? t.status[s] : t.admin.all}<span className="tabular-nums opacity-60">{count(s)}</span>
              </Link>
            ))}
          </div>
          {/* period: segmented shortcuts; "Personnalisé…" opens the two date fields (a button, not auto-submit:
              typing a year in a date field fires change at every digit) */}
          <div role="group" aria-label={t.admin.date} className="flex max-w-full flex-wrap items-center gap-0.5 rounded-full bg-cloud p-1">
            <Link href={href({ from: "", to: "" })} aria-current={preset === "all" || undefined} className={seg(preset === "all")}>{t.admin.periodAll}</Link>
            {presets.map(([k, f, label]) => (
              <Link key={k} href={href({ from: f, to: ymd(today) })} aria-current={preset === k || undefined} className={seg(preset === k)}>{label}</Link>
            ))}
            <details className="relative" open={preset === "custom" || undefined}>
              <summary className={cn(seg(preset === "custom"), "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>{t.admin.periodCustom}</summary>
              <form action="/admin/orders" className="z-40 flex flex-wrap items-center gap-2 rounded-2xl bg-canvas p-3 text-sm ring-1 ring-hairline max-md:mt-2 md:absolute md:start-0 md:top-full md:mt-2">
                {keep("status", "method", "q", "sort")}
                <label className="flex items-center gap-2">{t.admin.dateFrom}<Input type="date" name="from" defaultValue={from} className="h-9 w-36 px-2 text-sm" /></label>
                <label className="flex items-center gap-2">{t.admin.dateTo}<Input type="date" name="to" defaultValue={to} className="h-9 w-36 px-2 text-sm" /></label>
                <Button type="submit" size="sm">{t.admin.apply}</Button>
              </form>
            </details>
          </div>
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
        </div>
      </div>

      {/* the list: a bordered table from lg (scrolls inside itself below ~900px of content), cards before */}
      <div className="lg:overflow-hidden lg:rounded-2xl lg:border lg:border-hairline-soft">
        <div className="lg:overflow-x-auto">
          <div className="lg:min-w-[56rem]">
            <div className={cn(cols, "hidden h-11 border-b border-hairline-soft bg-cloud/60 px-3 lg:grid", caption)}>
              <span>{t.admin.order}</span><span>{t.admin.customer}</span><span>{t.admin.delivery}</span>
              <span>{t.admin.items}</span><span className="text-end">{t.admin.total}</span><span className="text-end">{t.admin.actions}</span>
            </div>
            <ul className="flex flex-col gap-2.5 lg:gap-0">
              {orders.map((o) => {
                const final = FINAL_STATUSES.includes(o.status)
                const cancelled = o.status === "CANCELLED"
                const qty = o.items.reduce((n, i) => n + i.quantity, 0)
                const sub = o.items.reduce((n, i) => n + i.quantity * i.priceAtPurchase, 0)
                const ref = `#${o.id.slice(-8).toUpperCase()}`
                const { next, more } = final ? { next: undefined, more: [] } : stepsOf(o.status, o.method)
                const Method = METHOD_ICON[o.method]
                const where = o.method === "PICKUP" ? methodLabel.PICKUP : `${methodLabel[o.method]} · ${place(o.wilaya, o.commune)}`
                const reached = cancelled ? -1 : o.status === "RETURNED" ? 3 : FLOW.indexOf(o.status as (typeof FLOW)[number])
                const courierName = courierOf(o.courier)?.[1] ?? o.courier
                const courierState = o.courierStatus && (o.courierStatus === "unknown" && o.courierRaw ? o.courierRaw : (t.courierStatus[o.courierStatus] ?? o.courierStatus))
                const mine = courier && !final && o.courier === settings.courier
                // a submit button posts its own name/value: status=<target>. The ⋯ menu's buttons are portalled out of
                // the form, so every step button names it (`form`).
                const formId = `status-${o.id}`
                const step = (st: Step, cls: string) => FINAL_STATUSES.includes(st.to) ? (
                  <ConfirmButton key={st.to} form={formId} name="status" value={st.to} message={t.admin.confirmFinal} className={cls}>{st.label}</ConfirmButton>
                ) : (
                  <button key={st.to} form={formId} type="submit" name="status" value={st.to} className={cls}>{st.label}</button>
                )
                const refresh = (withText: boolean) => mine && o.tracking && (
                  <form action={trackOrder.bind(null, o.id, href({ page }))} className="contents">
                    <button type="submit" aria-label={t.admin.refreshTracking} title={t.admin.refreshTracking}
                      className={cn("inline-flex h-7 items-center gap-1.5 rounded-full text-xs text-mute hover:bg-cloud hover:text-ink", withText ? "px-2" : "w-7 justify-center")}>
                      <RefreshCw className="size-3.5" />{withText && t.admin.refreshTracking}
                    </button>
                  </form>
                )

                return (
                  <OrderRow key={o.id}
                    className={cn("rounded-2xl border border-hairline-soft bg-canvas lg:rounded-none lg:border-0 lg:border-b lg:last:border-b-0",
                      cancelled && "bg-cloud/40 text-mute", "data-open:bg-cloud/30")}
                    panel={
                      <div className="grid grid-cols-1 gap-6 border-t border-hairline-soft px-3.5 py-4 lg:grid-cols-3 lg:px-6 lg:py-5">
                        {/* delivery: where, the parcel, and how far the order got */}
                        <div className="flex min-w-0 flex-col gap-3 text-sm">
                          <h3 className={caption}>{t.admin.delivery}</h3>
                          <div className="flex items-center gap-2 font-medium"><Method className="size-4 shrink-0" aria-hidden />{where}</div>
                          {o.address && <p className="text-mute">{o.address}</p>}
                          {o.tracking && (
                            <div className="flex flex-col gap-1">
                              <span className="text-xs text-mute">{t.admin.sCourier}</span>
                              <span>{courierName}</span>
                              <span className="mt-1 text-xs text-mute">{t.admin.tracking}</span>
                              <div className="flex flex-wrap items-center gap-1">
                                <span className="font-mono font-semibold" dir="ltr">{o.tracking}</span>
                                <CopyButton text={o.tracking} label={t.admin.copy} />
                                {o.labelUrl && <a href={o.labelUrl} target="_blank" rel="noopener noreferrer" className="text-sm underline underline-offset-4">{t.admin.label}</a>}
                                {refresh(true)}
                              </div>
                              {o.courierCheckedAt && <span className="text-xs text-mute">{courierState && `${courierState} · `}{fill(t.admin.checkedOn, { date: formatDate(o.courierCheckedAt, locale) })}</span>}
                            </div>
                          )}
                          {!o.tracking && courier && !final && o.method !== "PICKUP" && (
                            <form action={sendToCourier.bind(null, o.id, href({ page }))}>
                              <ConfirmButton message={fill(t.admin.confirmCourier, { courier })}
                                className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "h-auto min-h-9 max-w-full py-1.5 text-start whitespace-normal")}>
                                {fill(t.admin.sendCourier, { courier })}
                              </ConfirmButton>
                            </form>
                          )}
                          {/* timeline: the COD flow, the reached steps in the status' colour (a return ends red) */}
                          <ol className="mt-1 grid grid-cols-4 gap-1">
                            {FLOW.map((st, i) => {
                              const on = i <= reached
                              const tone = o.status === "RETURNED" && i === 3 ? "bg-sale" : o.status === "RETURNED" ? "bg-ink" : TONE[o.status]
                              const label = o.status === "RETURNED" && i === 3 ? statusLabel("RETURNED", o.method) : statusLabel(st, o.method)
                              return (
                                <li key={st} className="flex min-w-0 flex-col gap-1.5" aria-current={i === reached ? "step" : undefined}>
                                  <div className="flex items-center gap-1">
                                    <span aria-hidden className={cn("size-3.5 shrink-0 rounded-full", on ? tone : "bg-canvas ring-2 ring-hairline ring-inset")} />
                                    {i < 3 && <span aria-hidden className={cn("h-0.5 flex-1 rounded-full", i < reached ? tone : "bg-hairline-soft")} />}
                                  </div>
                                  <span className={cn("truncate text-xs font-medium", !on && "text-mute")}>{label}</span>
                                  {i === 0 && <span className="text-[11px] text-mute">{formatDate(o.createdAt, locale)}</span>}
                                </li>
                              )
                            })}
                          </ol>
                        </div>

                        {/* items, itemised, then the total the courier collects */}
                        <div className="flex min-w-0 flex-col gap-3 text-sm">
                          <h3 className={caption}>{t.admin.items}</h3>
                          <div className="flex flex-col rounded-xl border border-hairline-soft bg-canvas">
                            {o.items.map((i) => (
                              <div key={i.id} className="flex justify-between gap-3 border-b border-hairline-soft px-3.5 py-2.5">
                                <div className="flex min-w-0 flex-col">
                                  <span className="font-medium">{i.variant.product.name}</span>
                                  <span className="text-xs text-mute">{i.variant.color} · {i.variant.size} · <span dir="ltr">{i.variant.sku}</span></span>
                                </div>
                                <div className="flex shrink-0 flex-col items-end tabular-nums">
                                  <span className="font-medium">{formatPrice(i.quantity * i.priceAtPurchase, locale)}</span>
                                  <span className="text-xs text-mute">{i.quantity} × {formatPrice(i.priceAtPurchase, locale)}</span>
                                </div>
                              </div>
                            ))}
                            <div className="flex flex-col gap-1.5 px-3.5 py-2.5 text-xs tabular-nums">
                              <div className="flex justify-between"><span className="text-mute">{t.admin.subtotal}</span><span>{formatPrice(sub, locale)}</span></div>
                              <div className="flex justify-between"><span className="text-mute">{t.admin.delivery}</span><span>{formatPrice(o.shippingFee, locale)}</span></div>
                              <div className="mt-1 flex justify-between border-t border-hairline-soft pt-2 text-sm font-semibold"><span>{t.admin.total}</span><span>{formatPrice(o.totalAmount, locale)}</span></div>
                            </div>
                          </div>
                        </div>

                        {/* the note: what the confirmation call gave, why a parcel came back… saves on Enter or when leaving the field */}
                        <div className="flex min-w-0 flex-col gap-3 text-sm">
                          <h3 className={caption}>{t.admin.note}</h3>
                          <form action={updateOrderNote.bind(null, o.id, href({ page }))}>
                            <NoteInput name="note" defaultValue={o.note} maxLength={500} placeholder={t.admin.notePlaceholder} aria-label={t.admin.note}
                              className="h-10 w-full rounded-xl border border-hairline bg-canvas px-3 text-sm outline-none placeholder:text-mute focus:border-ink" />
                          </form>
                        </div>
                      </div>
                    }>
                    <div className={cn(cols, "flex flex-col gap-2.5 p-3.5 lg:px-3 lg:py-3")}>
                      {/* status, ref, date */}
                      <div className="flex items-center justify-between gap-2 lg:flex-col lg:items-start lg:gap-1">
                        <StatusChip s={o.status} label={statusLabel(o.status, o.method)} />
                        <span className="flex items-center gap-1.5 text-xs text-mute lg:contents">
                          <span className="font-mono text-xs font-semibold text-ink" dir="ltr">{ref}</span>
                          <span className="lg:hidden">·</span>
                          <span className="text-xs text-mute">{formatDate(o.createdAt, locale)}</span>
                        </span>
                      </div>

                      {/* customer: name, phone + WhatsApp (phones: square buttons at the end), the note in one line */}
                      <div className="flex items-center justify-between gap-2 lg:flex-col lg:items-start lg:gap-1">
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate font-semibold">{o.fullName || "—"}</span>
                          <span className="flex items-center gap-1.5 truncate text-sm lg:hidden"><Method className="size-3.5 shrink-0" aria-hidden />{where}</span>
                          {o.phone && (
                            <span className="flex items-center gap-1 max-lg:hidden">
                              <a href={`tel:${o.phone}`} dir="ltr" className="text-sm tabular-nums hover:underline" aria-label={`${t.admin.call} ${o.phone}`}>{o.phone}</a>
                              {/* phone is stored as 0XXXXXXXXX → wa.me wants 213XXXXXXXXX */}
                              <a href={`https://wa.me/213${o.phone.slice(1)}`} target="_blank" rel="noopener noreferrer" title="WhatsApp" aria-label="WhatsApp"
                                className="grid size-7 place-items-center rounded-full hover:bg-cloud"><WhatsAppIcon className="size-4 text-[#25D366]" /></a>
                            </span>
                          )}
                          {o.note && <span className="flex items-center gap-1.5 truncate text-xs text-[#b45309]"><StickyNote className="size-3.5 shrink-0" aria-hidden />{o.note}</span>}
                        </div>
                        {o.phone && (
                          <div className="flex shrink-0 gap-1.5 lg:hidden">
                            <a href={`tel:${o.phone}`} aria-label={`${t.admin.call} ${o.phone}`} className="grid size-11 place-items-center rounded-xl border border-hairline hover:border-ink"><Phone className="size-4" /></a>
                            <a href={`https://wa.me/213${o.phone.slice(1)}`} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="grid size-11 place-items-center rounded-xl border border-hairline hover:border-ink"><WhatsAppIcon className="size-4 text-[#25D366]" /></a>
                          </div>
                        )}
                      </div>

                      {/* items + total: one bordered line on phones, two cells on desktop */}
                      <div className="flex items-center justify-between gap-3 border-t border-hairline-soft pt-2.5 lg:contents">
                        <div className="flex min-w-0 flex-col">
                          <span className="font-medium max-lg:hidden">{fill(t.admin.itemsCount, { n: qty })}</span>
                          <span className="truncate text-sm text-mute">
                            {o.items.map((i) => `${i.quantity > 1 ? `${i.quantity} × ` : ""}${i.variant.product.name}${o.items.length === 1 ? ` · ${i.variant.color} · ${i.variant.size}` : ""}`).join(" · ")}
                          </span>
                        </div>
                        <div className="flex shrink-0 flex-col items-end tabular-nums">
                          <span className={cn("font-semibold", cancelled && "line-through")}>{formatPrice(o.totalAmount, locale)}</span>
                          <span className="text-xs text-mute whitespace-nowrap max-lg:hidden">{o.shippingFee ? fill(t.admin.feeIncl, { fee: formatPrice(o.shippingFee, locale) }) : t.admin.feeNone}</span>
                        </div>
                      </div>

                      {/* delivery (desktop column 3; on phones only the parcel line, the method is under the name) */}
                      <div className={cn("flex min-w-0 flex-col gap-1 text-sm lg:col-start-3 lg:row-start-1", !o.tracking && "max-lg:hidden")}>
                        <span className="flex items-center gap-2 max-lg:hidden"><Method className="size-4 shrink-0" aria-hidden /><span className="truncate font-medium">{where}</span></span>
                        {o.tracking && (
                          <span className="flex min-w-0 items-center gap-2 text-xs">
                            {courierState && <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md bg-cloud px-2 font-medium text-ink whitespace-nowrap"><Dot s="SHIPPED" />{courierState}</span>}
                            <span className="min-w-0 truncate text-mute">{courierName} · <span className="font-mono" dir="ltr">{o.tracking}</span></span>
                            {refresh(false)}
                          </span>
                        )}
                        {!o.tracking && courier && !final && o.method !== "PICKUP" && (
                          <form action={sendToCourier.bind(null, o.id, href({ page }))} className="max-lg:hidden">
                            <ConfirmButton message={fill(t.admin.confirmCourier, { courier })} className="text-xs text-mute underline-offset-4 hover:text-ink hover:underline">
                              {fill(t.admin.sendCourier, { courier })}
                            </ConfirmButton>
                          </form>
                        )}
                      </div>

                      {/* next step + ⋯ + details */}
                      <form id={formId} action={updateOrderStatus.bind(null, o.id, href({ page }))} className="flex items-center gap-2 lg:col-start-6 lg:justify-end">
                        {next ? step(next, cn(buttonVariants({ size: "sm" }), "h-10 flex-1 lg:h-9 lg:flex-none")) : <span className="flex-1 lg:hidden" />}
                        {more.length > 0 && (
                          <MoreMenu label={t.admin.moreActions} triggerClassName="border border-hairline hover:border-ink max-lg:size-10 max-lg:rounded-xl">
                            {more.map((st) => step(st, cn("h-10 rounded-xl px-3 text-start text-sm hover:bg-cloud", st.to === "CANCELLED" && "text-sale")))}
                          </MoreMenu>
                        )}
                        <RowToggle label={t.admin.showDetails} hideLabel={t.admin.hideDetails} className="max-lg:size-10 max-lg:rounded-xl max-lg:border max-lg:border-hairline" />
                      </form>
                    </div>
                  </OrderRow>
                )
              })}
            </ul>
          </div>
        </div>
        {!orders.length && <p className="p-4 text-mute">{t.admin.none}</p>}
        {total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm text-mute tabular-nums lg:border-t lg:border-hairline-soft lg:bg-cloud/40 lg:px-4">
            <span>{fill(t.admin.rangeOf, { from: skip + 1, to: skip + orders.length, n: total })}</span>
            <Pager t={t} page={page} pages={pages} href={(n) => href({ page: n })} />
          </div>
        )}
      </div>
    </div>
  )
}
