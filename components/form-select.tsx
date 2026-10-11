"use client"
import { useRef } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type Item = { value: string; label: React.ReactNode }

// shadcn Select for plain <form>s: Base UI renders a hidden input named `name`, so server actions and
// FormData read it like a native <select>. `autoSubmit` submits the surrounding form on change.
export function FormSelect({
  name, items, defaultValue, placeholder, required, autoSubmit, size, className, "aria-label": ariaLabel,
}: {
  name: string
  items: Item[]
  defaultValue?: string | null
  placeholder?: string
  required?: boolean
  autoSubmit?: boolean
  size?: "sm" | "default"
  className?: string
  "aria-label"?: string
}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <Select
      // remount when the server sends a new default (e.g. after a status save) — Base UI warns otherwise
      key={defaultValue ?? ""}
      name={name}
      items={items}
      required={required}
      defaultValue={defaultValue || null}
      inputRef={input}
      // wait one tick so the hidden input holds the new value before submitting
      onValueChange={autoSubmit ? () => setTimeout(() => input.current?.form?.requestSubmit()) : undefined}
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
