import Image from "next/image"
import Link from "next/link"
import type { ProductCardData } from "@/lib/catalog"
import { getI18n, formatPrice } from "@/lib/i18n"
import { swatch } from "@/lib/utils"

// Nike product-card: zero radius, zero padding, photo on soft-cloud, metadata rows 8px apart.
export async function ProductCard({ p }: { p: ProductCardData }) {
  const { t, locale } = await getI18n()
  return (
    <Link href={`/products/${p.slug}`} className="group flex flex-col gap-2">
      <div className="relative aspect-square overflow-hidden bg-cloud">
        {p.image && (
          <Image src={p.image} alt={p.name} fill sizes="(max-width: 1023px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
        )}
        {p.soldOut && (
          <span className="absolute start-3 top-3 rounded-full border border-hairline bg-canvas px-3 py-1 text-xs font-medium">
            {t.catalog.soldOut}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5 pt-1">
        {p.colors.slice(0, 6).map((c) => (
          <span key={c} title={c} className="size-3 rounded-full ring-1 ring-hairline" style={{ background: swatch(c) }} />
        ))}
      </div>
      <div>
        <p className="font-medium">{p.name}</p>
        <p className="text-sm font-medium text-mute">
          {p.category} · {p.colors.length} {t.catalog.colors}
        </p>
      </div>
      <p className="font-medium">{formatPrice(p.minPrice, locale)}</p>
    </Link>
  )
}

export function ProductGrid({ products }: { products: ProductCardData[] }) {
  return (
    // 2 columns from phone width up: one full-width card per screen made browsing on mobile slow.
    <div className="grid grid-cols-2 gap-x-2 gap-y-8 min-[1024px]:grid-cols-3 min-[1024px]:gap-y-10">
      {products.map((p) => <ProductCard key={p.id} p={p} />)}
    </div>
  )
}
