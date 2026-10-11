import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, Notice, SETTINGS_TABS, SettingsNav } from "@/components/admin/fields"
import { updateSettings } from "@/lib/actions/admin"
import { DICTS, getI18n, getSettings, type Dict } from "@/lib/i18n"

type TextKey = "taglineFr" | "taglineAr" | "heroTitleFr" | "heroTitleAr" | "shippingTextFr" | "shippingTextAr"

// One short form per tab; each posts only its own fields (updateSettings leaves the others alone).
export default async function Settings({ searchParams }: PageProps<"/admin/settings">) {
  const [{ t }, s, sp] = await Promise.all([getI18n(), getSettings(), searchParams])
  const tab = SETTINGS_TABS.find((k) => k === sp.tab) ?? "store"
  const area = "w-full rounded-lg border border-hairline p-4 outline-none focus:border-2 focus:border-ink"
  // One field per language, side by side. Empty = the built-in text, shown as the placeholder.
  const pair = (label: string, key: "tagline" | "heroTitle" | "shippingText", def: (d: Dict) => string, max: number, long = false) => (
    <div className="grid gap-4 md:grid-cols-2">
      {(["fr", "ar"] as const).map((l) => {
        const name: TextKey = `${key}${l === "fr" ? "Fr" : "Ar"}`
        const props = { name, maxLength: max, defaultValue: s[name], placeholder: def(DICTS[l]), lang: l, dir: l === "ar" ? "rtl" : "ltr" }
        return (
          <Field key={l} label={`${label} · ${l.toUpperCase()}`}>
            {long ? <textarea rows={3} className={area} {...props} /> : <Input {...props} />}
          </Field>
        )
      })}
    </div>
  )
  const hint = <p className="text-sm text-mute">{t.admin.settingsHint}</p>

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <SettingsNav t={t} active={tab} />
      <Notice t={t} sp={searchParams} />

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
            {hint}
          </>
        )}

        {tab === "home" && (
          <>
            {pair(t.admin.heroTitle, "heroTitle", (d) => d.home.heroTitle, 60)}
            {hint}
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
            <div className="max-w-xs">
              <Field label={t.admin.deliveryFee} hint={t.admin.deliveryFeeHint}>
                <Input name="deliveryFee" type="number" min={0} required dir="ltr" defaultValue={s.deliveryFee} />
              </Field>
            </div>
            {pair(t.admin.shippingText, "shippingText", (d) => d.product.shippingText, 500, true)}
            {hint}
          </>
        )}

        {tab === "stock" && (
          <div className="max-w-xs">
            <Field label={t.admin.lowStockLimit} hint={t.admin.lowStockHint}>
              <Input name="lowStock" type="number" min={0} required dir="ltr" defaultValue={s.lowStock} />
            </Field>
          </div>
        )}

        <Button type="submit" className="w-fit">{t.admin.save}</Button>
      </form>
    </div>
  )
}
