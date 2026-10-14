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
import { WILAYAS, wilayaValue } from "@/lib/wilayas"

// Guest checkout: delivery details are remembered in this browser only (no accounts).
function savedShipping(): Partial<Shipping> {
  try {
    return JSON.parse(localStorage.getItem("atelier:shipping") ?? "{}")
  } catch {
    return {}
  }
}

// fee: flat delivery fee from Réglages (checkout refuses the order if it changed since)
export function CartView({ fee }: { fee: number }) {
  const { t, locale } = useT()
  const { items, setQty, remove, reprice, clear } = useCart()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string>()
  const mounted = useCartReady()

  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0)
  const total = subtotal + fee

  function onCheckout(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Shipping
    setError(undefined)
    start(async () => {
      const res = await checkout(items.map(({ variantId, qty, price }) => ({ variantId, qty, price })), fee, f)
      if ("error" in res) {
        // prices or fee changed: show the new total (refresh re-reads the fee) before the customer retries
        if (res.prices) { reprice(res.prices); router.refresh() }
        return setError(res.error)
      }
      const ref = res.orderId.slice(-8).toUpperCase()
      try {
        localStorage.setItem("atelier:shipping", JSON.stringify(f))
        // read once by /merci to show the summary (that page never queries the DB)
        sessionStorage.setItem("atelier:last-order", JSON.stringify({ ref, total, fee, items: items.map(({ name, color, size, qty, price, image }) => ({ name, color, size, qty, price, image })) }))
      } catch {}
      clear()
      router.push(`/merci?ref=${ref}`)
    })
  }

  // "Commander" in the add-to-cart toast links to /cart#checkout; the form only exists after hydration.
  useEffect(() => {
    if (mounted && location.hash === "#checkout") document.getElementById("checkout")?.scrollIntoView()
  }, [mounted])

  if (!mounted) return <div className="min-h-[50vh]" />
  const shipping = savedShipping()

  if (!items.length)
    return (
      <div className="flex flex-col items-start gap-6 py-16">
        <h1 className="text-2xl font-medium md:text-[32px]">{t.cart.title}</h1>
        <p>{t.cart.empty}</p>
        <Link href="/products" className={buttonVariants()}>{t.cart.continue}</Link>
      </div>
    )

  return (
    <div className="grid gap-10 pt-8 pb-28 md:grid-cols-[minmax(0,1fr)_360px] md:pb-8">
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
        <h2 className="text-2xl font-medium">{t.cart.total}</h2>
        <dl className="flex flex-col gap-2">
          <div className="flex justify-between"><dt>{t.cart.subtotal}</dt><dd>{formatPrice(subtotal, locale)}</dd></div>
          <div className="flex justify-between"><dt>{t.cart.shipping}</dt><dd>{fee ? formatPrice(fee, locale) : t.cart.free}</dd></div>
          <div className="flex justify-between border-y border-hairline py-4 font-medium">
            <dt>{t.cart.total}</dt><dd>{formatPrice(total, locale)}</dd>
          </div>
        </dl>
        <form id="checkout" onSubmit={onCheckout} className="flex scroll-mt-32 flex-col gap-4">
            <h2 className="text-xl font-medium">{t.cart.delivery}</h2>
            <label className="flex flex-col gap-2 text-sm font-medium">
              {t.cart.fullName}
              <Input name="fullName" required maxLength={100} autoComplete="name" defaultValue={shipping.fullName} />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium">
              {t.cart.phone}
              <Input name="phone" type="tel" required dir="ltr" autoComplete="tel" inputMode="tel" placeholder="0555 12 34 56"
                pattern="(\+213|00213|0)[\s.\-]*[567]([\s.\-]*\d){8}" title={t.cart.badPhone} defaultValue={shipping.phone} />
              <span className="text-xs font-normal text-mute">{t.cart.phoneHint}</span>
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium">
              {t.cart.wilaya}
              <FormSelect name="wilaya" required defaultValue={shipping.wilaya} placeholder={t.cart.chooseWilaya}
                items={WILAYAS.map((w) => ({ value: wilayaValue(w), label: `${w[0]} - ${locale === "ar" ? w[2] : w[1]}` }))} />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium">
              {t.cart.address}
              <textarea name="address" required maxLength={300} rows={3} autoComplete="street-address" defaultValue={shipping.address}
                className="w-full rounded-lg border border-hairline p-4 text-base font-normal outline-none focus:border-2 focus:border-ink" />
            </label>
            <Button type="submit" disabled={pending} className="hidden w-full md:inline-flex">{pending ? t.cart.sending : t.cart.checkout}</Button>
          </form>
        {error && <p role="alert" className="hidden text-sm font-medium text-sale md:block">{error}</p>}
        <p className="text-xs text-mute">{t.cart.mockNote}</p>
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
