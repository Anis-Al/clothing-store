import Link from "next/link"
import { EyeOff, Plus, Trash2 } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ConfirmButton, NoteInput } from "@/components/admin/client"
import { Help, Notice, SettingsNav } from "@/components/admin/fields"
import { createCategory, deleteCategory, updateCategory } from "@/lib/actions/admin"
import { db } from "@/lib/db"
import { notFound } from "next/navigation"
import { isDebug } from "@/lib/debug"
import { fill, getI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

// One soft-cloud card per main category, its sub-categories listed inside (two levels, nothing folded).
// Read-only until "Modifier" (?edit=1): names become inline fields (Enter or leaving the field saves), empty categories
// get a delete button, each card gets an "add a sub-category" field, and a field on top adds a main category.
// The actions keep `edit` (and `debug`) through the referer, so the admin stays in edit mode after each save.
export default async function Categories({ searchParams }: PageProps<"/admin/settings/categories">) {
  const [{ t }, all, sp] = await Promise.all([
    getI18n(),
    db.category.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { products: true, children: true } } } }),
    searchParams,
  ])
  // Réglages exists only in debug mode (lib/debug.ts): outside it, a 404 like any unknown admin URL
  const debug = await isDebug(sp)
  if (!debug) notFound()
  const edit = sp.edit === "1"
  const href = (on: boolean) => {
    const q = new URLSearchParams()
    if (debug) q.set("debug", "1")
    if (on) q.set("edit", "1")
    return `/admin/settings/categories${q.size ? `?${q}` : ""}`
  }
  type Cat = (typeof all)[number]
  const mains = all.filter((c) => !c.parentId)
  const subsOf = (id: string) => all.filter((s) => s.parentId === id)
  const total = (c: Cat) => c._count.products + subsOf(c.id).reduce((n, s) => n + s._count.products, 0)
  // inline name field: reads as text, dashed underline on hover, ink underline while typing
  const nameField = "w-full min-w-0 border-b border-dashed border-transparent bg-transparent outline-none hover:border-hairline focus:border-solid focus:border-ink"

  // product count (links to the admin list) or, at 0, the "hidden in the shop" eye
  const count = (c: Cat, n: number) => n ? (
    <Link href={`/admin/products?category=${c.id}`} aria-label={`${t.admin.products} · ${n}`}
      className="shrink-0 text-sm tabular-nums text-mute hover:text-ink hover:underline">{n}</Link>
  ) : (
    <span title={t.admin.hiddenInStore} className="shrink-0 text-mute">
      <EyeOff className="size-4" aria-hidden /><span className="sr-only">{t.admin.hiddenInStore}</span>
    </span>
  )

  const name = (c: Cat, big = false) => edit ? (
    <form action={updateCategory.bind(null, c.id)} className="min-w-0 flex-1">
      {/* rename only: the parent stays (moving = delete + re-add under the other card) */}
      <input type="hidden" name="parentId" value={c.parentId ?? ""} />
      <NoteInput name="name" required maxLength={60} defaultValue={c.name} aria-label={t.admin.name}
        className={cn(nameField, big ? "h-8 text-lg font-medium" : "h-7 text-sm")} />
    </form>
  ) : (
    <span className={cn("min-w-0 flex-1 truncate", big ? "text-lg font-medium leading-8" : "text-sm leading-7")}>{c.name}</span>
  )

  // only empty categories can be deleted (the action re-checks)
  const remove = (c: Cat) => edit && !c._count.products && !c._count.children && (
    <form action={deleteCategory.bind(null, c.id)}>
      <ConfirmButton message={t.admin.confirmDelete} aria-label={t.admin.delete}
        className="grid size-8 place-items-center rounded-full text-mute hover:bg-canvas hover:text-sale">
        <Trash2 className="size-4" />
      </ConfirmButton>
    </form>
  )

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <SettingsNav t={t} active="categories" debug={debug} />
      <Notice t={t} sp={searchParams} />

      <div className="flex flex-wrap items-center justify-between gap-4">
        {edit ? (
          <form action={createCategory} className="flex items-center gap-2">
            <Input name="name" required maxLength={60} placeholder={t.admin.newCategory} aria-label={t.admin.newCategory} className="h-10 w-64" />
            <Button type="submit" size="sm">{t.admin.add}</Button>
          </form>
        ) : (
          <p className="flex items-center gap-1.5 text-sm text-mute">
            {fill(t.admin.catSummary, { main: mains.length, sub: all.length - mains.length })}
            <Help text={t.admin.categoriesHint} />
          </p>
        )}
        <Link href={href(!edit)} className={buttonVariants({ variant: edit ? "default" : "secondary", size: "sm" })}>
          {edit ? t.admin.finish : t.admin.edit}
        </Link>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
        {mains.map((m) => {
          const subs = subsOf(m.id)
          return (
            <section key={m.id} className="flex flex-col gap-3 rounded-2xl bg-cloud p-5">
              <header className="flex items-center gap-3">
                {name(m, true)}
                {count(m, total(m))}
                {remove(m)}
              </header>
              {!!subs.length && (
                <ul className="divide-y divide-hairline border-t border-hairline">
                  {subs.map((s) => (
                    <li key={s.id} className="flex min-h-10 items-center gap-3 py-1.5">
                      {name(s)}
                      {count(s, s._count.products)}
                      {remove(s)}
                    </li>
                  ))}
                </ul>
              )}
              {edit && (
                <form action={createCategory} className={cn("flex items-center gap-2", !subs.length && "border-t border-hairline pt-3")}>
                  <input type="hidden" name="parentId" value={m.id} />
                  <input name="name" required maxLength={60} placeholder={t.admin.newSub} aria-label={t.admin.newSub}
                    className={cn(nameField, "h-7 text-sm placeholder:text-mute")} />
                  <button type="submit" aria-label={t.admin.add} className="grid size-8 shrink-0 place-items-center rounded-full text-mute hover:bg-canvas hover:text-ink">
                    <Plus className="size-4" />
                  </button>
                </form>
              )}
            </section>
          )
        })}
      </div>
      {!all.length && <p className="text-mute">{t.admin.none}</p>}
    </div>
  )
}
