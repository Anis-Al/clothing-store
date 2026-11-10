import assert from "node:assert/strict"
import { test } from "node:test"
import { courierReady, parcelFor, type OrderToSend } from "./courier"
import { COURIERS, courierOf } from "./couriers"

const variant = { product: { name: "Hoodie" }, color: "Noir", size: "M" }
const base = {
  id: "cmhodvofj26", fullName: "Amine B", phone: "0551234567", wilaya: "16 - Alger", commune: "Alger Centre",
  address: "5 rue des Pins", totalAmount: 4900, method: "HOME", stopDesk: null,
  items: [{ quantity: 2, variant }, { quantity: 1, variant: { ...variant, size: "L" } }],
} as unknown as OrderToSend

test("home parcel: ref, wilaya code, address, product list, total as COD", () => {
  const p = parcelFor(base)
  assert.equal(p.reference, "ODVOFJ26")
  assert.deepEqual(p.recipient, { fullName: "Amine B", phone: "0551234567", wilayaCode: 16, communeName: "Alger Centre", addressLine: "5 rue des Pins" })
  assert.equal(p.deliveryType, "home")
  assert.equal(p.stopDeskId, undefined)
  assert.equal(p.productList, "Hoodie Noir/M x2, Hoodie Noir/L x1")
  assert.equal(p.codAmount, 4900)
  assert.equal(p.freeShipping, true)
})

test("relay parcel: the point's commune and courier desk id, no address line", () => {
  const relay = { ...base, method: "STOPDESK", wilaya: "31 - Oran", commune: "", address: "Yalidine Oran — 2 bd" }
  const p = parcelFor({ ...relay, stopDesk: { deskId: "123", commune: "Oran" } } as unknown as OrderToSend)
  assert.equal(p.deliveryType, "stopdesk")
  assert.equal(p.stopDeskId, "123")
  assert.equal(p.recipient.wilayaCode, 31)
  assert.equal(p.recipient.communeName, "Oran")
  assert.equal(p.recipient.addressLine, undefined)
  // an Ecotrack / Maystro point has no desk id: routed by the commune alone
  assert.equal(parcelFor({ ...relay, stopDesk: { deskId: "", commune: "Oran" } } as unknown as OrderToSend).stopDeskId, undefined)
})

test("courierReady: every credential of the courier, origin wilaya for the Yalidine family only", () => {
  assert.ok(COURIERS.length >= 90)
  assert.deepEqual(courierOf("yalidine")?.[3], ["apiId", "apiToken"])
  assert.equal(courierReady({ courier: "yalidine", courierKeys: '{"apiId":"a","apiToken":"b"}', courierFromWilaya: "16 - Alger" }), true)
  assert.equal(courierReady({ courier: "yalidine", courierKeys: '{"apiId":"a","apiToken":"b"}', courierFromWilaya: "" }), false)
  assert.equal(courierReady({ courier: "yalidine", courierKeys: '{"apiId":"a"}', courierFromWilaya: "16 - Alger" }), false)
  assert.equal(courierReady({ courier: "dhd", courierKeys: '{"token":"t"}', courierFromWilaya: "" }), true)
  assert.equal(courierReady({ courier: "sandbox", courierKeys: "", courierFromWilaya: "" }), true)
  assert.equal(courierReady({ courier: "nope", courierKeys: "not json", courierFromWilaya: "" }), false)
})
