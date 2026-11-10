"use client"
// Tiny client helpers for otherwise server-rendered admin forms.
import { useActionState, useRef, useState } from "react"
import { X } from "lucide-react"
import { useT } from "@/components/i18n-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { importProducts } from "@/lib/actions/admin"
import { FormSelect } from "@/components/form-select"
import { communesOf, WILAYAS, wilayaValue } from "@/lib/wilayas"

// Order note: Enter submits natively (single field, no button); leaving the field with a change submits too,
// so a note typed and then clicked away from isn't lost.
export function NoteInput(props: React.ComponentProps<"input">) {
  return <input {...props} onBlur={(e) => { if (e.target.value !== e.target.defaultValue) e.target.form?.requestSubmit() }} />
}

export function ConfirmButton({ message, ...props }: React.ComponentProps<"button"> & { message: string }) {
  return <button {...props} onClick={(e) => { if (!confirm(message)) e.preventDefault() }} />
}

// Line-by-line errors don't fit a ?error= toast, hence useActionState.
// Native <dialog> opened by its trigger button: `children` is the (server) form; a successful action redirects and
// the page remounts, so the dialog needs no close logic of its own. Backdrop click and Escape close it.
export function Modal({ trigger, title, children, className }: { trigger: React.ReactNode; title: string; children: React.ReactNode; className?: string }) {
  const { t } = useT()
  const ref = useRef<HTMLDialogElement>(null)
  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className={className}>{trigger}</button>
      <dialog ref={ref} onClick={(e) => e.target === ref.current && ref.current.close()}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-hairline bg-canvas p-0 text-ink backdrop:bg-ink/40">
        <div className="flex flex-col gap-4 p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-medium">{title}</h2>
            <button type="button" onClick={() => ref.current?.close()} aria-label={t.admin.close} className="grid size-9 place-items-center rounded-full hover:bg-cloud">
              <X className="size-5" />
            </button>
          </div>
          {children}
        </div>
      </dialog>
    </>
  )
}

// Wilaya → commune selects (relay point modal, shop address): the commune list follows the wilaya (same data as the
// cart). Plain <label>s, not `Field`: components/admin/fields.tsx imports the server-only i18n module.
export function PlaceFields({ names = ["wilaya", "commune"], wilaya = "", commune = "", required }: {
  names?: [string, string]; wilaya?: string; commune?: string; required?: boolean
}) {
  const { t, locale } = useT()
  const [w, setW] = useState(wilaya)
  const communes = communesOf(w)
  const lbl = "flex flex-col gap-2 text-sm font-medium"
  return (
    <>
      <label className={lbl}>
        {t.cart.wilaya}
        <FormSelect name={names[0]} required={required} placeholder={t.cart.chooseWilaya} onChange={setW} defaultValue={wilaya}
          items={WILAYAS.map((x) => ({ value: wilayaValue(x), label: `${x[0]} - ${locale === "ar" ? x[2] : x[1]}` }))} />
      </label>
      <label className={lbl}>
        {t.cart.commune}
        {/* key: a new wilaya remounts it empty (the saved commune belongs to the saved wilaya only) */}
        <FormSelect key={w} name={names[1]} disabled={!communes.length} placeholder={t.cart.chooseCommune} defaultValue={w === wilaya ? commune : ""}
          items={communes.map(([fr, ar]) => ({ value: fr, label: locale === "ar" ? ar : fr }))} />
      </label>
    </>
  )
}

export function ImportForm() {
  const { t } = useT()
  const [state, action, pending] = useActionState(importProducts, undefined)
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t.admin.importFile}</span>
        <Input name="file" type="file" accept=".csv,text/csv" required className="pt-2" />
      </label>
      <Button type="submit" disabled={pending} className="w-fit">{pending ? t.cart.sending : t.admin.import}</Button>
      {state?.errors && (
        <div role="alert" className="flex flex-col gap-2 bg-cloud p-4 text-sm">
          <p className="font-medium text-sale">{t.admin.importNothing}</p>
          <ul className="flex list-disc flex-col gap-1 ps-5">{state.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}
      {state?.done && <p role="status" className="font-medium text-success">{state.done}</p>}
    </form>
  )
}
