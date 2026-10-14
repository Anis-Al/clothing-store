import { ChevronDown } from "lucide-react"
import { notFound } from "next/navigation"
import { ProductView } from "@/components/store/product-view"
import { db } from "@/lib/db"
import { getI18n, getSettings } from "@/lib/i18n"
import { sortSizes, unique } from "@/lib/utils"

const getProduct = (slug: string) =>
  db.product.findUnique({
    where: { slug },
    include: { category: true, variants: true, images: { include: { variant: { select: { color: true } } } } },
  })

export async function generateMetadata({ params }: PageProps<"/products/[slug]">) {
  const p = await getProduct(decodeURIComponent((await params).slug))
  return p ? { title: p.name, description: p.description.slice(0, 160) } : {}
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
