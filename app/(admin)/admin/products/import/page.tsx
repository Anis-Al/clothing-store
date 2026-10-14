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
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-[32px] font-medium">{t.admin.importTitle}</h1>
      <ul className="flex list-disc flex-col gap-2 ps-5 text-sm">{t.admin.importRules.map((r) => <li key={r}>{r}</li>)}</ul>
      <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(`﻿${csv}`)}`} download="modele-produits.csv"
        className={buttonVariants({ variant: "secondary", className: "w-fit" })}>
        {t.admin.importTemplate}
      </a>
      <div className="border-t border-hairline pt-6"><ImportForm /></div>
    </div>
  )
}
