import Link from "next/link"
import { SlidersHorizontal } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { ProductGrid } from "@/components/store/product-card"
import { getFacets, getProducts, type Filters } from "@/lib/catalog"
import { getI18n } from "@/lib/i18n"
import { cn, sortSizes, swatch } from "@/lib/utils"

export async function generateMetadata() {
  return { title: (await getI18n()).t.catalog.title }
}

export default async function Catalog({ searchParams }: PageProps<"/products">) {
  const sp = await searchParams
  const f: Filters = Object.fromEntries(
    (["q", "category", "size", "color", "sort"] as const).flatMap((k) => (typeof sp[k] === "string" && sp[k] ? [[k, sp[k]]] : [])),
  )
  const [{ t }, products, facets] = await Promise.all([getI18n(), getProducts(f), getFacets(f.category)])

  // Each facet is single-select: clicking the active chip clears it.
  const href = (k: keyof Filters, v?: string) => {
    const p = new URLSearchParams(f as Record<string, string>)
    if (!v || f[k] === v) p.delete(k)
    else p.set(k, v)
    return `/products${p.size ? `?${p}` : ""}`
  }
  const to = (k: keyof Filters, v: string) => `/products?${new URLSearchParams({ ...f, [k]: v } as Record<string, string>)}`
  const chip = (active: boolean) =>
    cn("inline-flex h-10 shrink-0 items-center rounded-full border px-4 text-sm font-medium", active ? "border-ink bg-ink text-canvas" : "border-hairline hover:border-ink")
  // ?category= is a main category or one of its sub-categories; `group` is the main one either way.
  const group = facets.categories.find((c) => c.slug === f.category || c.children.some((s) => s.slug === f.category))
  const exact = group?.slug === f.category ? group : group?.children.find((s) => s.slug === f.category)
  const title = exact?.name ?? t.catalog.title
  const active = (["category", "size", "color"] as const).filter((k) => f[k]).length

  const filters = (
    <>
      <FilterGroup label={t.catalog.category}>
        <Link href={href("category")} className={chip(!f.category)}>{t.catalog.all}</Link>
        {facets.categories.map((c) => (
          <Link key={c.id} href={exact === c ? href("category") : to("category", c.slug)} className={chip(group === c)}>{c.name}</Link>
        ))}
        {/* sub-categories of the selected group; clicking the active one goes back up to the group */}
        {group && group.children.length > 0 && (
          <div className="flex basis-full flex-wrap gap-2 border-s-2 border-hairline ps-3">
            <Link href={to("category", group.slug)} className={cn(chip(exact === group), "h-8")}>{t.catalog.all}</Link>
            {group.children.map((s) => (
              <Link key={s.id} href={to("category", exact === s ? group.slug : s.slug)} className={cn(chip(exact === s), "h-8")}>{s.name}</Link>
            ))}
          </div>
        )}
      </FilterGroup>
      <FilterGroup label={t.catalog.size}>
        {sortSizes(facets.sizes).map((s) => (
          <Link key={s} href={href("size", s)} className={cn(chip(f.size === s), "min-w-12 justify-center")}>{s}</Link>
        ))}
      </FilterGroup>
      <FilterGroup label={t.catalog.color}>
        {facets.colors.map((c) => (
          <Link key={c} href={href("color", c)} className={cn(chip(f.color === c), "gap-2")}>
            <span className="size-3 rounded-full ring-1 ring-hairline" style={{ background: swatch(c) }} />
            {c}
          </Link>
        ))}
      </FilterGroup>
      {Object.keys(f).some((k) => k !== "sort") && (
        <Link href="/products" className="text-sm font-medium underline underline-offset-4">{t.catalog.clear}</Link>
      )}
    </>
  )

  return (
    <div className="flex flex-col gap-6 py-6 md:flex-row md:gap-10">
      <aside className="flex shrink-0 flex-col gap-6 md:w-[220px]">
        <h1 className="text-2xl font-medium">
          {f.q ? <>{t.catalog.searchFor} « {f.q} »</> : title}{" "}
          <span className="text-mute">({products.length})</span>
        </h1>
        {/* ponytail: filters rendered twice (folded on mobile so products show on the first screen,
            always open on desktop) — simpler than ::details-content, which older phones lack */}
        <details className="md:hidden">
          <summary className={cn(chip(active > 0), "w-fit cursor-pointer list-none gap-2 [&::-webkit-details-marker]:hidden")}>
            <SlidersHorizontal className="size-4" /> {t.catalog.filters}
            {active > 0 && <span className="tabular-nums">({active})</span>}
          </summary>
          <div className="mt-4 flex flex-col gap-6">{filters}</div>
        </details>
        <div className="hidden flex-col gap-6 md:flex">{filters}</div>
      </aside>

      <section className="flex flex-1 flex-col gap-4">
        <nav aria-label={t.catalog.sortBy} className="flex items-center gap-4 overflow-x-auto text-sm font-medium whitespace-nowrap sm:justify-end">
          <span className="hidden text-mute sm:inline">{t.catalog.sortBy}</span>
          {([[undefined, t.catalog.sortNew], ["price-asc", t.catalog.sortPriceAsc], ["price-desc", t.catalog.sortPriceDesc]] as const).map(([v, label]) => (
            <Link key={label} href={href("sort", v)} aria-current={f.sort === v || undefined}
              className={cn("border-b-2 py-1", f.sort === v ? "border-ink" : "border-transparent text-mute hover:text-ink")}>
              {label}
            </Link>
          ))}
        </nav>
        {products.length ? (
          <ProductGrid products={products} />
        ) : (
          <div className="flex flex-col items-start gap-4 py-16">
            <p className="text-lg">{t.catalog.empty}</p>
            <Link href="/products" className={buttonVariants({ variant: "secondary" })}>{t.catalog.clear}</Link>
          </div>
        )}
      </section>
    </div>
  )
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-t border-hairline pt-4">
      <p className="font-medium">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}
