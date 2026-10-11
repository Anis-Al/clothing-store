import type { Metadata } from "next"
import { Bebas_Neue, Inter, Noto_Kufi_Arabic, Noto_Sans_Arabic } from "next/font/google"
import { I18nProvider } from "@/components/i18n-provider"
import { getI18n } from "@/lib/i18n"
import "./globals.css"

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] })
const bebas = Bebas_Neue({ variable: "--font-bebas", subsets: ["latin"], weight: "400" })
const arabic = Noto_Sans_Arabic({ variable: "--font-arabic", subsets: ["arabic"] })
const arabicDisplay = Noto_Kufi_Arabic({ variable: "--font-arabic-display", subsets: ["arabic"], weight: "700" })

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n()
  return { title: { default: t.store.name, template: `%s · ${t.store.name}` }, description: t.store.tagline }
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
