"use client"
import { createContext, useContext } from "react"
import { DICTS, type Locale } from "@/lib/dict"

const Ctx = createContext<Locale>("fr")

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <Ctx.Provider value={locale}>{children}</Ctx.Provider>
}

export function useT() {
  const locale = useContext(Ctx)
  return { locale, t: DICTS[locale] }
}
