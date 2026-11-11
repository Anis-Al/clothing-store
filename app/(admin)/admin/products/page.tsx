import Image from "next/image"
import Link from "next/link"
import { headers } from "next/headers"
import type { Prisma } from "@prisma/client"
import { buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ListFilters, Pager } from "@/components/admin/fields"
import { db } from "@/lib/db"
import { formatPrice, getI18n, getSettings } from "@/lib/i18n"
import { cn, listHref, listParams, paginate } from "@/lib/utils"

const PATH = "/admin/products"
const PER_PAGE = 7 // rows fit a 1280×800 screen with the filters
const PER_PAGE_PHONE = 7 // compact rows (same phone sniff as Stock); user's call

export default async function AdminProducts({ searchParams }: PageProps<"/admin/products">) {
  const cur = listParams(await searchParams)
  const h = await headers()
  const phone = h.get("sec-ch-ua-mobile") === "?1" || /Mobi/i.test(h.get("user-agent") ?? "")
  const { lowStock } = await getSettings()
  // low = at least one variant at or below the Réglages threshold; out = nothing left to sell
  const where: Prisma.ProductWhereInput = {
    ...(cur.q && { name: { contains: cur.q } }),
    ...(cur.category && { category: { OR: [{ id: cur.category }, { parentId: cur.category }] } }), // main = its subs too
    ...(cur.stock === "low" && { variants: { some: { stockCount: { lte: lowStock } } } }),
    ...(cur.stock === "out" && { variants: { every: { stockCount: 0 } } }),
  }
  const [{ t, locale }, total, categories] = await Promise.all([
    getI18n(),
    db.product.count({ where }),
    db.category.findMany({ orderBy: { name: "asc" } }),
  ])
  const { page, pages, skip, take } = paginate(total, cur.page, phone ? PER_PAGE_PHONE : PER_PAGE)
  const products = await db.product.findMany({
    where, skip, take, orderBy: { createdAt: "desc" }, include: { category: true, variants: true, images: { take: 1 } },
  })
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[32px] font-medium">{t.admin.products} <span className="text-mute tabular-nums">({total})</span></h1>
        <div className="flex gap-2">
          <Link href="/admin/products/import" className={buttonVariants({ variant: "secondary" })}>{t.admin.import}</Link>
          <Link href="/admin/products/new" className={buttonVariants()}>{t.admin.newProduct}</Link>
        </div>
      </div>
      <ListFilters t={t} path={PATH} cur={cur} categories={categories} placeholder={t.admin.searchProducts} />
      <Table stack>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16" />
            <TableHead>{t.admin.name}</TableHead>
            <TableHead>{t.admin.category}</TableHead>
            <TableHead>{t.admin.variants}</TableHead>
            <TableHead>{t.admin.stock}</TableHead>
            <TableHead>{t.admin.price}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((p) => {
            const stock = p.variants.reduce((s, v) => s + v.stockCount, 0)
            const price = p.variants.length ? formatPrice(Math.min(...p.variants.map((v) => v.price)), locale) : "—"
            return (
              <TableRow key={p.id} className="max-md:flex-nowrap max-md:gap-3 max-md:py-2">
                <TableCell className="max-md:shrink-0 max-md:p-0">
                  <div className="relative size-12 bg-cloud">
                    {p.images[0] && <Image src={p.images[0].url} alt="" fill sizes="48px" className="object-cover" />}
                  </div>
                </TableCell>
                <TableCell className="max-md:min-w-0 max-md:flex-1 max-md:p-0">
                  {/* phones: price at the end of the name line (a bare "1 900 DA" after the stock read as anything), then
                      the labelled counts; a low stock is amber, 0 red (same colours as the Stock page) */}
                  <div className="flex items-baseline justify-between gap-3">
                    <Link href={`/admin/products/${p.id}`} className="font-medium underline-offset-4 hover:underline">{p.name}</Link>
                    <span className="shrink-0 tabular-nums md:hidden">{price}</span>
                  </div>
                  {/* three chips, not one dotted line (user: "category · variants : n · stock : n" read as noise) */}
                  <div className="mt-1.5 flex flex-wrap gap-1.5 md:hidden">
                    <Badge variant="secondary">{p.category.name}</Badge>
                    <Badge variant="outline" className="text-mute">{p.variants.length === 1 ? t.admin.variantOne : t.admin.variantMany.replace("{n}", String(p.variants.length))}</Badge>
                    <Badge variant="outline" className={cn("tabular-nums", stock === 0 ? "text-sale" : stock <= lowStock && "text-[#b45309]")}>{t.admin.stock} {stock}</Badge>
                  </div>
                </TableCell>
                <TableCell className="max-md:hidden">{p.category.name}</TableCell>
                <TableCell className="tabular-nums max-md:hidden">{p.variants.length}</TableCell>
                <TableCell className="tabular-nums max-md:hidden">{stock}</TableCell>
                <TableCell className="max-md:hidden">{price}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      {!products.length && <p className="text-mute">{t.admin.none}</p>}
      <Pager t={t} page={page} pages={pages} href={(n) => listHref(PATH, cur, { page: n })} />
    </div>
  )
}
