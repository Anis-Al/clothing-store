// PRD: public/uploads must exist at startup.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { mkdirSync } = await import("node:fs")
    const { UPLOAD_DIR } = await import("@/lib/uploads")
    mkdirSync(UPLOAD_DIR, { recursive: true })
  }
}
