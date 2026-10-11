"use client"
import { useCart, useCartReady } from "@/lib/cart"

export function CartCount() {
  const count = useCart((s) => s.items.reduce((n, i) => n + i.qty, 0))
  const mounted = useCartReady()
  if (!mounted || !count) return null
  return (
    <span className="absolute -end-0.5 -top-0.5 grid size-5 place-items-center rounded-full bg-ink text-[11px] font-medium text-canvas">
      {count}
    </span>
  )
}
