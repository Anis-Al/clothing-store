// Product import from a CSV file (Excel: Enregistrer sous › CSV UTF-8). Pure: the action loads the data and writes the plan.
import { DICTS, fill, type Dict } from "@/lib/dict"
import { slugify } from "@/lib/utils"

// Excel "CSV UTF-8" is UTF-8 (BOM stripped by TextDecoder); plain "CSV" on Windows is windows-1252.
export function decodeText(buf: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf)
  } catch {
    return new TextDecoder("windows-1252").decode(buf)
  }
}

// RFC 4180: quoted cells may hold the separator, "" and line breaks. Separator = the most frequent of ; , tab
// on the first line (French and Arabic Excel write ";"). Blank rows are kept so index + 1 = the Excel row number.
export function parseCsv(text: string): string[][] {
  text = text.replace(/^﻿/, "")
  const first = text.split(/\r?\n/, 1)[0]
  const sep = [";", ",", "\t"].reduce((a, b) => (first.split(b).length > first.split(a).length ? b : a))
  const rows: string[][] = []
  let row: string[] = [], cell = "", quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === sep) { row.push(cell); cell = "" }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++
      row.push(cell); rows.push(row); row = []; cell = ""
    } else cell += c
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows
}

export const toCsv = (rows: (string | number)[][]) =>
  rows.map((r) => r.map((c) => (/[;"\r\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(";")).join("\r\n")

// Columns are named with the admin labels, in either language: header cell → first word ("Prix (DA)" → prix).
export const IMPORT_COLS = ["name", "category", "description", "color", "size", "price", "stock"] as const
type Col = (typeof IMPORT_COLS)[number]
const REQUIRED = IMPORT_COLS.filter((k) => k !== "description")
const head = (s: string) => slugify(s).split("-")[0]
const ALIASES = new Map(Object.values(DICTS).flatMap((d) => IMPORT_COLS.map((k) => [head(d.admin[k]), k] as const)))

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase()
// "1 500", "1500,00", "2500 DA" → integer; "1.000" (thousands or decimals?) and "-3" are refused.
const toInt = (s: string) => {
  const n = s.replace(/[\s  ]/g, "").replace(/[^\d.,]+$/, "").replace(/[.,]0{1,2}$/, "")
  return /^\d+$/.test(n) ? Number(n) : NaN
}

type Cat = { id: string; name: string; slug: string; parentId: string | null }
type Prod = { id: string; name: string; slug: string; variants: { id: string; color: string; size: string }[] }
export type ImportPlan = {
  id?: string; slug?: string; name: string; categoryId: string; description: string
  variants: { id?: string; color: string; size: string; price: number; stockCount: number }[]
}[]
export type ImportState = { errors?: string[]; done?: string } | undefined

// One row = one variant. Rows with the same product name (any case) make one product; its category and
// description come from its first row. A product that already exists keeps its fields: its variants are
// matched by color × size (any case) and get the file's price and stock, the others are added.
export function planImport(table: string[][], t: Dict, cats: Cat[], products: Prod[]) {
  const errors: string[] = []
  const [header = [], ...body] = table
  const idx = new Map<Col, number>()
  header.forEach((h, i) => {
    const k = ALIASES.get(head(h))
    if (k && !idx.has(k)) idx.set(k, i)
  })
  const missing = REQUIRED.filter((k) => !idx.has(k))
  if (missing.length) return { errors: [fill(t.admin.importColumns, { cols: missing.map((k) => t.admin[k]).join(", ") })], plan: [] }

  const catBy = new Map<string, Cat>()
  for (const c of cats) for (const k of [c.slug, slugify(c.name)]) if (!catBy.has(k)) catBy.set(k, c)
  const prodBy = new Map<string, Prod | null>() // null = several products have this name
  for (const p of products) prodBy.set(norm(p.name), prodBy.has(norm(p.name)) ? null : p)

  const plan = new Map<string, ImportPlan[number]>()
  body.forEach((cells, i) => {
    if (!cells.some((c) => c.trim())) return
    const err = (msg: string) => errors.push(fill(t.admin.importLine, { line: i + 2, msg }))
    const get = (k: Col) => (cells[idx.get(k) ?? -1] ?? "").trim()
    const [name, category, color, size] = [get("name"), get("category"), get("color"), get("size")]
    const [price, stockCount] = [toInt(get("price")), toInt(get("stock"))]
    const bad = REQUIRED.find((k) => (k === "price" ? isNaN(price) : k === "stock" ? isNaN(stockCount) : !get(k)))
    if (bad) return err(fill(t.admin.importValue, { col: t.admin[bad] }))

    const cat = catBy.get(slugify(category.split(/[›>]/).pop() ?? "")) // "Hauts › Chemises" works too
    if (!cat) return err(fill(t.admin.importCategory, { v: category }))
    if (cats.some((c) => c.parentId === cat.id)) return err(fill(t.admin.importGroup, { v: category }))
    const key = norm(name)
    const old = prodBy.get(key)
    if (old === null) return err(fill(t.admin.importAmbiguous, { v: name }))

    let p = plan.get(key)
    if (!p) plan.set(key, (p = { id: old?.id, slug: old?.slug, name, categoryId: cat.id, description: get("description"), variants: [] }))
    const same = (v: { color: string; size: string }) => norm(v.color) === norm(color) && norm(v.size) === norm(size)
    if (p.variants.some(same)) return err(fill(t.admin.importDuplicate, { v: `${color} / ${size}` }))
    p.variants.push({ id: old?.variants.find(same)?.id, color, size, price, stockCount })
  })
  if (!errors.length && !plan.size) errors.push(t.admin.importEmpty)
  return { errors, plan: [...plan.values()] }
}
