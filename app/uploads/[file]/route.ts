import { readFile } from "node:fs/promises"
import path from "node:path"
import { MIME, UPLOAD_DIR } from "@/lib/uploads"

// Next serves public/ only as it was at build time; runtime uploads come through here.
export async function GET(_req: Request, ctx: RouteContext<"/uploads/[file]">) {
  const name = path.basename((await ctx.params).file)
  const type = MIME[path.extname(name).toLowerCase()]
  if (!type) return new Response("Not found", { status: 404 })
  try {
    return new Response(await readFile(path.join(UPLOAD_DIR, name)), {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=31536000, immutable", // names are unique per upload
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      },
    })
  } catch {
    return new Response("Not found", { status: 404 })
  }
}
