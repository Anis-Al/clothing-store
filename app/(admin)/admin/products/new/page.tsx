import Link from "next/link"
import { Button, buttonVariants } from "@/components/ui/button"
import { MatrixFields, Notice, ProductFields } from "@/components/admin/fields"
import { createProduct } from "@/lib/actions/admin"
import { db } from "@/lib/db"
import { getI18n } from "@/lib/i18n"

export default async function NewProduct({ searchParams }: PageProps<"/admin/products/new">) {
  const [{ t }, categories] = await Promise.all([getI18n(), db.category.findMany({ orderBy: { name: "asc" } })])
  // The category select is required: without any category the form could never be sent.
  if (!categories.length)
    return (
      <div className="flex max-w-3xl flex-col items-start gap-6">
        <h1 className="text-[32px] font-medium">{t.admin.newProduct}</h1>
        <p>{t.admin.noCategory}</p>
        <Link href="/admin/settings/categories" className={buttonVariants()}>{t.admin.categories}</Link>
      </div>
    )
  return (
    <form action={createProduct} className="flex max-w-3xl flex-col gap-8">
      <h1 className="text-[32px] font-medium">{t.admin.newProduct}</h1>
      <Notice t={t} sp={searchParams} />
      <ProductFields t={t} categories={categories} />
      <section className="flex flex-col gap-4 border-t border-hairline pt-6">
        <h2 className="text-2xl font-medium">{t.admin.variants}</h2>
        <MatrixFields t={t} />
      </section>
      <Button type="submit" className="w-fit">{t.admin.save}</Button>
    </form>
  )
}
