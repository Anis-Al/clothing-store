import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // ponytail: cacheComponents off — every page reads the DB or the locale cookie, so plain dynamic
  // rendering is simpler than Suspense-wrapping everything. Revisit if the catalog gets heavy traffic.
  images: { localPatterns: [{ pathname: "/uploads/**", search: "" }] },
  experimental: { serverActions: { bodySizeLimit: "10mb" } }, // image uploads
  turbopack: {
    rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } },
  },
}

export default nextConfig
