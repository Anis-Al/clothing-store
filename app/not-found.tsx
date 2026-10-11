import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import { Footer } from "@/components/store/footer"
import { Header } from "@/components/store/header"
import { getI18n } from "@/lib/i18n"

// Root boundary: unmatched URLs and every notFound() (e.g. a deleted product shared on WhatsApp).
// It renders under the root layout only, so it brings the store header/footer itself.
export default async function NotFound() {
  const { t } = await getI18n()
  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col items-start gap-6 px-4 py-16 md:px-12">
        <p className="font-display text-[96px] leading-none">404</p>
        <h1 className="text-2xl font-medium md:text-[32px]">{t.notFound.title}</h1>
        <p className="text-charcoal">{t.notFound.text}</p>
        <Link href="/products" className={buttonVariants()}>{t.cart.continue}</Link>
      </main>
      <Footer />
    </>
  )
}
