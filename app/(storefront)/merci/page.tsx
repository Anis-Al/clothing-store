import Link from "next/link"
import { CheckCircle2 } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { OrderSummary } from "@/components/store/order-summary"
import { getI18n } from "@/lib/i18n"

export async function generateMetadata() {
  return { title: (await getI18n()).t.confirm.title, robots: { index: false } }
}

// No DB lookup: guests have no session, so this page must not reveal order details (name, phone, address).
export default async function Merci({ searchParams }: PageProps<"/merci">) {
  const [{ t }, { ref }] = await Promise.all([getI18n(), searchParams])
  const code = typeof ref === "string" ? ref.replace(/[^A-Z0-9]/gi, "").slice(0, 12).toUpperCase() : ""
  return (
    <div className="mx-auto flex max-w-xl flex-col items-start gap-6 py-16">
      <CheckCircle2 className="size-12 text-success" />
      <h1 className="text-2xl font-medium md:text-[32px]">{t.confirm.thanks}</h1>
      {code && (
        <p className="text-lg">
          {t.confirm.ref} : <span dir="ltr" className="font-mono font-medium">#{code}</span>
        </p>
      )}
      <p className="text-charcoal">{t.confirm.call}</p>
      {code && <OrderSummary code={code} />}
      <Link href="/products" className={buttonVariants()}>{t.cart.continue}</Link>
    </div>
  )
}
