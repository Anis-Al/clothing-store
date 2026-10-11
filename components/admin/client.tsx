"use client"
// Tiny client helpers for otherwise server-rendered admin forms.

export function ConfirmButton({ message, ...props }: React.ComponentProps<"button"> & { message: string }) {
  return <button {...props} onClick={(e) => { if (!confirm(message)) e.preventDefault() }} />
}
