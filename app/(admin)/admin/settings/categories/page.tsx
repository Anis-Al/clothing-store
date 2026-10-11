import Link from "next/link"
import { ChevronDown, CornerDownRight, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table"
import { ConfirmButton } from "@/components/admin/client"
import { Field, Notice, SettingsNav } from "@/components/admin/fields"
import { FormSelect } from "@/components/form-select"
import { createCategory, deleteCategory, updateCategory } from "@/lib/actions/admin"
import { db } from "@/lib/db"
import { getI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export default async function Categories({ searchParams }: PageProps<"/admin/settings/categories">) {
  const [{ t }, all, sp] = await Promise.all([
    getI18n(),
    db.category.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { products: true, children: true } } } }),
    searchParams,
  ])
  const mains = all.filter((c) => !c.parentId)
  const subsOf = (id: string) => all.filter((s) => s.parentId === id)
  const total = (c: (typeof all)[number]) => c._count.products + subsOf(c.id).reduce((n, s) => n + s._count.products, 0)
  const parentItems = (self?: string) => [
    { value: "", label: t.admin.topLevel },
    ...mains.filter((m) => m.id !== self).map((m) => ({ value: m.id, label: m.name })),
  ]

  const row = (c: (typeof all)[number]) => {
    const n = total(c)
    const isSub = !!c.parentId
    return (
      <TableRow key={c.id} className={cn(!isSub && "bg-cloud/60")}>
        <TableCell>
          <form action={updateCategory.bind(null, c.id)} className={cn("flex flex-wrap items-center gap-2", isSub && "ps-6")}>
            {isSub && <CornerDownRight className="size-4 text-mute rtl:-scale-x-100" />}
            <Input name="name" required maxLength={60} defaultValue={c.name} aria-label={t.admin.name}
              className={cn("h-10 w-52", !isSub && "font-medium")} />
            {/* a main category with sub-categories must stay main (two levels max) */}
            {c._count.children ? (
              <input type="hidden" name="parentId" value="" />
            ) : (
              <FormSelect name="parentId" size="sm" defaultValue={c.parentId} placeholder={t.admin.topLevel}
                aria-label={t.admin.parentCategory} items={parentItems(c.id)} className="w-52" />
            )}
            <Button type="submit" size="sm" variant="secondary">{t.admin.save}</Button>
          </form>
        </TableCell>
        <TableCell>
          {n ? (
            <Link href={`/admin/products?category=${c.id}`} aria-label={`${t.admin.products} · ${n}`}
              className="font-medium tabular-nums underline underline-offset-4">{n}</Link>
          ) : (
            <span className="text-sm text-mute">0 · {t.admin.hiddenInStore}</span>
          )}
        </TableCell>
        <TableCell>
          <Link href={`/products?category=${c.slug}`} dir="ltr" className="font-mono text-xs text-mute hover:underline">?category={c.slug}</Link>
        </TableCell>
        <TableCell>
          {/* only empty categories can be deleted (the action re-checks) */}
          {!c._count.products && !c._count.children && (
            <form action={deleteCategory.bind(null, c.id)}>
              <ConfirmButton message={t.admin.confirmDelete} aria-label={t.admin.delete}
                className="grid size-10 place-items-center rounded-full text-mute hover:bg-cloud hover:text-sale">
                <Trash2 className="size-5" />
              </ConfirmButton>
            </form>
          )}
        </TableCell>
      </TableRow>
    )
  }

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <SettingsNav t={t} active="categories" />
      <Notice t={t} sp={searchParams} />

      <form action={createCategory} className="flex flex-wrap items-end gap-2">
        <Field label={t.admin.newCategory}>
          <Input name="name" required maxLength={60} placeholder="Vestes, Polos…" className="w-64" />
        </Field>
        <Field label={t.admin.parentCategory}>
          <FormSelect name="parentId" placeholder={t.admin.topLevel} items={parentItems()} className="w-64" />
        </Field>
        <Button type="submit">{t.admin.add}</Button>
      </form>
      <p className="text-sm text-mute">{t.admin.categoriesHint}</p>

      {/* One fold per main category: folded = name, its sub-categories, product count; open = the edit rows.
          Next remounts the page when the search params change, so after a save only ?open= is unfolded. */}
      <div className="border-t border-hairline">
        {mains.map((m) => {
          const n = total(m)
          return (
            <details key={m.id} open={sp.open === m.id} className="group border-b border-hairline">
              <summary className="flex cursor-pointer list-none items-center gap-4 py-4 [&::-webkit-details-marker]:hidden">
                <span className="flex min-w-0 flex-1 flex-col gap-1 md:flex-row md:items-baseline md:gap-4">
                  <span className="text-lg font-medium">{m.name}</span>
                  <span className="truncate text-sm text-mute">{subsOf(m.id).map((s) => s.name).join(", ")}</span>
                </span>
                <span className="shrink-0 text-sm text-mute tabular-nums">
                  {n ? `${t.admin.products} · ${n}` : t.admin.hiddenInStore}
                </span>
                <ChevronDown className="size-5 shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <Table className="mb-4">
                <TableBody>{[m, ...subsOf(m.id)].map(row)}</TableBody>
              </Table>
            </details>
          )
        })}
      </div>
      {!all.length && <p className="text-mute">{t.admin.none}</p>}
    </div>
  )
}
