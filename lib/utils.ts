export { cn } from "cn"

export function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export const makeSku = (slug: string, color: string, size: string) =>
  `${slug}-${slugify(color)}-${slugify(size)}`.toUpperCase()

const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"]
// ponytail: letter sizes in fixed order, numeric sizes (38, 40…) numerically, anything else last
export function sortSizes(sizes: string[]) {
  const rank = (s: string) => {
    const i = SIZE_ORDER.indexOf(s.toUpperCase())
    return i >= 0 ? i : isNaN(+s) ? 999 : 100 + +s
  }
  return [...sizes].sort((a, b) => rank(a) - rank(b))
}

// Color names are free text typed by the admin; known French names map to a swatch, otherwise
// the name itself is tried as a CSS color ("navy", "#c0ffee").
const SWATCH: Record<string, string> = {
  noir: "#111111", blanc: "#ffffff", gris: "#9e9ea0", rouge: "#d30005", bleu: "#1151ff",
  marine: "#1c2a48", vert: "#007d48", kaki: "#6b6b3a", beige: "#d9c9a8", marron: "#6b4423",
  rose: "#ffb0dd", violet: "#beaffd", jaune: "#f5c400", orange: "#f26b1d", ecru: "#efe8da",
  "bleu ciel": "#9cc3ea", bordeaux: "#780700",
}
export const swatch = (color: string) => SWATCH[color.trim().toLowerCase()] ?? color

export const unique = <T,>(xs: T[]) => [...new Set(xs)]

// Admin selects: main categories by name, each followed by its sub-categories as "Main › Sub".
// `leaves` (product form): a main category with sub-categories is a group, not a place for products.
// `keep` = the product's current category, listed anyway so the select never shows a raw id.
export function categoryOptions(cats: { id: string; name: string; parentId: string | null }[], leaves = false, keep?: string) {
  const byName = [...cats].sort((a, b) => a.name.localeCompare(b.name))
  return byName.filter((c) => !c.parentId).flatMap((main) => {
    const subs = byName.filter((s) => s.parentId === main.id)
    return [
      ...(!leaves || !subs.length || main.id === keep ? [{ value: main.id, label: main.name }] : []),
      ...subs.map((s) => ({ value: s.id, label: `${main.name} › ${s.name}` })),
    ]
  })
}

// Admin lists (products, stock): filters + page live in the URL.
export type ListParams = { q: string; category: string; stock: "" | "low" | "out"; sort: "" | "desc"; page: number }

export function listParams(sp: Record<string, string | string[] | undefined>): ListParams {
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k].trim() : "")
  const stock = s("stock")
  return {
    q: s("q"),
    category: s("category"),
    stock: stock === "low" || stock === "out" ? stock : "",
    sort: s("sort") === "desc" ? "desc" : "",
    page: Math.max(1, Math.floor(Number(s("page"))) || 1),
  }
}

// Same list with some params changed. Empty values and page 1 stay out of the URL.
export function listHref(path: string, cur: ListParams, patch: Partial<ListParams>) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries({ ...cur, ...patch })) if (v && !(k === "page" && v === 1)) p.set(k, String(v))
  return p.size ? `${path}?${p}` : path
}

// Page is clamped: a stale ?page=9 after filtering shows the last page instead of nothing.
export function paginate(total: number, page: number, perPage: number) {
  const pages = Math.max(1, Math.ceil(total / perPage))
  const current = Math.min(page, pages)
  return { pages, page: current, skip: (current - 1) * perPage, take: perPage }
}

// Order status change → stock: +1 puts the items back (cancel), -1 takes them again (reopen), 0 leaves it.
export const stockDirection = (from: string, to: string) =>
  from === to || (from !== "CANCELLED" && to !== "CANCELLED") ? 0 : to === "CANCELLED" ? 1 : -1
