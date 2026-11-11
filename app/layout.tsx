import type { Metadata } from "next"
import { Bebas_Neue, Inter, Noto_Kufi_Arabic, Noto_Sans_Arabic } from "next/font/google"
import { I18nProvider } from "@/components/i18n-provider"
import { getI18n, getSettings } from "@/lib/i18n"
import { ogImage, siteUrl } from "@/lib/site"
import "./globals.css"

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] })
const bebas = Bebas_Neue({ variable: "--font-bebas", subsets: ["latin"], weight: "400" })
const arabic = Noto_Sans_Arabic({ variable: "--font-arabic", subsets: ["arabic"] })
const arabicDisplay = Noto_Kufi_Arabic({ variable: "--font-arabic-display", subsets: ["arabic"], weight: "700" })

export async function generateMetadata(): Promise<Metadata> {
  const [{ t, locale }, { heroImage }, base] = await Promise.all([getI18n(), getSettings(), siteUrl()])
  // Open Graph defaults for every page (a product page overrides them with its own photo and price)
  return {
    metadataBase: base,
    title: { default: t.store.name, template: `%s · ${t.store.name}` },
    description: t.store.tagline,
    openGraph: {
      type: "website", siteName: t.store.name, title: t.store.name, description: t.store.tagline,
      locale: locale === "ar" ? "ar_DZ" : "fr_DZ", images: heroImage ? [ogImage(heroImage)] : [],
    },
    twitter: { card: heroImage ? "summary_large_image" : "summary" },
  }
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { locale } = await getI18n()
  return (
    <html
      lang={locale}
      dir={locale === "ar" ? "rtl" : "ltr"}
      className={`${inter.variable} ${bebas.variable} ${arabic.variable} ${arabicDisplay.variable}`}
    >
      <body className="flex min-h-dvh flex-col">
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  )
}
