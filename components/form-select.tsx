"use client"
import { useRef, useState } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type Item = { value: string; label: React.ReactNode }

// shadcn Select for plain <form>s: Base UI renders a hidden input named `name`, so server actions and
// FormData read it like a native <select>. `autoSubmit` submits the surrounding form on change;
// picking one of `confirm.values` asks `confirm.message` first, and "no" puts the old value back.
// `onChange` lets a client form follow the value (the cart's commune list follows its wilaya).
export function FormSelect({
  name, items, defaultValue, placeholder, required, disabled, autoSubmit, confirm, onChange, size, className, "aria-label": ariaLabel,
}: {
  name: string
  items: Item[]
  defaultValue?: string | null
  placeholder?: string
  required?: boolean
  disabled?: boolean
  autoSubmit?: boolean
  confirm?: { values: string[]; message: string }
  onChange?: (value: string) => void
  size?: "sm" | "default"
  className?: string
  "aria-label"?: string
}) {
  const input = useRef<HTMLInputElement>(null)
  const [resets, setResets] = useState(0)
  return (
    <Select
      // remount when the server sends a new default (e.g. after a status save) — Base UI warns otherwise
      key={`${defaultValue ?? ""}-${resets}`}
      name={name}
      items={items}
      required={required}
      disabled={disabled}
      defaultValue={defaultValue || null}
      inputRef={input}
      onValueChange={(v) => {
        onChange?.(v as string)
        if (!autoSubmit) return
        if (confirm?.values.includes(v as string) && !window.confirm(confirm.message)) return setResets((n) => n + 1)
        // wait one tick so the hidden input holds the new value before submitting
        setTimeout(() => input.current?.form?.requestSubmit())
      }}
    >
      <SelectTrigger size={size} className={className} aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {items.map((i) => (
          <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
