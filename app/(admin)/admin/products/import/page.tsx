import { buttonVariants } from "@/components/ui/button"
import { ImportForm } from "@/components/admin/client"
import { IMPORT_COLS, toCsv } from "@/lib/csv"
import { db } from "@/lib/db"
import { getI18n } from "@/lib/i18n"

export default async function ImportProducts() {
  const [{ t }, leaf] = await Promise.all([
    getI18n(),
    db.category.findFirst({ where: { children: { none: {} } }, orderBy: { name: "asc" } }),
  ])
  // Template = headers in the admin's language + one example product (2 variants) in a real category.
  // BOM so Excel reads it as UTF-8 (accents, Arabic); ";" like French and Arabic Excel.
  const csv = toCsv([
    IMPORT_COLS.map((k) => t.admin[k]),
    ["Produit exemple", leaf?.name ?? "", "Coton, coupe droite.", "Noir", "M", 2500, 10],
    ["Produit exemple", leaf?.name ?? "", "", "Noir", "L", 2500, 8],
  ])
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <h1 className="text-[28px] font-medium">{t.admin.importTitle}</h1>
      {/* two steps side by side: get the template, send it back filled; one line of rules under them */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-2xl bg-cloud p-5">
          <h2 className="font-medium">{t.admin.importStep1}</h2>
          <p className="text-sm text-mute">{t.admin.importStep1Text}</p>
          <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(`﻿${csv}`)}`} download="modele-produits.csv"
            className={buttonVariants({ variant: "secondary", size: "sm", className: "mt-auto w-fit bg-canvas" })}>
            {t.admin.importTemplate}
          </a>
        </section>
        <section className="flex flex-col gap-3 rounded-2xl border border-hairline-soft p-5">
          <h2 className="font-medium">{t.admin.importStep2}</h2>
          <ImportForm />
        </section>
      </div>
      <p className="text-sm text-mute">{t.admin.importNote}</p>
    </div>
  )
}
