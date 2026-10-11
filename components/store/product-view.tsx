"use client"
import Image from "next/image"
import Link from "next/link"
import { useState } from "react"
import { Check } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { useT } from "@/components/i18n-provider"
import { WhatsAppIcon } from "@/components/whatsapp-icon"
import { useCart } from "@/lib/cart"
import { fill, formatPrice } from "@/lib/dict"
import { cn, swatch } from "@/lib/utils"

type Variant = { id: string; color: string; size: string; price: number; stockCount: number }

export function ProductView(props: {
  product: { slug: string; name: string; category: string }
  colors: string[]
  sizes: string[]
  variants: Variant[]
  images: { url: string; color: string | null }[]
  whatsapp?: string // digits only, e.g. 213555123456
  lowStock: number // "Plus que n en stock" at or below this
  children: React.ReactNode
}) {
  const { product, colors, sizes, variants, images } = props
  const { t, locale } = useT()
  const add = useCart((s) => s.add)
  // Start on the first color that still has stock.
  const [color, setColor] = useState(() => (variants.find((v) => v.stockCount > 0) ?? variants[0])?.color ?? "")
  const [size, setSize] = useState<string>()
  const [shown, setShown] = useState(0)
  const [added, setAdded] = useState(false)

  // Gallery follows the color: its own images plus color-less ones; all images if the color has none.
  const forColor = images.filter((i) => i.color === color || i.color === null)
  const gallery = forColor.length ? forColor : images
  const main = gallery[Math.min(shown, gallery.length - 1)]

  const byKey = (c: string, s: string) => variants.find((v) => v.color === c && v.size === s)
  const selected = size ? byKey(color, size) : undefined
  const price = selected?.price ?? Math.min(...variants.filter((v) => v.color === color).map((v) => v.price))
  const canAdd = !!selected && selected.stockCount > 0

  function onAdd() {
    if (!selected) return
    add({
      variantId: selected.id, slug: product.slug, name: product.name, color, size: selected.size,
      price: selected.price, image: gallery[0]?.url, stock: selected.stockCount,
    })
    setAdded(true)
    setTimeout(() => setAdded(false), 5000)
  }

  if (!variants.length) return null

  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_400px] md:gap-12">
      {/* gallery: thumbnail rail + square main image */}
      <div className="flex min-w-0 flex-col-reverse gap-2 sm:flex-row sm:items-start">
        <div className="flex shrink-0 gap-2 sm:flex-col">
          {gallery.map((img, i) => (
            <button
              key={img.url}
              type="button"
              aria-label={`${i + 1}`}
              onMouseEnter={() => setShown(i)}
              onClick={() => setShown(i)}
              className={cn("relative size-16 overflow-hidden bg-cloud", i === shown && "ring-2 ring-ink")}
            >
              <Image src={img.url} alt="" fill sizes="64px" className="object-cover" />
            </button>
          ))}
        </div>
        <div className="relative aspect-square w-full min-w-0 bg-cloud">
          {main && (
            <Image src={main.url} alt={`${product.name} — ${color}`} fill priority sizes="(max-width: 768px) 100vw, 60vw" className="object-cover" />
          )}
        </div>
      </div>

      <div className="flex flex-col">
        <h1 className="text-2xl font-medium md:text-[32px] md:leading-tight">{product.name}</h1>
        <p className="font-medium text-mute">{product.category}</p>
        <p className="mt-4 text-xl font-medium">{formatPrice(price, locale)}</p>

        <fieldset className="mt-8">
          <legend className="mb-3 font-medium">
            {t.product.selectColor} : <span className="text-mute">{color}</span>
          </legend>
          <div className="flex flex-wrap gap-3 p-1">
            {colors.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                aria-pressed={c === color}
                onClick={() => { setColor(c); setShown(0) }}
                className={cn("size-10 rounded-full ring-offset-2", c === color ? "ring-2 ring-ink" : "ring-1 ring-hairline")}
                style={{ background: swatch(c) }}
              >
                <span className="sr-only">{c}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-8">
          <legend className="mb-3 font-medium">{t.product.selectSize}</legend>
          <div className="grid grid-cols-4 gap-2">
            {sizes.map((s) => {
              const v = byKey(color, s)
              return (
                <button
                  key={s}
                  type="button"
                  disabled={!v}
                  aria-pressed={s === size}
                  onClick={() => setSize(s)}
                  className={cn(
                    "h-12 rounded-lg border text-base font-medium disabled:opacity-30",
                    s === size ? "border-ink ring-1 ring-ink" : "border-hairline hover:border-ink",
                    v?.stockCount === 0 && "bg-cloud text-stone line-through",
                  )}
                >
                  {s}
                </button>
              )
            })}
          </div>
          {selected && (
            <p className={cn("mt-3 text-sm font-medium", selected.stockCount === 0 ? "text-sale" : "text-success")}>
              {selected.stockCount === 0
                ? t.product.soldOut
                : selected.stockCount <= props.lowStock
                  ? fill(t.product.lowStock, { n: selected.stockCount })
                  : t.product.inStock}
            </p>
          )}
        </fieldset>

        {/* PRD: disabled when the selected variant has stockCount === 0 */}
        <Button className="mt-8 w-full" disabled={!canAdd} onClick={onAdd}>
          {selected?.stockCount === 0 ? t.product.soldOut : size ? t.product.addToCart : t.product.chooseSize}
        </Button>
        {props.whatsapp && (
          <a
            href={`https://wa.me/${props.whatsapp}?text=${encodeURIComponent(
              fill(t.product.askMsg, { item: `${product.name} — ${color}${size ? ` / ${size}` : ""}` }),
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "secondary", className: "mt-2 w-full" })}
          >
            <WhatsAppIcon className="size-5 text-[#25D366]" /> {t.product.ask}
          </a>
        )}

        {/* add-to-cart toast: fixed, so nothing on the page jumps */}
        <div role="status" className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex justify-end sm:inset-x-6">
          {added && (
            <div className="pointer-events-auto flex w-full max-w-sm flex-col gap-4 bg-canvas p-5 shadow-[0_0_0_1px_var(--color-hairline)] animate-in fade-in slide-in-from-bottom-4">
              <p className="flex items-center gap-2 font-medium text-success">
                <Check className="size-5" /> {t.product.added}
              </p>
              <p className="text-sm text-charcoal">{product.name} — {color} / {size}</p>
              <div className="grid grid-cols-2 gap-2">
                <Link href="/cart" className={buttonVariants({ variant: "secondary", size: "sm" })}>{t.product.viewCart}</Link>
                <Link href="/cart#checkout" className={buttonVariants({ size: "sm" })}>{t.product.order}</Link>
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 border-t border-hairline">{props.children}</div>
      </div>
    </div>
  )
}
