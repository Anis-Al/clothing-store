import path from "node:path"

export const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads")

export const MIME: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
  ".avif": "image/avif", ".gif": "image/gif", ".svg": "image/svg+xml",
}
