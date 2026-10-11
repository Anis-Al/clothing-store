import { AuthForm } from "@/components/store/auth-form"
import { getI18n } from "@/lib/i18n"

// Admin-only entry, not linked from the storefront (reached via /admin redirect).
export async function generateMetadata() {
  return { title: (await getI18n()).t.auth.loginTitle, robots: { index: false } }
}

export default async function Page({ searchParams }: PageProps<"/login">) {
  const { callbackUrl } = await searchParams
  return <AuthForm callbackUrl={typeof callbackUrl === "string" ? callbackUrl : undefined} />
}
