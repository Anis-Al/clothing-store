"use client"
import { useSyncExternalStore } from "react"
import { create } from "zustand"
import { persist } from "zustand/middleware"

export type CartItem = {
  variantId: string
  slug: string
  name: string
  color: string
  size: string
  price: number
  image?: string
  stock: number
  qty: number
}

type Cart = {
  items: CartItem[]
  add: (item: Omit<CartItem, "qty">) => void
  setQty: (variantId: string, qty: number) => void
  remove: (variantId: string) => void
  clear: () => void
}

export const useCart = create<Cart>()(
  persist(
    (set) => ({
      items: [],
      add: (item) =>
        set((s) => {
          const hit = s.items.find((i) => i.variantId === item.variantId)
          return {
            items: hit
              ? s.items.map((i) => (i === hit ? { ...i, ...item, qty: Math.min(i.qty + 1, item.stock) } : i))
              : [...s.items, { ...item, qty: 1 }],
          }
        }),
      setQty: (variantId, qty) =>
        set((s) => ({
          items: s.items.map((i) => (i.variantId === variantId ? { ...i, qty: Math.max(1, Math.min(qty, i.stock)) } : i)),
        })),
      remove: (variantId) => set((s) => ({ items: s.items.filter((i) => i.variantId !== variantId) })),
      clear: () => set({ items: [] }),
    }),
    {
      // Namespaced: localStorage is per origin, and other local projects on localhost:3000 also use "cart".
      name: "atelier:cart",
      version: 1,
      // Unknown/older shape → start with an empty cart instead of erroring.
      migrate: () => ({ items: [] }) as unknown as Cart,
    },
  ),
)

// false during SSR and the hydration pass, true once localStorage has been read — avoids mismatches.
export const useCartReady = () =>
  useSyncExternalStore(
    (cb) => useCart.persist?.onFinishHydration(cb) ?? (() => {}), // persist is absent on the server
    () => useCart.persist?.hasHydrated() ?? false,
    () => false,
  )
