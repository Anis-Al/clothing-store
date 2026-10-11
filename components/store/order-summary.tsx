"use client"
import Image from "next/image"
import { useSyncExternalStore } from "react"
import { useT } from "@/components/i18n-provider"
import { formatPrice } from "@/lib/dict"

type LastOrder = {
  ref: string
  total: number // items + fee
  fee?: number // delivery fee (absent in summaries written before it existed)
  items: { name: string; color: string; size: string; qty: number; price: number; image?: string }[]
}

const read = () => {
  try {
    return sessionStorage.getItem("atelier:last-order")
  } catch {
    return null
  }
}

// Summary comes from this tab's sessionStorage (written at checkout), never from the DB:
// /merci is public, so it must not be able to show someone else's order.
export function OrderSummary({ code }: { code: string }) {
  const { t, locale } = useT()
  const raw = useSyncExternalStore(() => () => {}, read, () => null)
  const order: LastOrder | null = raw ? JSON.parse(raw) : null
  if (!order || order.ref !== code) return null

  return (
    <section className="w-full border-t border-hairline pt-6">
      <h2 className="mb-4 text-xl font-medium">{t.confirm.summary}</h2>
      <ul className="flex flex-col gap-4">
        {order.items.map((i) => (
          <li key={`${i.name}-${i.color}-${i.size}`} className="flex items-center gap-4">
            <div className="relative size-16 shrink-0 bg-cloud">
              {i.image && <Image src={i.image} alt="" fill sizes="64px" className="object-cover" />}
            </div>
            <div className="flex-1">
              <p className="font-medium">{i.name}</p>
              <p className="text-sm text-mute">{i.color} · {i.size} · ×{i.qty}</p>
            </div>
            <p className="font-medium">{formatPrice(i.price * i.qty, locale)}</p>
          </li>
        ))}
      </ul>
      {!!order.fee && (
        <p className="mt-4 flex justify-between border-t border-hairline pt-4">
          <span>{t.cart.shipping}</span>
          <span>{formatPrice(order.fee, locale)}</span>
        </p>
      )}
      <p className="mt-4 flex justify-between border-t border-hairline pt-4 font-medium">
        <span>{t.cart.total}</span>
        <span>{formatPrice(order.total, locale)}</span>
      </p>
    </section>
  )
}
