import Image from "next/image"
import { ChevronDown, Trash2 } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ConfirmButton } from "@/components/admin/client"
import { Field, Help, Notice, SETTINGS_TABS, SettingsNav } from "@/components/admin/fields"
import { FormSelect } from "@/components/form-select"
import { createStopDesk, deleteStopDesk, loadCourierDefaults, updateSettings, updateWilayaFees } from "@/lib/actions/admin"
import { parseKeys } from "@/lib/courier"
import { COURIERS, courierOf } from "@/lib/couriers"
import { db } from "@/lib/db"
import { DICTS, fill, getI18n, getSettings, type Dict } from "@/lib/i18n"
import { WILAYAS, wilayaValue } from "@/lib/wilayas"

type TextKey = "taglineFr" | "taglineAr" | "heroTitleFr" | "heroTitleAr" | "shippingTextFr" | "shippingTextAr"
// credential field names as the couriers' dashboards print them (same in FR and AR)
const CRED_LABELS: Record<string, string> = { apiId: "API ID", apiToken: "API token", apiKey: "API key", apiSecret: "API secret", token: "Token", key: "Key", guid: "GUID", tenantId: "Tenant ID", publicKey: "Public key" }

// One short form per tab; each posts only its own fields (updateSettings leaves the others alone).
// Transporteur = courier picker (a GET form: ?courier= re-renders the credential fields of that courier) + the
// save form (courier, its credentials, origin wilaya), then the relay points (their own add / delete forms).
export default async function Settings({ searchParams }: PageProps<"/admin/settings">) {
  const [{ t, locale }, s, sp] = await Promise.all([getI18n(), getSettings(), searchParams])
  const tab = SETTINGS_TABS.find((k) => k === sp.tab) ?? "store"
  const desks = tab === "courier" ? await db.stopDesk.findMany({ orderBy: [{ wilaya: "asc" }, { name: "asc" }] }) : []
  const tariffs = tab === "delivery" ? await db.wilayaFee.findMany() : []
  const tariff = (wilaya: string) => tariffs.find((f) => f.wilaya === wilaya)
  const courier = courierOf(typeof sp.courier === "string" ? sp.courier : s.courier)
  const keys = courier?.[0] === s.courier ? parseKeys(s.courierKeys) : {}
  // platforms with several networks get a heading (Yalidine family, the Ecotrack tenants); singletons come first
  const platforms = COURIERS.reduce<Record<string, number>>((n, c) => ({ ...n, [c[2]]: (n[c[2]] ?? 0) + 1 }), {})
  // "none" (not ""): FormSelect reads "" as "nothing picked" and would show an empty trigger
  const courierItems = [
    { value: "none", label: t.admin.courierNone },
    ...[...COURIERS].sort((a, b) => (platforms[a[2]] > 1 ? 1 : 0) - (platforms[b[2]] > 1 ? 1 : 0) || a[2].localeCompare(b[2]))
      .map((c) => ({ value: c[0], label: c[1], group: platforms[c[2]] > 1 ? c[2].toUpperCase() : undefined })),
  ]
  const area = "w-full rounded-lg border border-hairline p-4 outline-none focus:border-2 focus:border-ink"
  const wItems = WILAYAS.map((w) => ({ value: wilayaValue(w), label: `${w[0]} - ${locale === "ar" ? w[2] : w[1]}` }))
  const wLabel = (v: string) => wItems.find((i) => i.value === v)?.label ?? v
  // One field per language, side by side. Empty = the built-in text, shown as the placeholder (said once, as a help icon).
  const pair = (label: string, key: "tagline" | "heroTitle" | "shippingText", def: (d: Dict) => string, max: number, hint?: string, long = false) => (
    <div className="grid gap-4 md:grid-cols-2">
      {(["fr", "ar"] as const).map((l, i) => {
        const name: TextKey = `${key}${l === "fr" ? "Fr" : "Ar"}`
        const props = { name, maxLength: max, defaultValue: s[name], placeholder: def(DICTS[l]), lang: l, dir: l === "ar" ? "rtl" : "ltr" }
        return (
          <Field key={l} label={`${label} · ${l.toUpperCase()}`} hint={i === 0 ? [hint, t.admin.settingsHint].filter(Boolean).join(" ") : undefined}>
            {long ? <textarea rows={3} className={area} {...props} /> : <Input {...props} />}
          </Field>
        )
      })}
    </div>
  )

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <SettingsNav t={t} active={tab} />
      <Notice t={t} sp={searchParams} />

      {tab === "courier" && (
        <form action="/admin/settings" className="max-w-sm">
          <input type="hidden" name="tab" value="courier" />
          <Field label={t.admin.sCourier} hint={t.admin.courierHint}>
            <FormSelect name="courier" autoSubmit defaultValue={courier?.[0] ?? "none"} items={courierItems} />
          </Field>
        </form>
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
            <Field label={t.admin.storeAddress} hint={t.admin.storeAddressHint}>
              <textarea name="storeAddress" rows={2} maxLength={200} className={area} defaultValue={s.storeAddress} />
            </Field>
            <div className="max-w-xs">
              <Field label={t.admin.lowStockLimit} hint={t.admin.lowStockHint}>
                <Input name="lowStock" type="number" min={0} required dir="ltr" defaultValue={s.lowStock} />
              </Field>
            </div>
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
            {/* checkboxes: the hidden "" twin keeps the key in the FormData when unchecked (updateSettings filters on `has`) */}
            <label className="flex items-center gap-3 text-sm font-medium">
              <input type="hidden" name="pickupEnabled" value="" />
              <input type="checkbox" name="pickupEnabled" value="on" defaultChecked={s.pickupEnabled} className="size-5 accent-ink" />
              {t.admin.pickupEnabled}
              <Help text={t.admin.pickupEnabledHint} />
            </label>
            <label className="flex items-center gap-3 text-sm font-medium">
              <input type="hidden" name="stopdeskEnabled" value="" />
              <input type="checkbox" name="stopdeskEnabled" value="on" defaultChecked={s.stopdeskEnabled} className="size-5 accent-ink" />
              {t.admin.stopdeskEnabled}
              <Help text={t.admin.stopdeskEnabledHint} />
            </label>
            {pair(t.admin.shippingText, "shippingText", (d) => d.product.shippingText, 500, t.admin.shippingTextHint, true)}
          </>
        )}

        {tab === "courier" && (
          <>
            {/* the courier shown by the picker above; "" = none (feature off) */}
            <input type="hidden" name="courier" value={courier?.[0] ?? ""} />
            {courier && !!courier[3].length && (
              <div className="grid gap-4 md:grid-cols-2">
                {courier[3].map((k, i) => (
                  <Field key={k} label={CRED_LABELS[k] ?? k} hint={i === 0 ? t.admin.courierKeysHint : undefined}>
                    <Input name={`cred_${k}`} type="password" dir="ltr" maxLength={200} autoComplete="new-password"
                      placeholder={keys[k] ? "••••••••••••" : ""} />
                  </Field>
                ))}
              </div>
            )}
            {courier && (
              <div className="max-w-xs">
                <Field label={t.admin.courierFromWilaya} hint={t.admin.courierFromWilayaHint}>
                  <FormSelect name="courierFromWilaya" placeholder={t.cart.chooseWilaya} defaultValue={s.courierFromWilaya} items={wItems}
                    required={courier[2] === "yalidine"} />
                </Field>
              </div>
            )}
          </>
        )}

        <Button type="submit" className="w-fit">{t.admin.save}</Button>
      </form>

      {/* delivery fee per wilaya and method: its own form (58 rows), seeded with the courier's tariff */}
      {tab === "delivery" && (
        <form action={updateWilayaFees} className="flex flex-col gap-4 border-t border-hairline pt-6">
          <h2 className="flex items-center gap-1.5 text-lg font-medium">{t.admin.wilayaFees}<Help text={t.admin.wilayaFeesHint} /></h2>
          <Table stack>
            <TableHeader>
              <TableRow>
                <TableHead>{t.cart.wilaya}</TableHead>
                <TableHead>{t.admin.feeHome}</TableHead>
                <TableHead>{t.admin.feeDesk}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {WILAYAS.map((w) => (
                <TableRow key={w[0]}>
                  <TableCell className="font-medium max-md:basis-full">{w[0]} - {locale === "ar" ? w[2] : w[1]}</TableCell>
                  <TableCell data-label={t.admin.feeHome}>
                    <Input name={`home_${w[0]}`} type="number" min={0} required dir="ltr" className="h-9 w-28" defaultValue={tariff(wilayaValue(w))?.home ?? 0} />
                  </TableCell>
                  <TableCell data-label={t.admin.feeDesk}>
                    <Input name={`desk_${w[0]}`} type="number" min={0} required dir="ltr" className="h-9 w-28" defaultValue={tariff(wilayaValue(w))?.desk ?? 0} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Button type="submit" className="w-fit">{t.admin.save}</Button>
        </form>
      )}

      {/* the saved courier is Yalidine (or a sister network): its tariff + agencies can be loaded; other couriers type theirs */}
      {tab === "courier" && courier && courier[0] === s.courier && courier[2] === "yalidine" && (
        <form action={loadCourierDefaults} className="flex flex-wrap items-center gap-3 border-t border-hairline pt-6">
          <ConfirmButton message={fill(t.admin.confirmLoadDefaults, { courier: courier[1] })} className={buttonVariants({ variant: "secondary" })}>
            {fill(t.admin.loadDefaults, { courier: courier[1] })}
          </ConfirmButton>
          <Help text={t.admin.loadDefaultsHint} />
        </form>
      )}

      {tab === "courier" && (
        <section className="flex flex-col gap-4 border-t border-hairline pt-6">
          <h2 className="text-lg font-medium">{t.admin.sDesks}</h2>
          <form action={createStopDesk} className="flex flex-wrap items-end gap-2">
            <Field label={t.cart.wilaya}>
              <FormSelect name="wilaya" required placeholder={t.cart.chooseWilaya} items={wItems} className="w-56" />
            </Field>
            <Field label={t.admin.deskName}>
              <Input name="name" required maxLength={60} placeholder="Yalidine Alger Centre" className="w-56" />
            </Field>
            <Field label={t.admin.deskCommune} hint={t.admin.deskCommuneHint}>
              <Input name="commune" maxLength={60} placeholder="Alger Centre" className="w-44" />
            </Field>
            <Field label={t.admin.deskAddress}>
              <Input name="address" maxLength={200} className="w-72" />
            </Field>
            <Field label={t.admin.deskId} hint={t.admin.deskIdHint}>
              <Input name="deskId" maxLength={40} dir="ltr" className="w-28" />
            </Field>
            <Button type="submit" variant="secondary">{t.admin.add}</Button>
          </form>
          {/* 200+ points: one fold per wilaya (name, count), all folded; the fee is the wilaya's (Livraison tab) */}
          {desks.length ? (
            <div className="border-t border-hairline">
              {[...new Set(desks.map((d) => d.wilaya))].map((w) => (
                <details key={w} className="group border-b border-hairline">
                  <summary className="flex cursor-pointer list-none items-center gap-4 py-3 [&::-webkit-details-marker]:hidden">
                    <span className="flex-1 font-medium">{wLabel(w)}</span>
                    <span className="text-sm text-mute tabular-nums">{desks.filter((d) => d.wilaya === w).length}</span>
                    <ChevronDown className="size-5 shrink-0 transition-transform group-open:rotate-180" />
                  </summary>
                  <Table stack className="mb-3">
                    <TableBody>
                      {desks.filter((d) => d.wilaya === w).map((d) => (
                        <TableRow key={d.id}>
                          <TableCell className="font-medium">
                            {d.name}
                            {d.deskId && <span className="ms-2 font-mono text-xs font-normal text-mute" dir="ltr">#{d.deskId}</span>}
                          </TableCell>
                          <TableCell className="whitespace-normal text-mute max-md:basis-full">{d.commune && `${d.commune} · `}{d.address}</TableCell>
                          <TableCell className="max-md:ms-auto">
                            {/* orders keep the point's name and address as text, so deleting one never touches them */}
                            <form action={deleteStopDesk.bind(null, d.id)}>
                              <ConfirmButton message={t.admin.confirmDelete} aria-label={t.admin.delete}
                                className="grid size-10 place-items-center rounded-full text-mute hover:bg-cloud hover:text-sale">
                                <Trash2 className="size-5" />
                              </ConfirmButton>
                            </form>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </details>
              ))}
            </div>
          ) : (
            <p className="text-sm text-mute">{t.admin.none}</p>
          )}
        </section>
      )}
    </div>
  )
}
