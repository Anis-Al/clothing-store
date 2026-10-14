"use server"
import { AuthError, CredentialsSignin } from "next-auth"
import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { signIn, signOut } from "@/auth"
import { getI18n } from "@/lib/i18n"

// Only same-site relative paths, never "//evil.com".
const safePath = (p: FormDataEntryValue | null) => {
  const s = String(p ?? "")
  return s.startsWith("/") && !s.startsWith("//") ? s : "/admin"
}

// Admin sign-in only (customers have no accounts).
export async function login(_: string | undefined, form: FormData) {
  try {
    await signIn("credentials", {
      username: form.get("username"),
      password: form.get("password"),
      redirectTo: safePath(form.get("callbackUrl")),
    })
  } catch (e) {
    if (e instanceof AuthError) {
      const { t } = await getI18n()
      return e instanceof CredentialsSignin && e.code === "locked" ? t.auth.locked : t.auth.invalid // locked: see auth.ts
    }
    throw e // NEXT_REDIRECT on success
  }
}

export async function logout() {
  await signOut({ redirectTo: "/" })
}

export async function setLocale(locale: "fr" | "ar") {
  ;(await cookies()).set("lang", locale === "ar" ? "ar" : "fr", { maxAge: 60 * 60 * 24 * 365, path: "/" })
  revalidatePath("/", "layout")
}
