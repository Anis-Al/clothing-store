import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { isWilaya } from "./wilayas"
import { parseDesks, parseFees, wilayaFor } from "./defaults"

const fees = parseFees(readFileSync(new URL("../data/yalidine-fees.csv", import.meta.url), "utf8"))
const desks = parseDesks(readFileSync(new URL("../data/yalidine-desks.csv", import.meta.url), "utf8"))

test("Yalidine tariff: every wilaya, courier spellings mapped, 2019 wilayas take their parent's", () => {
  assert.equal(fees.length, 58)
  assert.deepEqual(fees.find((f) => f.wilaya === "16 - Alger"), { wilaya: "16 - Alger", home: 500, desk: 450 })
  assert.deepEqual(fees.find((f) => f.wilaya === "34 - Bordj Bou Arréridj"), { wilaya: "34 - Bordj Bou Arréridj", home: 850, desk: 700 })
  assert.deepEqual(fees.find((f) => f.wilaya === "49 - Timimoun"), { wilaya: "49 - Timimoun", home: 1450, desk: 1150 }) // Adrar's
  assert.ok(fees.every((f) => f.home > 0 && f.desk > 0))
  assert.equal(wilayaFor("El Menia"), "58 - El Meniaa")
  assert.equal(wilayaFor("El M'Ghair"), "57 - El M'Ghair")
})

test("Yalidine desks: all rows, valid wilayas, unquoted-comma address joined", () => {
  assert.equal(desks.length, 200)
  assert.ok(desks.every((d) => isWilaya(d.wilaya) && d.deskId && d.commune && d.name))
  assert.equal(new Set(desks.map((d) => d.deskId)).size, 200)
  const annaba = desks.find((d) => d.deskId === "230102")!
  assert.equal(annaba.wilaya, "23 - Annaba")
  assert.equal(annaba.address, "Champs de Mars Numéro N°3, Annaba")
  assert.equal(desks.find((d) => d.deskId === "580601")?.wilaya, "58 - El Meniaa")
})
