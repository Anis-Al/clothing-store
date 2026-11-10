import Image from "next/image"
import Link from "next/link"
import { Trash2, X } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "cn"
import { ConfirmButton, Modal, PlaceFields } from "@/components/admin/client"
import { Field, Help, Notice, Pager, SETTINGS_TABS, SettingsNav } from "@/components/admin/fields"
import { FormSelect } from "@/components/form-select"
import { createStopDesk, deleteStopDesk, loadCourierDefaults, updateSettings, updateWilayaFees } from "@/lib/actions/admin"
import { parseKeys } from "@/lib/courier"
import { COURIERS, courierOf } from "@/lib/couriers"
import { db } from "@/lib/db"
import { DICTS, fill, getI18n, getSettings, type Dict } from "@/lib/i18n"
import { DESK_PAGE, paginate } from "@/lib/utils"
import { WILAYAS, wilayaValue } from "@/lib/wilayas"

type TextKey = "taglineFr" | "taglineAr" | "heroTitleFr" | "heroTitleAr" | "shippingTextFr" | "shippingTextAr" | "storeHoursFr" | "storeHoursAr"
// credential field names as the couriers' dashboards print them (same in FR and AR)
const CRED_LABELS: Record<string, string> = { apiId: "API ID", apiToken: "API token", apiKey: "API key", apiSecret: "API secret", token: "Token", key: "Key", guid: "GUID", tenantId: "Tenant ID", publicKey: "Public key" }
const FEE_PAGE = 10 // tariff rows per page (the form posts and saves only the page shown)

