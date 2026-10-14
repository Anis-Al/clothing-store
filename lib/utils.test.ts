import assert from "node:assert/strict"
import test from "node:test"
import { categoryOptions, listHref, listParams, makeSku, paginate, slugify, sortSizes, swatch } from "./utils"

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
  assert.deepEqual(opts.map((o) => [o.group, o.option]), [["Bas", "Bas"], ["Bas", "Pantalons"], ["Hauts", "Hauts"], ["Hauts", "Chemises"]])
  const leaves = (keep?: string) => categoryOptions([
    { id: "c", name: "Chemises", parentId: "h" }, { id: "b", name: "Bas", parentId: null },
    { id: "h", name: "Hauts", parentId: null }, { id: "z", name: "Zips", parentId: null },
  ], true, keep).map((o) => o.label)
  // group "Hauts" hidden; childless mains kept, before the groups
  assert.deepEqual(leaves(), ["Bas", "Zips", "Hauts › Chemises"])
  assert.deepEqual(leaves("h"), ["Bas", "Zips", "Hauts", "Hauts › Chemises"])
})

test("CSV import: parse, decode, plan", async () => {
  const { decodeText, parseCsv, planImport, toCsv } = await import("./csv")
  const { DICTS } = await import("./dict")
  const rows = [["Nom", "Desc"], ["a;b", 'il dit "oui"\nligne 2'], ["", ""]]
  assert.deepEqual(parseCsv("﻿" + toCsv(rows)), rows)
  assert.deepEqual(parseCsv("a,b\r\n1,2"), [["a", "b"], ["1", "2"]])
  assert.deepEqual(parseCsv('a;b\nJean;32"\nPolo;L'), [["a", "b"], ["Jean", '32"'], ["Polo", "L"]]) // stray quote stays text
  assert.equal(decodeText(new Uint8Array([0x63, 0x61, 0x66, 0xe9])), "café") // windows-1252 from plain Excel CSV
  assert.equal(decodeText(new TextEncoder().encode("﻿قميص")), "قميص")

  const cats = [
    { id: "h", name: "Hauts", slug: "hauts", parentId: null }, { id: "c", name: "Chemises", slug: "chemises", parentId: "h" },
    { id: "a", name: "Accessoires", slug: "accessoires", parentId: null },
  ]
  const products = [
    { id: "p1", name: "Chemise Oxford", slug: "chemise-oxford", variants: [{ id: "v1", color: "Blanc", size: "M" }] },
    { id: "p2", name: "Polo", slug: "polo", variants: [] }, { id: "p3", name: "polo", slug: "polo-2", variants: [] },
  ]
  const plan = (csv: string) => planImport(parseCsv(csv), DICTS.fr, cats, products)
  // Arabic headers, "Main › Sub" category, existing product matched in any case, price "1 500,00"
  const ok = plan("الاسم;الفئة;اللون;المقاس;السعر (دج);المخزون\nchemise oxford;Hauts › Chemises;blanc;m;1 500,00;4\nChemise Oxford;Chemises;Blanc;L;1500;2\nCeinture;accessoires;Noir;Unique;900 DA;0")
  assert.deepEqual(ok.errors, [])
  assert.deepEqual(ok.plan.map((p) => [p.id, p.name, p.variants.map((v) => [v.id, v.size, v.price, v.stockCount])]), [
    ["p1", "chemise oxford", [["v1", "m", 1500, 4], [undefined, "L", 1500, 2]]],
    [undefined, "Ceinture", [[undefined, "Unique", 900, 0]]],
  ])
  assert.deepEqual(plan("Nom;Couleur\nx;y").errors, ["Colonnes manquantes : Catégorie, Taille, Prix (DA), Stock."])
  const bad = plan("Nom;Catégorie;Couleur;Taille;Prix;Stock\nA;Hauts;Noir;M;1;1\nB;Chemises;Noir;M;1.000;1\nC;Robes;Noir;M;1;1\nPolo;Chemises;Noir;M;1;1\nD;Chemises;Noir;M;1;1\nD;Chemises;noir;m;1;1\nE;Chemises;Noir;M;0;1\nF;Accessoires › Chemises;Noir;M;1;1")
  assert.deepEqual(bad.errors, [
    "Ligne 2 : « Hauts » a des sous-catégories : indiquez la sous-catégorie",
    "Ligne 3 : « Prix (DA) » manquant ou invalide",
    "Ligne 4 : catégorie « Robes » introuvable",
    "Ligne 5 : plusieurs produits s'appellent « Polo »",
    "Ligne 7 : variante noir / m en double",
    "Ligne 8 : « Prix (DA) » manquant ou invalide",
    "Ligne 9 : catégorie « Accessoires › Chemises » introuvable",
  ])
  assert.deepEqual(plan("Nom;Catégorie;Couleur;Taille;Prix;Stock\n;;;;;").errors, ["Le fichier ne contient aucune ligne de produit."])
})

test("DZ phone + wilaya + commune validation", async () => {
  const { normalizePhone, isWilaya, isCommune, communesOf, WILAYAS } = await import("./wilayas")
  const { COMMUNES } = await import("./communes")
  // every wilaya has its communes, under the same code
  assert.deepEqual(Object.keys(COMMUNES).sort(), WILAYAS.map(([code]) => code))
  assert.equal(Object.values(COMMUNES).flat().length, 1541)
  const [first] = communesOf("16 - Alger")
  assert.ok(isCommune("16 - Alger", first[0]))
  assert.ok(!isCommune("31 - Oran", first[0])) // commune of another wilaya
  assert.ok(!isCommune("16 - Alger", first[1])) // Arabic label is not the stored value
  assert.ok(!isCommune("16 - Alger", ""))
  assert.equal(normalizePhone("0555 12 34 56"), "0555123456")
  assert.equal(normalizePhone("+213 661-22-33-44"), "0661223344")
  assert.equal(normalizePhone("00213799887766"), "0799887766")
  assert.equal(normalizePhone("0455123456"), null) // landline prefix
  assert.equal(normalizePhone("055512345"), null)
  assert.equal(WILAYAS.length, 58)
  assert.ok(isWilaya("16 - Alger"))
  assert.ok(!isWilaya("Alger"))
})
