"use client"
import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useT } from "@/components/i18n-provider"
import { login } from "@/lib/actions/auth"

export function AuthForm({ callbackUrl }: { callbackUrl?: string }) {
  const { t } = useT()
  const [error, action, pending] = useActionState(login, undefined)

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 py-16">
      <h1 className="text-2xl font-medium md:text-[32px]">{t.auth.loginTitle}</h1>
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="callbackUrl" value={callbackUrl ?? ""} />
        <div className="flex flex-col gap-2">
          <Label htmlFor="username">{t.auth.username}</Label>
          <Input id="username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required dir="ltr" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">{t.auth.password}</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" required dir="ltr" />
        </div>
        {error && <p role="alert" className="text-sm font-medium text-sale">{error}</p>}
        <Button type="submit" disabled={pending} className="mt-2 w-full">{t.auth.submitLogin}</Button>
      </form>
    </div>
  )
}