// One short form per tab; each posts only its own fields (updateSettings leaves the others alone).
// Livraison is two columns from lg: left = the save form (methods, delivery text; in debug also the courier picker,
// a GET form whose ?courier= re-renders that courier's credential fields, then the credentials and origin wilaya);
// right = the tariff table (?fp=) and the relay points (?dp=), each its own form(s), paginated.
export default async function Settings({ searchParams }: PageProps<"/admin/settings">) {
  const [{ t, locale }, s, sp] = await Promise.all([getI18n(), getSettings(), searchParams])
  const tab = SETTINGS_TABS.find((k) => k === sp.tab) ?? "store"
  // ?debug=1 (Odoo-style developer mode): technical fields (courier, sandbox entry, relay point ids). Nav links and
  // the actions' redirects keep it. Gate a field with `debug && (...)`.
  const debug = sp.debug === "1"
  const pageOf = (k: string) => Math.max(1, Math.floor(Number(sp[k])) || 1)
  const fees = paginate(WILAYAS.length, pageOf("fp"), FEE_PAGE)
  const [desks, tariffs] = tab === "delivery"
    ? await Promise.all([db.stopDesk.findMany({ orderBy: [{ wilaya: "asc" }, { name: "asc" }] }), db.wilayaFee.findMany()])
    : [[], []]
  // ?w= filters the relay points by wilaya (a wilaya that has points), then the list is paginated
  const deskW = typeof sp.w === "string" && desks.some((d) => d.wilaya === sp.w) ? sp.w : ""
  const shown = deskW ? desks.filter((d) => d.wilaya === deskW) : desks
  const dp = paginate(shown.length, pageOf("dp"), DESK_PAGE)
  const editFees = sp.edit === "fees" // the tariff is read-only until "Modifier"; a save (or Annuler) drops the param
  const tariff = (wilaya: string) => tariffs.find((f) => f.wilaya === wilaya)
  // the Livraison URL with some params changed (page 1 and empty values stay out)
  const url = (patch: Record<string, string | number>) => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries({ tab: "delivery", debug: debug ? "1" : "", fp: fees.page, dp: dp.page, w: deskW, edit: editFees ? "fees" : "", ...patch }))
      if (v && v !== 1) p.set(k, String(v))
    return `/admin/settings?${p}`
  }
  const courier = courierOf(typeof sp.courier === "string" ? sp.courier : s.courier)
  const keys = courier?.[0] === s.courier ? parseKeys(s.courierKeys) : {}
  // platforms with several networks get a heading (Yalidine family, the Ecotrack tenants); singletons come first
  const platforms = COURIERS.reduce<Record<string, number>>((n, c) => ({ ...n, [c[2]]: (n[c[2]] ?? 0) + 1 }), {})
  // "none" (not ""): FormSelect reads "" as "nothing picked" and would show an empty trigger
  // the sandbox courier is a debug entry (kept while it is the shown one, so the trigger never goes blank)
  const courierItems = [
    { value: "none", label: t.admin.courierNone },
    ...[...COURIERS].filter((c) => c[2] !== "sandbox" || debug || c[0] === courier?.[0]).sort((a, b) => (platforms[a[2]] > 1 ? 1 : 0) - (platforms[b[2]] > 1 ? 1 : 0) || a[2].localeCompare(b[2]))
      .map((c) => ({ value: c[0], label: c[1], group: platforms[c[2]] > 1 ? c[2].toUpperCase() : undefined })),
  ]
  const area = "w-full rounded-lg border border-hairline p-4 outline-none focus:border-2 focus:border-ink"
  const wItems = WILAYAS.map((w) => ({ value: wilayaValue(w), label: `${w[0]} - ${locale === "ar" ? w[2] : w[1]}` }))
  const wLabel = (v: string) => wItems.find((i) => i.value === v)?.label ?? v
  // "Blida · Boufarik · 64 Rue Si Ben Youcef": wilaya name (no code), the commune only when it differs, the address
  // without its trailing ", <commune>, <wilaya>" segments (Yalidine's agencies repeat the town up to three times)
  const deskLine = (d: { wilaya: string; commune: string; address: string }) => {
    const w = wLabel(d.wilaya).replace(/^\d+ - /, "")
    const same = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" }) === 0
    const parts = d.address.split(",").map((x) => x.trim())
    while (parts.length > 1 && (same(parts.at(-1)!, w) || same(parts.at(-1)!, d.commune))) parts.pop()
    return [w, d.commune && !same(d.commune, w) ? d.commune : "", parts.join(", ")].filter(Boolean).join(" · ")
  }
  // One field per language, side by side. Empty = the built-in text, shown as the placeholder (said once, as a help icon).
  // hint: text = that hint + "empty = default"; undefined = "empty = default" alone; null = no icon
  const pair = (label: string, key: "tagline" | "heroTitle" | "shippingText" | "storeHours", def: (d: Dict) => string, max: number, hint?: string | null, long = false) => (
    <div className={cn("grid gap-4", !long && "md:grid-cols-2")}>
      {(["fr", "ar"] as const).map((l, i) => {
        const name: TextKey = `${key}${l === "fr" ? "Fr" : "Ar"}`
        const props = { name, maxLength: max, defaultValue: s[name], placeholder: def(DICTS[l]), lang: l, dir: l === "ar" ? "rtl" : "ltr" }
        return (
          <Field key={l} label={`${label} · ${l.toUpperCase()}`} hint={i === 0 && hint !== null ? [hint, t.admin.settingsHint].filter(Boolean).join(" ") : undefined}>
            {long ? <textarea rows={3} className={area} {...props} /> : <Input {...props} />}
          </Field>
        )
      })}
    </div>
  )
  const h2 = "text-lg font-medium"

  return (
    <div className={cn("flex flex-col gap-6", tab !== "delivery" && "max-w-4xl")}>
      <SettingsNav t={t} active={tab} debug={debug} />
      <Notice t={t} sp={searchParams} />

      {/* Livraison: form (16rem) | tariff | points sharing the rest of the width from xl; at lg the points wrap under the
          form; phones stack all three */}
      <div className={cn(tab === "delivery" && "grid grid-cols-1 gap-8 lg:grid-cols-2 xl:grid-cols-[16rem_minmax(0,1fr)_minmax(0,1fr)]")}>
        <div className="flex flex-col gap-6">
          {/* the courier (picker, credentials, origin wilaya, Yalidine defaults) is a debug-only block: set once at launch */}
          {tab === "delivery" && debug && (
            <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
              <form action="/admin/settings" className="w-full max-w-sm">
                <input type="hidden" name="tab" value="delivery" />
                <input type="hidden" name="debug" value="1" />
                <Field label={t.admin.sCourier} hint={t.admin.courierHint}>
                  <FormSelect name="courier" autoSubmit defaultValue={courier?.[0] ?? "none"} items={courierItems} />
                </Field>
              </form>
              {/* the saved courier is Yalidine (or a sister network): its tariff + agencies can be loaded; other couriers type theirs */}
              {courier && courier[0] === s.courier && courier[2] === "yalidine" && (
                <form action={loadCourierDefaults} className="flex items-center gap-2 pb-0.5">
                  <ConfirmButton message={fill(t.admin.confirmLoadDefaults, { courier: courier[1] })} className={buttonVariants({ variant: "secondary" })}>
                    {fill(t.admin.loadDefaults, { courier: courier[1] })}
                  </ConfirmButton>
                  <Help text={t.admin.loadDefaultsHint} />
                </form>
              )}
            </div>
          )}

          <form action={updateSettings.bind(null, tab)} className="flex flex-col gap-6">
            {tab === "store" && (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label={t.admin.storeName}>
                    <Input name="storeName" maxLength={40} defaultValue={s.storeName} placeholder={DICTS.fr.store.name} />
                  </Field>
                  <Field label={t.admin.whatsapp} hint={t.admin.whatsappHint}>
                    <Input name="whatsapp" inputMode="numeric" dir="ltr" maxLength={20} defaultValue={s.whatsapp} placeholder="213555123456" />
                  </Field>
                </div>
                {pair(t.admin.tagline, "tagline", (d) => d.store.tagline, 120)}
                {/* shop address = wilaya › commune › street; shown to a customer picking up (cart, /merci) */}
                <div className="grid gap-4 md:grid-cols-2">
                  <PlaceFields names={["storeWilaya", "storeCommune"]} wilaya={s.storeWilaya} commune={s.storeCommune} />
                </div>
                <Field label={t.admin.storeAddress} hint={t.admin.storeAddressHint}>
                  <Input name="storeAddress" maxLength={200} defaultValue={s.storeAddress} />
                </Field>
                {/* its own field (was mixed into the address): shown under the address on the home page and at pickup */}
                {pair(t.admin.storeHours, "storeHours", (d) => d.admin.storeHoursPlaceholder, 120, null)}
                <div className="max-w-sm">
                  <Field label={t.admin.storeCoords} hint={t.admin.storeCoordsHint}>
                    <Input name="storeCoords" dir="ltr" maxLength={60} placeholder="36.7538, 3.0588"
                      defaultValue={s.storeLat != null && s.storeLng != null ? `${s.storeLat}, ${s.storeLng}` : ""} />
                  </Field>
                </div>
                {/* debug only; not posted otherwise, so the saved threshold stays */}
                {debug && (
                  <div className="max-w-xs">
                    <Field label={t.admin.lowStockLimit} hint={t.admin.lowStockHint}>
                      <Input name="lowStock" type="number" min={0} required dir="ltr" defaultValue={s.lowStock} />
                    </Field>
                  </div>
                )}
              </>
            )}

            {tab === "home" && (
              <>
                {pair(t.admin.heroTitle, "heroTitle", (d) => d.home.heroTitle, 60)}
                <div className="flex flex-wrap items-start gap-4">
                  {s.heroImage && (
                    <div className="flex flex-col gap-2">
                      <div className="relative aspect-video w-60 bg-cloud">
                        <Image src={s.heroImage} alt="" fill sizes="240px" className="object-cover" />
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="removeHero" className="size-4 accent-ink" />
                        {t.admin.removeImage}
                      </label>
                    </div>
                  )}
                  <div className="min-w-60 flex-1">
                    <Field label={t.admin.heroImage} hint={t.admin.heroImageHint}>
                      <Input name="heroImage" type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" className="pt-2" />
                    </Field>
                  </div>
                </div>
              </>
            )}

            {tab === "delivery" && (
              <>
                {/* the courier shown by the picker above; "" = none (feature off). Not posted outside debug: the saved one stays. */}
                {debug && <input type="hidden" name="courier" value={courier?.[0] ?? ""} />}
                {debug && courier && (
                  // one field per line: the column is 16rem from xl, two per line would be ~7rem each
                  <div className="grid grid-cols-1 gap-4">
                    {courier[3].map((k, i) => (
                      <Field key={k} label={CRED_LABELS[k] ?? k} hint={i === 0 ? t.admin.courierKeysHint : undefined}>
                        <Input name={`cred_${k}`} type="password" dir="ltr" maxLength={200} autoComplete="new-password"
                          placeholder={keys[k] ? "••••••••••••" : ""} />
                      </Field>
                    ))}
                    <Field label={t.admin.courierFromWilaya} hint={t.admin.courierFromWilayaHint}>
                      <FormSelect name="courierFromWilaya" placeholder={t.cart.chooseWilaya} defaultValue={s.courierFromWilaya} items={wItems}
                        required={courier[2] === "yalidine"} />
                    </Field>
                    {/* sent with every parcel (lib/courier.ts parcelFor); checkboxes need their hidden "" twin */}
                    <div className="flex flex-col gap-3">
                      <p className="text-sm font-medium">{t.admin.parcelOptions}</p>
                      {(["parcelOpenable", "parcelInsured"] as const).map((k) => (
                        <label key={k} className="flex items-start gap-3 text-sm">
                          <input type="hidden" name={k} value="" />
                          <input type="checkbox" name={k} value="on" defaultChecked={s[k]} className="mt-0.5 size-5 shrink-0 accent-ink" />
                          {t.admin[k]}
                        </label>
                      ))}
                      <Field label={t.admin.parcelWeight} hint={t.admin.parcelWeightHint}>
                        <Input name="parcelWeightKg" type="number" min={0} max={30} step={0.1} dir="ltr" defaultValue={s.parcelWeightKg} className="w-28" />
                      </Field>
                    </div>
                  </div>
                )}
                {/* checkboxes: the hidden "" twin keeps the key in the FormData when unchecked (updateSettings filters on `has`) */}
                <div className={cn("flex flex-col gap-3", debug && "border-t border-hairline pt-6")}>
                  <h2 className={h2}>{t.cart.method}</h2>
                  <label className="flex items-center gap-3 text-sm font-medium">
                    <input type="hidden" name="homeEnabled" value="" />
                    <input type="checkbox" name="homeEnabled" value="on" defaultChecked={s.homeEnabled} className="size-5 accent-ink" />
                    {t.admin.homeEnabled}
                  </label>
                  <label className="flex items-center gap-3 text-sm font-medium">
                    <input type="hidden" name="pickupEnabled" value="" />
                    <input type="checkbox" name="pickupEnabled" value="on" defaultChecked={s.pickupEnabled} className="size-5 accent-ink" />
                    {t.admin.pickupEnabled}
                  </label>
                  <label className="flex items-center gap-3 text-sm font-medium">
                    <input type="hidden" name="stopdeskEnabled" value="" />
                    <input type="checkbox" name="stopdeskEnabled" value="on" defaultChecked={s.stopdeskEnabled} className="size-5 accent-ink" />
                    {t.admin.stopdeskEnabled}
                  </label>
                </div>
                {/* the "Livraison et retours" text is set once at launch: debug only (empty = built-in default) */}
                {debug && pair(t.admin.shippingText, "shippingText", (d) => d.product.shippingText, 500, null, true)}
              </>
            )}

            <Button type="submit" className="w-fit">{t.admin.save}</Button>
          </form>
        </div>

        {tab === "delivery" && (
          <>
            {/* delivery fee per wilaya and method: a page of rows at a time; the action saves the rows it receives */}
            <form action={updateWilayaFees} className="flex flex-col gap-3 border-t border-hairline pt-8 lg:border-t-0 lg:border-s lg:ps-8 lg:pt-0">
              <input type="hidden" name="fp" value={fees.page} />
              <div className="flex items-center justify-between gap-4">
                <h2 className={h2}>{t.admin.wilayaFees}</h2>
                {!editFees && <Link href={url({ edit: "fees" })} className={buttonVariants({ variant: "secondary", size: "sm" })}>{t.admin.edit}</Link>}
              </div>
              <div className="flex gap-2 border-b border-hairline pb-1 text-xs text-mute">
                <span className="flex-1">{t.cart.wilaya}</span>
                <span className="w-20">{t.admin.feeHome}</span>
                <span className="w-20">{t.admin.feeDesk}</span>
              </div>
              {WILAYAS.slice(fees.skip, fees.skip + fees.take).map((w) => (
                <div key={w[0]} className="flex items-center gap-2 border-b border-hairline pb-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{w[0]} - {locale === "ar" ? w[2] : w[1]}</span>
                  {(["home", "desk"] as const).map((k) => editFees ? (
                    <Input key={k} name={`${k}_${w[0]}`} type="number" min={0} required dir="ltr" aria-label={k === "home" ? t.admin.feeHome : t.admin.feeDesk}
                      className="h-8 w-20 px-2" defaultValue={tariff(wilayaValue(w))?.[k] ?? 0} />
                  ) : (
                    <span key={k} dir="ltr" className="w-20 px-2 text-sm tabular-nums leading-8">{tariff(wilayaValue(w))?.[k] ?? 0}</span>
                  ))}
                </div>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-3">
                {editFees ? (
                  <div className="flex items-center gap-2">
                    <Button type="submit" size="sm">{t.admin.save}</Button>
                    <Link href={url({ edit: "" })} className={buttonVariants({ variant: "ghost", size: "sm" })}>{t.admin.cancel}</Link>
                  </div>
                ) : <span />}
                <Pager t={t} page={fees.page} pages={fees.pages} href={(n) => url({ fp: n })} />
              </div>
            </form>

            <section className="flex flex-col gap-3 border-t border-hairline pt-8 lg:border-t-0 lg:pt-0 xl:border-s xl:ps-8">
              <div className="flex items-center justify-between gap-4">
                <h2 className={h2}>{t.admin.sDesks} <span className="text-sm font-normal text-mute tabular-nums">{shown.length}</span></h2>
                {/* the add form lives in a modal (the list stays short); its redirect lands on the new point's page */}
                <Modal trigger={t.admin.add} title={t.admin.newDesk} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                  <form action={createStopDesk} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <PlaceFields required />
                    <Field label={t.admin.deskName}>
                      <Input name="name" required maxLength={60} placeholder="Yalidine Alger Centre" />
                    </Field>
                    <Field label={t.admin.deskAddress}>
                      <Input name="address" maxLength={200} />
                    </Field>
                    {debug && (
                      <Field label={t.admin.deskId} hint={t.admin.deskIdHint}>
                        <Input name="deskId" maxLength={40} dir="ltr" />
                      </Field>
                    )}
                    <Button type="submit" className="w-fit sm:col-span-2">{t.admin.add}</Button>
                  </form>
                </Modal>
              </div>
              {desks.length > 0 && (
                <form action="/admin/settings" className="flex items-center gap-2">
                  {Object.entries({ tab: "delivery", debug: debug ? "1" : "", fp: fees.page > 1 ? fees.page : "", edit: editFees ? "fees" : "" })
                    .filter(([, v]) => v).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
                  <FormSelect name="w" autoSubmit size="sm" placeholder={t.cart.chooseWilaya} defaultValue={deskW} className="flex-1"
                    items={[...new Set(desks.map((d) => d.wilaya))].map((v) => ({ value: v, label: wLabel(v) }))} />
                  {deskW && (
                    <Link href={url({ w: "", dp: 1 })} aria-label={t.admin.cancel} className="grid size-9 shrink-0 place-items-center rounded-full text-mute hover:bg-cloud hover:text-ink">
                      <X className="size-4" />
                    </Link>
                  )}
                </form>
              )}
              {shown.length ? (
                <ul className="border-t border-hairline">
                  {shown.slice(dp.skip, dp.skip + dp.take).map((d) => (
                    <li key={d.id} className="flex items-center gap-3 border-b border-hairline py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {d.name}
                          {debug && d.deskId && <span className="ms-2 font-mono text-xs font-normal text-mute" dir="ltr">#{d.deskId}</span>}
                        </p>
                        <p className="truncate text-xs text-mute">{deskLine(d)}</p>
                      </div>
                      {/* orders keep the point's name and address as text, so deleting one never touches them */}
                      <form action={deleteStopDesk.bind(null, d.id, dp.page)}>
                        <ConfirmButton message={t.admin.confirmDelete} aria-label={t.admin.delete}
                          className="grid size-9 place-items-center rounded-full text-mute hover:bg-cloud hover:text-sale">
                          <Trash2 className="size-4" />
                        </ConfirmButton>
                      </form>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-mute">{t.admin.none}</p>
              )}
              <Pager t={t} page={dp.page} pages={dp.pages} href={(n) => url({ dp: n })} />
            </section>
          </>
        )}
      </div>
    </div>
  )
}
