"use client"
// Tiny client helpers for otherwise server-rendered admin forms.
import { useActionState } from "react"
import { useT } from "@/components/i18n-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { importProducts } from "@/lib/actions/admin"

// Order note: Enter submits natively (single field, no button); leaving the field with a change submits too,
// so a note typed and then clicked away from isn't lost.
export function NoteInput(props: React.ComponentProps<"input">) {
  return <input {...props} onBlur={(e) => { if (e.target.value !== e.target.defaultValue) e.target.form?.requestSubmit() }} />
}

export function ConfirmButton({ message, ...props }: React.ComponentProps<"button"> & { message: string }) {
  return <button {...props} onClick={(e) => { if (!confirm(message)) e.preventDefault() }} />
}

// Line-by-line errors don't fit a ?error= toast, hence useActionState.
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
