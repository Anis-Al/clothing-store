import assert from "node:assert/strict"
import test from "node:test"
import { categoryOptions, listHref, listParams, makeSku, paginate, slugify, sortSizes, stockDirection, swatch } from "./utils"

test("slugify strips accents, keeps arabic", () => {
  assert.equal(slugify("Chemise en Lin été"), "chemise-en-lin-ete")
  assert.equal(slugify("قميص كتان"), "قميص-كتان")
  assert.equal(slugify("  --  "), "")
})

test("sortSizes: letters in order, then numbers, then unknown", () => {
  assert.deepEqual(sortSizes(["XL", "42", "S", "Unique", "38", "M"]), ["S", "M", "XL", "38", "42", "Unique"])
})

test("sku + swatch", () => {
  assert.equal(makeSku("chino", "Bleu ciel", "M"), "CHINO-BLEU-CIEL-M")
  assert.equal(swatch("Noir"), "#111111")
  assert.equal(swatch("navy"), "navy")
})

test("order status → stock direction", () => {
  assert.equal(stockDirection("SHIPPED", "CANCELLED"), 1)
  assert.equal(stockDirection("CANCELLED", "PENDING"), -1)
  assert.equal(stockDirection("CANCELLED", "CANCELLED"), 0)
  assert.equal(stockDirection("PENDING", "DELIVERED"), 0)
})

test("admin list params, URLs, pagination", () => {
  const cur = listParams({ q: " oxford ", stock: "nope", page: "-3", sort: "desc" })
  assert.deepEqual(cur, { q: "oxford", category: "", stock: "", sort: "desc", page: 1 })
  assert.equal(listHref("/admin/inventory", cur, { stock: "low" }), "/admin/inventory?q=oxford&stock=low&sort=desc")
  assert.equal(listHref("/admin/products", listParams({ page: "2" }), { page: 1 }), "/admin/products")
  assert.deepEqual(paginate(45, 9, 20), { pages: 3, page: 3, skip: 40, take: 20 })
  assert.deepEqual(paginate(0, 1, 20), { pages: 1, page: 1, skip: 0, take: 20 })
})

test("category options: main then its subs", () => {
  const opts = categoryOptions([
    { id: "c", name: "Chemises", parentId: "h" }, { id: "b", name: "Bas", parentId: null },
    { id: "h", name: "Hauts", parentId: null }, { id: "p", name: "Pantalons", parentId: "b" },
  ])
  assert.deepEqual(opts.map((o) => o.label), ["Bas", "Bas › Pantalons", "Hauts", "Hauts › Chemises"])
  const leaves = (keep?: string) => categoryOptions([
    { id: "c", name: "Chemises", parentId: "h" }, { id: "b", name: "Bas", parentId: null },
    { id: "h", name: "Hauts", parentId: null }, { id: "a", name: "Accessoires", parentId: null },
  ], true, keep).map((o) => o.label)
  assert.deepEqual(leaves(), ["Accessoires", "Bas", "Hauts › Chemises"]) // group "Hauts" hidden, childless mains kept
  assert.deepEqual(leaves("h"), ["Accessoires", "Bas", "Hauts", "Hauts › Chemises"])
})

test("DZ phone + wilaya validation", async () => {
  const { normalizePhone, isWilaya, WILAYAS } = await import("./wilayas")
  assert.equal(normalizePhone("0555 12 34 56"), "0555123456")
  assert.equal(normalizePhone("+213 661-22-33-44"), "0661223344")
  assert.equal(normalizePhone("00213799887766"), "0799887766")
  assert.equal(normalizePhone("0455123456"), null) // landline prefix
  assert.equal(normalizePhone("055512345"), null)
  assert.equal(WILAYAS.length, 58)
  assert.ok(isWilaya("16 - Alger"))
  assert.ok(!isWilaya("Alger"))
})
