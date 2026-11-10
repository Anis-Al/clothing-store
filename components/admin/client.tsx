"use client"
// Tiny client helpers for otherwise server-rendered admin forms.
import { createContext, useActionState, useContext, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Check, ChevronDown, Copy, MoreHorizontal, X } from "lucide-react"
import { cn } from "cn"
import { useT } from "@/components/i18n-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { importProducts } from "@/lib/actions/admin"
import { FormSelect } from "@/components/form-select"
import { communeLabel, communesOf, WILAYAS, wilayaValue } from "@/lib/wilayas"

// Order note: Enter submits natively (single field, no button); leaving the field with a change submits too,
// so a note typed and then clicked away from isn't lost.
export function NoteInput(props: React.ComponentProps<"input">) {
  return <input {...props} onBlur={(e) => { if (e.target.value !== e.target.defaultValue) e.target.form?.requestSubmit() }} />
}

// "⋯" menu: a native <details> whose panel holds server-rendered buttons (e.g. other status changes). Closes on a
// click outside it or on Escape; a submit inside redirects, which remounts the page anyway.
export function MoreMenu({ label, children, triggerClassName, trigger }: {
  label: string; children: React.ReactNode; triggerClassName?: string; trigger?: React.ReactNode
}) {
  const ref = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const close = (e: Event) => { const d = ref.current; if (d?.open && !d.contains(e.target as Node)) d.open = false }
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && ref.current?.open) ref.current.open = false }
    document.addEventListener("pointerdown", close)
    document.addEventListener("keydown", esc)
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", esc) }
  }, [])
  return (
    <details ref={ref} className="relative">
      {/* default: a round "⋯" button; `trigger` replaces its content (and its look comes from triggerClassName) */}
      <summary aria-label={trigger ? undefined : label} title={trigger ? undefined : label}
        className={cn("cursor-pointer list-none [&::-webkit-details-marker]:hidden",
          !trigger && "grid size-9 place-items-center rounded-full",
          triggerClassName ?? "border border-hairline hover:border-ink")}>
        {trigger ?? <MoreHorizontal className="size-4" />}
      </summary>
      {/* a link inside navigates softly (the DOM stays): close the menu on the click */}
      <div onClick={(e) => { if ((e.target as Element).closest("a") && ref.current) ref.current.open = false }}
        className="absolute end-0 top-full z-40 mt-1 flex min-w-52 flex-col rounded-[18px] bg-canvas p-1.5 text-ink ring-1 ring-hairline">{children}</div>
    </details>
  )
}

// Admin nav entry: marks the current section (aria-current + style). /admin itself only on the dashboard.
export function AdminNavLink({ href, className, activeClassName, children }: {
  href: string; className: string; activeClassName: string; children: React.ReactNode
}) {
  const path = usePathname()
  const on = href === "/admin" ? path === "/admin" : path === href || path.startsWith(`${href}/`)
  return <Link href={href} aria-current={on ? "page" : undefined} className={cn(className, on && activeClassName)}>{children}</Link>
}

// Order row (Commandes): the row itself is server-rendered; a click on its RowToggle (anywhere inside, through context)
// mounts the details panel under it. Desktop: a table row + a panel; phones: a card + the same panel.
const RowCtx = createContext<{ open: boolean; toggle: () => void } | null>(null)
export function OrderRow({ className, panel, children }: { className?: string; panel: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <RowCtx.Provider value={{ open, toggle: () => setOpen(!open) }}>
      <li className={className} data-open={open || undefined}>
        {children}
        {open && panel}
      </li>
    </RowCtx.Provider>
  )
}
export function RowToggle({ label, hideLabel, className }: { label: string; hideLabel: string; className?: string }) {
  const row = useContext(RowCtx)
  if (!row) return null
  return (
    <button type="button" onClick={row.toggle} aria-expanded={row.open} aria-label={row.open ? hideLabel : label} title={row.open ? hideLabel : label}
      className={cn("grid size-10 shrink-0 place-items-center rounded-full text-mute hover:bg-cloud hover:text-ink", className)}>
      <ChevronDown className={cn("size-4 transition-transform", row.open && "rotate-180")} />
    </button>
  )
}

// Copies a short text (a parcel number) to the clipboard; the icon turns into a check for a moment.
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false)
  return (
    <button type="button" aria-label={label} title={label}
      onClick={() => navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500) })}
      className="grid size-8 shrink-0 place-items-center rounded-full text-mute hover:bg-cloud hover:text-ink">
      {done ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
    </button>
  )
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
          items={communes.map(([fr, ar]) => ({ value: fr, label: locale === "ar" ? ar : communeLabel(fr) }))} />
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
