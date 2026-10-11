import { Footer } from "@/components/store/footer"
import { Header } from "@/components/store/header"

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 md:px-12">{children}</main>
      <Footer />
    </>
  )
}
