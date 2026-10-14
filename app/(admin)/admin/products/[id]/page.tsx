import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Plus, Trash2, X } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ConfirmButton } from "@/components/admin/client"
import { Field, MatrixFields, Notice, ProductFields } from "@/components/admin/fields"
import { FormSelect } from "@/components/form-select"
import { addVariants, deleteImage, deleteProduct, deleteVariant, updateProduct, uploadImages } from "@/lib/actions/admin"
import { db } from "@/lib/db"
import { formatPrice, getI18n, getSettings } from "@/lib/i18n"
import { cn, sortSizes, swatch, unique } from "@/lib/utils"

export default async function EditProduct({ params, searchParams }: PageProps<"/admin/products/[id]">) {
  const { id } = await params
  const [{ t, locale }, p, categories, { lowStock }] = await Promise.all([
    getI18n(),
    db.product.findUnique({ where: { id }, include: { variants: true, images: { include: { variant: true } } } }),
    db.category.findMany({ orderBy: { name: "asc" } }),
    getSettings(),
  ])
  if (!p) notFound()
  const colors = unique(p.variants.map((v) => v.color))
  const sizes = sortSizes(unique(p.variants.map((v) => v.size)))
  const variants = [...p.variants].sort((a, b) => a.color.localeCompare(b.color) || sizes.indexOf(a.size) - sizes.indexOf(b.size))

  // Key numbers up top, so nothing important needs a scroll.
  const prices = variants.map((v) => v.price)
  const [lo, hi] = prices.length ? [Math.min(...prices), Math.max(...prices)] : [0, 0]
  const soldOut = variants.filter((v) => v.stockCount === 0).length
  const stats = [
    { label: t.admin.price, value: lo === hi ? formatPrice(lo, locale) : `${formatPrice(lo, locale)} – ${formatPrice(hi, locale)}` },
    { label: t.admin.stock, value: variants.reduce((s, v) => s + v.stockCount, 0) },
    { label: t.admin.outOfStock, value: soldOut, alert: soldOut > 0 },
    { label: t.admin.variants, value: variants.length },
  ]

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[32px] font-medium">{p.name}</h1>
        <Link href={`/products/${p.slug}`} className="font-medium underline underline-offset-4">{t.admin.backToStore} ↗</Link>
      </div>
      <Notice t={t} sp={searchParams} />

      <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-1 bg-cloud p-4">
            <dt className="text-sm font-medium text-mute">{s.label}</dt>
            <dd className={cn("text-2xl font-medium tabular-nums", s.alert && "text-sale")}>{s.value}</dd>
          </div>
        ))}
      </dl>

      {/* aside first in the DOM: on phones the images come right after the numbers */}
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
        <aside className="flex flex-col gap-4 lg:sticky lg:top-10 lg:col-start-2 lg:row-start-1">
          <h2 className="text-2xl font-medium">{t.admin.images} <span className="text-mute tabular-nums">({p.images.length})</span></h2>
          {p.images.length ? (
            <ul className="grid grid-cols-3 gap-2">
              {p.images.map((img) => (
                <li key={img.id} className="relative aspect-square bg-cloud">
                  <Image src={img.url} alt="" fill sizes="120px" className="object-cover" />
                  <span className="absolute start-1 bottom-1 max-w-[calc(100%-0.5rem)] truncate rounded-full border border-hairline bg-canvas px-2 py-0.5 text-xs font-medium">
                    {img.variant?.color ?? t.admin.allColors}
                  </span>
                  <form action={deleteImage.bind(null, p.id, img.id)} className="absolute end-1 top-1">
                    <ConfirmButton message={t.admin.confirmDelete} aria-label={t.admin.delete}
                      className="grid size-8 place-items-center rounded-full bg-canvas hover:text-sale">
                      <X className="size-4" />
                    </ConfirmButton>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-mute">{t.admin.noImages}</p>
          )}
          <form action={uploadImages.bind(null, p.id)} className="flex flex-col gap-3 border-t border-hairline pt-4">
            <Input name="files" type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" multiple required
              aria-label={t.admin.images} className="pt-2" />
            <Field label={t.admin.imageFor}>
              <FormSelect name="color" placeholder={t.admin.allColors}
                items={[{ value: "", label: t.admin.allColors }, ...colors.map((c) => ({ value: c, label: c }))]} />
            </Field>
            <Button type="submit" variant="secondary">{t.admin.upload}</Button>
          </form>
        </aside>

        <div className="flex min-w-0 flex-col gap-8 lg:col-start-1 lg:row-start-1">
          {/* product fields + every variant row, saved together */}
          <form action={updateProduct.bind(null, p.id)} className="flex flex-col gap-6">
            <ProductFields t={t} categories={categories} p={p} />
            <section className="flex flex-col gap-4 border-t border-hairline pt-6">
              <h2 className="text-2xl font-medium">{t.admin.variants} <span className="text-mute tabular-nums">({variants.length})</span></h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.admin.color}</TableHead>
                    <TableHead>{t.admin.size}</TableHead>
                    <TableHead>{t.admin.sku}</TableHead>
                    <TableHead>{t.admin.price}</TableHead>
                    <TableHead>{t.admin.stock}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {variants.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          <span className="size-3 rounded-full ring-1 ring-hairline" style={{ background: swatch(v.color) }} />
                          {v.color}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium">{v.size}</TableCell>
                      <TableCell className="font-mono text-xs text-mute" dir="ltr">{v.sku}</TableCell>
                      <TableCell><Input name={`price_${v.id}`} type="number" min={1} defaultValue={v.price} className="h-9 w-28" dir="ltr" /></TableCell>
                      <TableCell>
                        <Input name={`stock_${v.id}`} type="number" min={0} defaultValue={v.stockCount} dir="ltr"
                          className={cn("h-9 w-20", v.stockCount === 0 ? "text-sale" : v.stockCount <= lowStock && "text-[#b45309]")} />
                      </TableCell>
                      <TableCell>
                        <ConfirmButton message={t.admin.confirmDelete} formAction={deleteVariant.bind(null, p.id, v.id)}
                          aria-label={t.admin.delete} className="grid size-9 place-items-center rounded-full text-mute hover:bg-cloud hover:text-sale">
                          <Trash2 className="size-5" />
                        </ConfirmButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
            {/* sticky: saving never needs a scroll to the end of a long variant list */}
            <div className="sticky bottom-0 z-10 border-t border-hairline bg-canvas py-4">
              <Button type="submit">{t.admin.save}</Button>
            </div>
          </form>

          {/* rare action: folded */}
          <details className="group border-t border-hairline pt-6">
            <summary className={cn(buttonVariants({ variant: "secondary" }), "w-fit cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
              <Plus className="transition-transform group-open:rotate-45" /> {t.admin.addVariants}
            </summary>
            <form action={addVariants.bind(null, p.id)} className="mt-6 flex flex-col gap-4">
              <MatrixFields t={t} />
              <Button type="submit" className="w-fit">{t.admin.addVariants}</Button>
            </form>
          </details>

          <form action={deleteProduct.bind(null, p.id)} className="border-t border-hairline pt-6">
            <ConfirmButton message={t.admin.confirmDelete} className="font-medium text-sale underline underline-offset-4">
              {t.admin.delete} « {p.name} »
            </ConfirmButton>
          </form>
        </div>
      </div>
    </div>
  )
}
