import Link from "next/link"
import type { Category, Product } from "@prisma/client"
import { ChevronLeft, ChevronRight, Search } from "lucide-react"
import { FormSelect } from "@/components/form-select"
import { buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { fill, type Dict } from "@/lib/i18n"
import { categoryOptions, cn, listHref, type ListParams } from "@/lib/utils"

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-mute">{hint}</span>}
    </label>
  )
}

export function ProductFields({ t, categories, p }: { t: Dict; categories: Category[]; p?: Product }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label={t.admin.name}><Input name="name" required defaultValue={p?.name} /></Field>
      <Field label={t.admin.category}>
        {/* no default on a new product: with sub-categories, the first one in the list is rarely the right one */}
        <FormSelect name="categoryId" required defaultValue={p?.categoryId} placeholder={t.admin.chooseCategory}
          items={categoryOptions(categories, true, p?.categoryId)} />
      </Field>
      <div className="md:col-span-2">
        <Field label={t.admin.description}>
          <textarea name="description" rows={4} defaultValue={p?.description}
            className="w-full rounded-lg border border-hairline p-4 outline-none focus:border-2 focus:border-ink" />
        </Field>
      </div>
    </div>
  )
}

export function MatrixFields({ t }: { t: Dict }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label={t.admin.colorsList}><Input name="colors" placeholder="Noir, Blanc, Bleu" /></Field>
      <Field label={t.admin.sizesList}><Input name="sizes" placeholder="S, M, L, XL" dir="ltr" /></Field>
      <Field label={t.admin.price}><Input name="price" type="number" min={1} required dir="ltr" /></Field>
      <Field label={t.admin.stock}><Input name="stock" type="number" min={0} defaultValue={0} dir="ltr" /></Field>
      <p className="text-sm text-mute md:col-span-2">{t.admin.matrixHint}</p>
    </div>
  )
}

export async function Notice({ t, sp }: { t: Dict; sp: Promise<Record<string, string | string[] | undefined>> }) {
  const { saved, error } = await sp
  const msg = typeof error === "string" && error in t.admin ? t.admin[error as keyof Dict["admin"]] : undefined
  // Toast, not inline: on long edit pages an inline notice at the top is off-screen after saving.
  const toast = "fixed end-4 bottom-4 z-50 max-w-sm bg-canvas p-4 font-medium shadow-[0_0_0_1px_var(--color-hairline)]"
  if (msg) return <p role="alert" className={`${toast} animate-in fade-in slide-in-from-bottom-4 text-sale`}>{msg}</p>
  if (saved) return <p role="status" className={`${toast} toast-auto text-success`}>{t.admin.saved}</p>
  return null
}

const chip = (on: boolean) =>
  cn("inline-flex h-10 items-center rounded-full border px-4 text-sm font-medium whitespace-nowrap", on ? "border-ink bg-ink text-canvas" : "border-hairline hover:border-ink")

// Réglages = one tab per short form (?tab=, same page) + Catégories (own route: its own forms per row).
export const SETTINGS_TABS = ["store", "home", "delivery", "stock"] as const
export type SettingsTab = (typeof SETTINGS_TABS)[number] | "categories"

export function SettingsNav({ t, active }: { t: Dict; active: SettingsTab }) {
  const tabs: [SettingsTab, string, string][] = [
    ["store", t.admin.sStore, "/admin/settings"],
    ["home", t.admin.sHome, "/admin/settings?tab=home"],
    ["delivery", t.admin.delivery, "/admin/settings?tab=delivery"],
    ["stock", t.admin.lowStock, "/admin/settings?tab=stock"],
    ["categories", t.admin.categories, "/admin/settings/categories"],
  ]
  return (
    <>
      <h1 className="text-[32px] font-medium">{t.admin.settings}</h1>
      <nav aria-label={t.admin.settings} className="flex flex-wrap gap-2 border-b border-hairline pb-6">
        {tabs.map(([k, label, href]) => (
          <Link key={k} href={href} aria-current={k === active ? "page" : undefined} className={chip(k === active)}>{label}</Link>
        ))}
      </nav>
    </>
  )
}

// ---- Admin lists (products, stock): filters + pagination, all in the URL (helpers in lib/utils) ----

export function ListFilters({ t, path, cur, categories, placeholder }: {
  t: Dict; path: string; cur: ListParams; categories: Category[]; placeholder: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {([["", t.catalog.all], ["low", t.admin.lowStock], ["out", t.admin.outOfStock]] as const).map(([v, label]) => (
        <Link key={v} href={listHref(path, cur, { stock: v, page: 1 })} aria-current={cur.stock === v || undefined} className={chip(cur.stock === v)}>
          {label}
        </Link>
      ))}
      {/* GET form: no page input, so a new search or category starts at page 1 */}
      <form action={path} role="search" className="flex flex-wrap items-center gap-2 md:ms-auto">
        {cur.stock && <input type="hidden" name="stock" value={cur.stock} />}
        {cur.sort && <input type="hidden" name="sort" value={cur.sort} />}
        <FormSelect name="category" size="sm" autoSubmit defaultValue={cur.category} placeholder={t.admin.allCategories}
          aria-label={t.admin.category} className="w-52"
          items={[{ value: "", label: t.admin.allCategories }, ...categoryOptions(categories)]} />
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2" />
          <input name="q" type="search" defaultValue={cur.q} placeholder={placeholder} aria-label={t.admin.search}
            className="h-10 w-64 rounded-[24px] bg-cloud ps-10 pe-4 outline-none focus:bg-canvas focus:ring-2 focus:ring-ink" />
        </div>
      </form>
    </div>
  )
}

export function Pager({ t, page, pages, href }: { t: Dict; page: number; pages: number; href: (page: number) => string }) {
  if (pages <= 1) return null
  const btn = buttonVariants({ variant: "secondary", size: "sm" })
  return (
    <nav aria-label={t.admin.pagination} className="flex items-center justify-between gap-4">
      {page > 1 ? <Link href={href(page - 1)} className={btn}><ChevronLeft className="rtl:rotate-180" /> {t.admin.prev}</Link> : <span />}
      <span className="text-sm font-medium text-mute tabular-nums">{fill(t.admin.pageOf, { page, pages })}</span>
      {page < pages ? <Link href={href(page + 1)} className={btn}>{t.admin.next} <ChevronRight className="rtl:rotate-180" /></Link> : <span />}
    </nav>
  )
}
