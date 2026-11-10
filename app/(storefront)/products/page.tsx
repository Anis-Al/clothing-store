import Link from "next/link"
import { ChevronDown, SlidersHorizontal, X } from "lucide-react"
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
  const row = (active: boolean, sub = false) =>
    cn("flex min-h-10 items-center justify-between gap-2 text-sm", active ? "font-medium text-ink" : "text-mute hover:text-ink", sub && "min-h-9")
  // ?category= is a main category or one of its sub-categories; `group` is the main one either way.
  const group = facets.categories.find((c) => c.slug === f.category || c.children.some((s) => s.slug === f.category))
  const exact = group?.slug === f.category ? group : group?.children.find((s) => s.slug === f.category)
  const title = exact?.name ?? t.catalog.title
  const active = (["category", "size", "color"] as const).filter((k) => f[k]).length

  const sizes = sortSizes(facets.sizes)
  // letter sizes and number sizes are different garments (S–XL tops vs 38–58 waists, suits, shoes): two grids
  const letters = sizes.filter((x) => isNaN(+x)), numbers = sizes.filter((x) => !isNaN(+x))
  const sizeCell = (x: string) => (
    <Link key={x} href={href("size", x)} aria-current={f.size === x || undefined}
      className={cn("grid h-9 place-items-center rounded-md border text-sm tabular-nums",
        f.size === x ? "border-ink bg-ink text-canvas" : "border-hairline hover:border-ink")}>{x}</Link>
  )

  const filters = (
    <>
      {/* vertical list (long names like "Chaussures & accessoires" don't fit pills in 220px);
          the selected group opens its sub-categories right under it */}
      <FilterGroup label={t.catalog.category}>
        <ul className="flex flex-col">
          <li><Link href={href("category")} className={row(!f.category)}>{t.catalog.all}</Link></li>
          {facets.categories.map((c) => (
            <li key={c.id}>
              {c.children.length ? (
                // the name filters, the chevron only unfolds the sub-categories (native <details>, open on the picked group)
                <details open={group === c} className="group/cat">
                  <summary className="flex cursor-pointer list-none items-center [&::-webkit-details-marker]:hidden">
                    <Link href={exact === c ? href("category") : to("category", c.slug)} aria-current={group === c || undefined} className={cn(row(group === c), "flex-1")}>
                      {c.name}
                    </Link>
                    <span className="grid size-10 place-items-center text-mute hover:text-ink">
                      <ChevronDown className="size-4 transition-transform group-open/cat:rotate-180" />
                    </span>
                  </summary>
                  <ul className="mb-2 ms-1 flex flex-col border-s-2 border-hairline ps-3">
                    <li><Link href={to("category", c.slug)} className={row(exact === c, true)}>{t.catalog.all}</Link></li>
                    {c.children.map((s) => (
                      <li key={s.id}><Link href={to("category", exact === s ? c.slug : s.slug)} className={row(exact === s, true)}>{s.name}</Link></li>
                    ))}
                  </ul>
                </details>
              ) : (
                <Link href={exact === c ? href("category") : to("category", c.slug)} aria-current={group === c || undefined} className={row(group === c)}>{c.name}</Link>
              )}
            </li>
          ))}
        </ul>
      </FilterGroup>
      {sizes.length > 0 && (
        <FilterGroup label={t.catalog.size}>
          {letters.length > 0 && <div className="grid grid-cols-4 gap-1.5">{letters.map(sizeCell)}</div>}
          {letters.length > 0 && numbers.length > 0 && <p className="mt-3 mb-1.5 text-xs text-mute">{t.catalog.numberSizes}</p>}
          {numbers.length > 0 && <div className="grid grid-cols-4 gap-1.5">{numbers.map(sizeCell)}</div>}
        </FilterGroup>
      )}
      {facets.colors.length > 0 && (
        <FilterGroup label={t.catalog.color}>
          {/* swatches only: the name is the tooltip / screen-reader label, and the applied chip once picked */}
          <div className="flex flex-wrap gap-2">
            {facets.colors.map((c) => (
              <Link key={c} href={href("color", c)} title={c} aria-label={c} aria-current={f.color === c || undefined}
                className={cn("grid size-9 place-items-center rounded-full", f.color === c ? "ring-2 ring-ink ring-offset-2" : "hover:ring-1 hover:ring-hairline hover:ring-offset-2")}>
                <span className="size-7 rounded-full ring-1 ring-hairline ring-inset" style={{ background: swatch(c) }} />
              </Link>
            ))}
          </div>
        </FilterGroup>
      )}
    </>
  )

  // what's applied, each removable on its own (the search goes with it)
  const applied = [
    f.q && { label: `« ${f.q} »`, href: href("q") },
    exact && { label: exact.name, href: href("category") },
    f.size && { label: `${t.catalog.size} ${f.size}`, href: href("size") },
    f.color && { label: f.color, href: href("color") },
  ].filter(Boolean) as { label: string; href: string }[]
  const sortNav = (
    <nav aria-label={t.catalog.sortBy} className="flex items-center gap-4 overflow-x-auto text-sm font-medium whitespace-nowrap">
      <span className="hidden text-mute sm:inline">{t.catalog.sortBy}</span>
      {([[undefined, t.catalog.sortNew], ["price-asc", t.catalog.sortPriceAsc], ["price-desc", t.catalog.sortPriceDesc]] as const).map(([v, label]) => (
        <Link key={label} href={href("sort", v)} aria-current={f.sort === v || undefined}
          className={cn("border-b-2 py-1", f.sort === v ? "border-ink" : "border-transparent text-mute hover:text-ink")}>
          {label}
        </Link>
      ))}
    </nav>
  )

  return (
    <div className="flex flex-col gap-5 py-6">
      {/* title + count on one line with the sort (desktop); the filter column starts below it */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <h1 className="text-2xl font-medium md:text-[28px]">
          {f.q ? <>{t.catalog.searchFor} « {f.q} »</> : title}{" "}
          <span className="font-normal text-mute tabular-nums">({products.length})</span>
        </h1>
        <div className="max-md:hidden">{sortNav}</div>
      </div>
      {applied.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {applied.map((a) => (
            <Link key={a.href + a.label} href={a.href} aria-label={`${t.catalog.remove} ${a.label}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-cloud ps-3 pe-2 text-sm hover:bg-hairline-soft">
              {a.label}<X className="size-3.5" aria-hidden />
            </Link>
          ))}
          {applied.length > 1 && <Link href="/products" className="ms-1 text-sm underline underline-offset-4">{t.catalog.clear}</Link>}
        </div>
      )}

      <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-10">
        {/* desktop: sticky under the 100px header, scrolls on its own when taller than the screen */}
        <aside className="flex shrink-0 flex-col md:sticky md:top-[116px] md:max-h-[calc(100dvh-132px)] md:w-[220px] md:overflow-y-auto md:pe-1 md:[scrollbar-width:thin]">
          {/* ponytail: filters rendered twice (folded on mobile so products show on the first screen,
              always open on desktop) — simpler than ::details-content, which older phones lack */}
          <details className="md:hidden">
            <summary className="flex list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
              <span className={cn(chip(active > 0), "cursor-pointer gap-2")}>
                <SlidersHorizontal className="size-4" /> {t.catalog.filters}
                {active > 0 && <span className="tabular-nums">({active})</span>}
              </span>
            </summary>
            <div className="mt-4 flex flex-col">{filters}</div>
          </details>
          <div className="mt-3 md:hidden">{sortNav}</div>
          <div className="hidden flex-col md:flex">{filters}</div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col gap-4">
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
    </div>
  )
}

// One foldable group (Nike's filter disclosure): name + chevron, open by default. The picked value shows once, as an
// applied chip above the grid, not again in the heading.
function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details open className="group border-t border-hairline py-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <span className="font-medium">{label}</span>
        <ChevronDown className="size-4 shrink-0 text-mute transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  )
}
