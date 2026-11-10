"use client"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import { Minus, Plus, Trash2 } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { useT } from "@/components/i18n-provider"
import { FormSelect } from "@/components/form-select"
import { Input } from "@/components/ui/input"
import { checkout, type Shipping } from "@/lib/actions/checkout"
import { useCart, useCartReady } from "@/lib/cart"
import { formatPrice } from "@/lib/dict"
import { cn } from "@/lib/utils"
import { communesOf, WILAYAS, wilayaValue } from "@/lib/wilayas"

type Method = NonNullable<Shipping["method"]>
export type Desk = { id: string; wilaya: string; name: string; address: string }

// Guest checkout: delivery details are remembered in this browser only (no accounts).
function savedShipping(): Partial<Shipping> {
  try {
    return JSON.parse(localStorage.getItem("atelier:shipping") ?? "{}")
  } catch {
    return {}
  }
}

// fees: per wilaya [home, relay point] from Réglages › Livraison (checkout refuses the order if the fee changed since).
// pickup: "Retrait en boutique" offered (Réglages › Livraison); storeAddress (Boutique tab) is shown with it when set.
// desks: relay points (Réglages › Transporteur); none = stop-desk not offered.
export function CartView({ fees, pickup, storeAddress, desks }: { fees: Record<string, [number, number]>; pickup: boolean; storeAddress: string; desks: Desk[] }) {
  const { t, locale } = useT()
  const { items, setQty, remove, reprice, clear } = useCart()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string>()
  const [wilaya, setWilaya] = useState<string>() // set once the customer picks one; before that, the saved one
  const [method, setMethod] = useState<Method>() // same: the saved one until a pick
  const [desk, setDesk] = useState<string>()
  const mounted = useCartReady()

  // "Commander" in the add-to-cart toast links to /cart#checkout; the form only exists after hydration.
  useEffect(() => {
    if (mounted && location.hash === "#checkout") document.getElementById("checkout")?.scrollIntoView()
  }, [mounted])

  if (!mounted) return <div className="min-h-[50vh]" />
  const shipping = savedShipping()
  const methods: Method[] = ["HOME", ...(pickup ? (["PICKUP"] as const) : []), ...(desks.length ? (["STOPDESK"] as const) : [])]
  const wanted = method ?? shipping.method ?? "HOME"
  const m: Method = methods.includes(wanted) ? wanted : "HOME" // a saved method the shop no longer offers falls back
  const w = wilaya ?? shipping.wilaya ?? ""
  const communes = communesOf(w)
  const deskWilayas = new Set(desks.map((d) => d.wilaya))
  const wDesks = desks.filter((d) => d.wilaya === w)
  const sel = wDesks.find((d) => d.id === (desk ?? shipping.stopDeskId))
  const deskFee = (d: Desk) => fees[d.wilaya]?.[1] ?? 0
  const shipFee = m === "PICKUP" ? 0 : m === "STOPDESK" ? (sel ? deskFee(sel) : 0) : (fees[w]?.[0] ?? 0)
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0)
  const total = subtotal + shipFee
  const label = { HOME: t.cart.home, PICKUP: t.cart.pickup, STOPDESK: t.cart.stopdesk }
  const wilayaItems = (only?: Set<string>) => WILAYAS
    .filter((x) => !only || only.has(wilayaValue(x)))
    .map((x) => ({ value: wilayaValue(x), label: `${x[0]} - ${locale === "ar" ? x[2] : x[1]}` }))

  function onCheckout(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = { ...Object.fromEntries(new FormData(e.currentTarget)), method: m } as Shipping
    setError(undefined)
    start(async () => {
      const res = await checkout(items.map(({ variantId, qty, price }) => ({ variantId, qty, price })), shipFee, f)
      if ("error" in res) {
        // prices or fee changed: show the new total (refresh re-reads the fee) before the customer retries
        if (res.prices) { reprice(res.prices); router.refresh() }
        return setError(res.error)
      }
      const ref = res.orderId.slice(-8).toUpperCase()
      try {
        // merged: a pickup order posts no address, the saved one must survive for the next home delivery
        localStorage.setItem("atelier:shipping", JSON.stringify({ ...savedShipping(), ...f }))
        // read once by /merci to show the summary (that page never queries the DB)
        sessionStorage.setItem("atelier:last-order", JSON.stringify({
          ref, total, fee: shipFee, method: m,
          pickup: m === "PICKUP" ? storeAddress : undefined,
          desk: m === "STOPDESK" && sel ? `${sel.name} — ${sel.address}` : undefined,
          items: items.map(({ name, color, size, qty, price, image }) => ({ name, color, size, qty, price, image })),
        }))
      } catch {}
      clear()
      router.push(`/merci?ref=${ref}`)
    })
  }

  if (!items.length)
    return (
      <div className="flex flex-col items-start gap-6 py-16">
        <h1 className="text-2xl font-medium md:text-[32px]">{t.cart.title}</h1>
        <p>{t.cart.empty}</p>
        <Link href="/products" className={buttonVariants()}>{t.cart.continue}</Link>
      </div>
    )

  return (
    // lg: items 2/5, total + delivery form 3/5 (the form pairs its fields there); md: form 360px
    <div className="grid gap-10 pt-8 pb-28 md:grid-cols-[minmax(0,1fr)_360px] md:pb-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <section>
        <h1 className="mb-6 text-2xl font-medium md:text-[32px]">{t.cart.title}</h1>
        <ul>
          {items.map((i) => (
            <li key={i.variantId} className="flex gap-4 border-b border-hairline py-6">
              <Link href={`/products/${i.slug}`} className="relative size-28 shrink-0 bg-cloud sm:size-36">
                {i.image && <Image src={i.image} alt={i.name} fill sizes="144px" className="object-cover" />}
              </Link>
              <div className="flex flex-1 flex-col gap-1">
                <div className="flex justify-between gap-4">
                  <Link href={`/products/${i.slug}`} className="font-medium">{i.name}</Link>
                  <p className="font-medium">{formatPrice(i.price * i.qty, locale)}</p>
                </div>
                <p className="text-mute">{i.color} · {i.size}</p>
                <div className="mt-auto flex items-center gap-2">
                  <div className="flex items-center rounded-full border border-hairline" aria-label={t.cart.qty}>
                    <Button variant="ghost" size="icon" aria-label="-" onClick={() => setQty(i.variantId, i.qty - 1)} disabled={i.qty <= 1}>
                      <Minus />
                    </Button>
                    <span className="w-8 text-center font-medium tabular-nums">{i.qty}</span>
                    <Button variant="ghost" size="icon" aria-label="+" onClick={() => setQty(i.variantId, i.qty + 1)} disabled={i.qty >= i.stock}>
                      <Plus />
                    </Button>
                  </div>
                  <Button variant="ghost" size="icon" aria-label={t.cart.remove} onClick={() => remove(i.variantId)}>
                    <Trash2 />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <aside className="flex h-fit flex-col gap-4 md:sticky md:top-32">
        <h2 className="text-2xl font-medium">{t.confirm.summary}</h2>
        <dl className="flex flex-col gap-2">
          <div className="flex justify-between"><dt>{t.cart.subtotal}</dt><dd>{formatPrice(subtotal, locale)}</dd></div>
          <div className="flex justify-between">
            <dt>{m === "PICKUP" ? t.cart.pickup : m === "STOPDESK" ? t.cart.desk : t.cart.shipping}</dt>
            <dd>{m === "STOPDESK" && !sel ? "—" : shipFee ? formatPrice(shipFee, locale) : t.cart.free}</dd>
          </div>
          <div className="flex items-baseline justify-between bg-cloud p-4 font-medium">
            <dt>{t.cart.total}</dt><dd className="text-lg">{formatPrice(total, locale)}</dd>
          </div>
        </dl>
        <form id="checkout" onSubmit={onCheckout} className="grid scroll-mt-32 gap-4 lg:grid-cols-2">
            <h2 className="text-xl font-medium lg:col-span-2">{methods.length > 1 ? t.cart.method : t.cart.delivery}</h2>
            {methods.length > 1 && (
              // radio tiles, like the PDP size grid; the pick is remembered with the rest of the form
              <fieldset className={cn("grid gap-2 lg:col-span-2", methods.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
                <legend className="sr-only">{t.cart.method}</legend>
                {methods.map((v) => (
                  <label key={v} className={cn("flex min-h-12 cursor-pointer items-center justify-center rounded-lg border px-3 py-2 text-center text-sm font-medium leading-tight",
                    m === v ? "border-2 border-ink" : "border-hairline hover:border-ink")}>
                    <input type="radio" name="method" value={v} checked={m === v} onChange={() => setMethod(v)} className="sr-only" />
                    {label[v]}
                  </label>
                ))}
              </fieldset>
            )}
            <label className="flex flex-col gap-2 text-sm font-medium">
              {t.cart.fullName}
              <Input name="fullName" required maxLength={100} autoComplete="name" defaultValue={shipping.fullName} />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium">
              {t.cart.phone}
              <Input name="phone" type="tel" required dir="ltr" autoComplete="tel" inputMode="tel" placeholder="0555 12 34 56"
                pattern="(\+213|00213|0)[\s.\-]*[567]([\s.\-]*\d){8}" title={t.cart.badPhone} defaultValue={shipping.phone} />
            </label>
            {m === "PICKUP" && storeAddress && (
              <p className="whitespace-pre-line text-sm lg:col-span-2"><span className="font-medium">{t.cart.pickupAt}</span> {storeAddress}</p>
            )}
            {m === "STOPDESK" && (
              <>
                <label className="flex flex-col gap-2 text-sm font-medium">
                  {t.cart.wilaya}
                  {/* only wilayas with a stop-desk; the saved wilaya may have none → start empty */}
                  <FormSelect key="desk-wilaya" name="wilaya" required placeholder={t.cart.chooseWilaya} onChange={setWilaya}
                    defaultValue={deskWilayas.has(w) ? w : undefined} items={wilayaItems(deskWilayas)} />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium">
                  {t.cart.desk}
                  <FormSelect key={w} name="stopDeskId" required disabled={!wDesks.length} placeholder={t.cart.chooseDesk} onChange={setDesk}
                    defaultValue={sel?.id}
                    items={wDesks.map((d) => ({ value: d.id, label: d.name, option: `${d.name} — ${d.address}` }))} />
                </label>
              </>
            )}
            {m === "HOME" && (
              <>
                <label className="flex flex-col gap-2 text-sm font-medium">
                  {t.cart.wilaya}
                  <FormSelect key="home-wilaya" name="wilaya" required defaultValue={shipping.wilaya} placeholder={t.cart.chooseWilaya} onChange={setWilaya}
                    items={wilayaItems()} />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium">
                  {t.cart.commune}
                  {/* key: a new wilaya remounts it empty (the saved commune belongs to the saved wilaya only).
                      ponytail: all 1541 communes ship with the cart (~52 KB raw); dynamic import() if that ever matters */}
                  <FormSelect key={w} name="commune" required disabled={!communes.length} placeholder={t.cart.chooseCommune}
                    defaultValue={w === shipping.wilaya ? shipping.commune : undefined}
                    items={communes.map(([fr, ar]) => ({ value: fr, label: locale === "ar" ? ar : fr }))} />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium lg:col-span-2">
                  {t.cart.address}
                  <textarea name="address" required maxLength={300} rows={3} autoComplete="street-address" defaultValue={shipping.address}
                    className="w-full rounded-lg border border-hairline p-4 text-base font-normal outline-none focus:border-2 focus:border-ink" />
                </label>
              </>
            )}
            <Button type="submit" disabled={pending} className="hidden w-full md:inline-flex lg:col-span-2">{pending ? t.cart.sending : t.cart.checkout}</Button>
          </form>
        {error && <p role="alert" className="hidden text-sm font-medium text-sale md:block">{error}</p>}
        <p className="text-xs text-mute">{m === "PICKUP" ? t.cart.pickupNote : t.cart.mockNote}</p>
      </aside>

      {/* mobile: order button always reachable; submits the form above (native validation still runs).
          Server errors show here too: the form's own error line may be scrolled out of view. */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex flex-wrap items-center gap-x-4 gap-y-2 bg-canvas px-4 py-3 shadow-[inset_0_1px_0_var(--color-hairline-soft)] md:hidden">
        {error && <p role="alert" className="w-full text-sm font-medium text-sale">{error}</p>}
        <div className="flex-1">
          <p className="text-xs text-mute">{t.cart.total}</p>
          <p className="font-medium">{formatPrice(total, locale)}</p>
        </div>
        <Button type="submit" form="checkout" disabled={pending}>{pending ? t.cart.sending : t.cart.checkout}</Button>
      </div>
    </div>
  )
}
