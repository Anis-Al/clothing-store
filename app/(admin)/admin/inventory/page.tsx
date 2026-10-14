import Link from "next/link"
import type { Prisma } from "@prisma/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ListFilters, Pager } from "@/components/admin/fields"
import { updateStock } from "@/lib/actions/admin"
import { db } from "@/lib/db"
import { formatPrice, getI18n, getSettings } from "@/lib/i18n"
import { cn, listHref, listParams, paginate } from "@/lib/utils"

const PATH = "/admin/inventory"
const PER_PAGE = 7

export default async function Inventory({ searchParams }: PageProps<"/admin/inventory">) {
  const cur = listParams(await searchParams)
  const sort = cur.sort || "asc"
  const { lowStock } = await getSettings()
  // q matches the product name or the reference (SKU)
  const where: Prisma.ProductVariantWhereInput = {
    ...(cur.q && { OR: [{ product: { name: { contains: cur.q } } }, { sku: { contains: cur.q } }] }),
    ...(cur.category && { product: { category: { OR: [{ id: cur.category }, { parentId: cur.category }] } } }),
    ...(cur.stock === "low" && { stockCount: { lte: lowStock } }),
    ...(cur.stock === "out" && { stockCount: 0 }),
  }
  const [{ t, locale }, total, categories] = await Promise.all([
    getI18n(),
    db.productVariant.count({ where }),
    db.category.findMany({ orderBy: { name: "asc" } }),
  ])
  const { page, pages, skip, take } = paginate(total, cur.page, PER_PAGE)
  const variants = await db.productVariant.findMany({
    where, skip, take, orderBy: [{ stockCount: sort }, { sku: "asc" }], include: { product: true },
  })
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[32px] font-medium">{t.admin.inventory} <span className="text-mute tabular-nums">({total})</span></h1>
      <ListFilters t={t} path={PATH} cur={cur} categories={categories} placeholder={t.admin.searchStock} />
      <Table stack>
        <TableHeader>
          <TableRow>
            <TableHead>{t.admin.product}</TableHead>
            <TableHead>{t.admin.color} / {t.admin.size}</TableHead>
            <TableHead>{t.admin.sku}</TableHead>
            <TableHead>{t.admin.price}</TableHead>
            <TableHead>
              <Link href={listHref(PATH, cur, { sort: sort === "asc" ? "desc" : "", page: 1 })} className="underline underline-offset-4">
                {sort === "asc" ? t.admin.sortStockAsc : t.admin.sortStockDesc}
              </Link>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {variants.map((v) => (
            <TableRow key={v.id}>
              <TableCell className="max-md:basis-full"><Link href={`/admin/products/${v.productId}`} className="font-medium hover:underline">{v.product.name}</Link></TableCell>
              <TableCell>{v.color} / {v.size}</TableCell>
              <TableCell className="font-mono text-xs text-mute" dir="ltr">{v.sku}</TableCell>
              <TableCell>{formatPrice(v.price, locale)}</TableCell>
              <TableCell data-label={t.admin.stock} className="max-md:basis-full">
                {/* inline edit: one tiny form per row */}
                <form action={updateStock.bind(null, v.id)} className="flex items-center gap-2">
                  <Input name="stock" type="number" min={0} defaultValue={v.stockCount} aria-label={t.admin.stock} dir="ltr"
                    className={cn("h-10 w-24", v.stockCount === 0 ? "text-sale" : v.stockCount <= lowStock && "text-[#b45309]")} />
                  <Button type="submit" size="sm" variant="secondary">{t.admin.save}</Button>
                </form>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!variants.length && <p className="text-mute">{t.admin.none}</p>}
      <Pager t={t} page={page} pages={pages} href={(n) => listHref(PATH, cur, { page: n })} />
    </div>
  )
}
