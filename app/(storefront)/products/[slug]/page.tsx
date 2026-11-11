import { ChevronDown } from "lucide-react"
import { notFound } from "next/navigation"
import { ProductView } from "@/components/store/product-view"
import { db } from "@/lib/db"
import { getI18n, getSettings } from "@/lib/i18n"
import { ogImage } from "@/lib/site"
import { formatPrice } from "@/lib/dict"
import { sortSizes, unique } from "@/lib/utils"

const getProduct = (slug: string) =>
  db.product.findUnique({
    where: { slug },
    include: { category: true, variants: true, images: { include: { variant: { select: { color: true } } } } },
  })

export async function generateMetadata({ params }: PageProps<"/products/[slug]">) {
  const [p, { t, locale }] = await Promise.all([getProduct(decodeURIComponent((await params).slug)), getI18n()])
  if (!p?.variants.length) return {}
  // Open Graph: the link card on WhatsApp / Facebook / Instagram shows the first photo, the name and the lowest price
  const price = Math.min(...p.variants.map((v) => v.price))
  const description = `${formatPrice(price, locale)} · ${p.description.slice(0, 140)}`
  const image = p.images[0]?.url
  return {
    title: p.name,
    description,
    openGraph: {
      type: "website", title: p.name, description, siteName: t.store.name, url: `/products/${p.slug}`,
      images: image ? [{ url: ogImage(image), alt: p.name }] : [],
    },
    twitter: { card: image ? "summary_large_image" : "summary" },
    other: { "product:price:amount": String(price), "product:price:currency": "DZD" },
  }
}

export default async function ProductPage({ params }: PageProps<"/products/[slug]">) {
  const [p, { t }, s] = await Promise.all([getProduct(decodeURIComponent((await params).slug)), getI18n(), getSettings()])
  if (!p?.variants.length) notFound() // a product with no variant left has nothing to sell

  const row = (label: string, body: string, open = false) => (
    <details className="group border-b border-hairline py-6" open={open}>
      <summary className="flex cursor-pointer list-none items-center justify-between font-medium">
        {label}
        <ChevronDown className="size-5 transition-transform group-open:rotate-180" />
      </summary>
      <p dir="auto" className="mt-4 whitespace-pre-line text-start text-charcoal">{body}</p>
    </details>
  )

  return (
    <div className="py-6">
      <ProductView
        product={{ slug: p.slug, name: p.name, category: p.category.name }}
        colors={unique(p.variants.map((v) => v.color))}
        sizes={sortSizes(unique(p.variants.map((v) => v.size)))}
        variants={p.variants.map(({ id, color, size, price, stockCount }) => ({ id, color, size, price, stockCount }))}
        images={p.images.map((i) => ({ url: i.url, color: i.variant?.color ?? null }))}
        whatsapp={s.whatsapp || undefined}
        lowStock={s.lowStock}
      >
        {row(t.product.details, p.description, true)}
        {row(t.product.shipping, t.product.shippingText)}
      </ProductView>
    </div>
  )
}
