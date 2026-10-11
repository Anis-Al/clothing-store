@AGENTS.md

# Clothing store template — Claude log

Self-hosted apparel e-commerce template for a **men's clothing store** (no women's/kids' categories).
Single Next.js app: SQLite file DB, local-disk images,
no cloud service at runtime. UI in **French (default) and Arabic (RTL)**. Visual language: the Nike
design system (`../design systems for claude/nike/DESIGN.md`).

This file is the project's running log: decisions, conventions, and what was done per phase.
Append new entries to the **Journal** just above `Known gaps / next steps` (keep that section last and current).

## Stack (pinned)

| Piece | Version | Note |
|---|---|---|
| Next.js | 16.4.0 (App Router, Turbopack) | `proxy.ts` replaces `middleware.ts` (Next 16). |
| React | 19.3 | |
| Prisma + SQLite | 6.19.3 | Pinned to 6: Prisma 7+/8 needs driver adapters (native `better-sqlite3`) — 6 ships the SQLite engine, simpler on Alpine. |
| Auth.js (next-auth) | 5.0.0-beta.32 | Credentials provider only, JWT sessions. |
| Tailwind | v4 | Tokens in `app/globals.css` (`@theme`). |
| shadcn/ui | base-nova style | `components/ui/*` restyled to Nike tokens. |
| Zustand | 5 | Cart, persisted to localStorage. |
| Recharts (via shadcn `chart`) | 3.8 | Admin dashboard charts only (`components/ui/chart.tsx`). |

## Commands

```
npm run dev                          # http://localhost:3000, admin at /admin (admin / password)
npm run db:migrate                   # prisma migrate dev (first run creates prisma/dev.db and seeds)
                                     # schema change: stop dev first (Windows EPERM), restart it after
                                     # (a running dev keeps the old Prisma client → 500 on new models)
npm run db:seed                      # admin; demo categories + products only into an empty store
npm run typecheck && npm run lint && npm test
npm run build && npm start           # stop the dev server before building (both use .next/)
npm run admin:set -- USER PASSWORD   # create an admin or change a password
npm run db:backup                    # VACUUM INTO prisma/backups/
```

Deployment (Docker, HTTPS, backups, updates) and the full local test run are in `DEPLOY.md`.
The desktop app's preview pane starts dev from `.claude/launch.json` (config `dev`, port 3000); only one
dev server can hold :3000, so check for the user's own `npm run dev` window first.

## Conventions

- **No customer accounts.** Guest checkout only (name, phone, wilaya, address; cash on delivery).
  The only login is the admin's (`/login`, unlinked). Don't reintroduce register/account pages.
- **i18n**: `lib/dict.ts` holds the `fr` and `ar` dictionaries (same shape, `fr` is the type source) and
  is the only i18n file client components may import. `lib/i18n.ts` is server-only (reads the DB) and
  re-exports it. Locale lives in the `lang` cookie (default `fr`). Server: `await getI18n()` — it lays the
  admin's Réglages over `store.name`, `store.tagline`, `home.heroTitle`, `product.shippingText`. Client:
  `useT()` from `components/i18n-provider.tsx` (plain dictionary: pass setting-driven values as props).
  Root `<html lang dir>` follows the locale. Use logical Tailwind props (`ms-`, `pe-`, `start-`,
  `text-start`) so RTL works without overrides.
- **Product content** (names, descriptions, colors, category names) is stored once, in whatever
  language the admin types. Only UI chrome is translated.
- **Money**: integer dinars (DZD), formatted with `formatPrice()`.
- **Order statuses** follow cash on delivery: `PENDING → CONFIRMED → SHIPPED → DELIVERED`, or
  `CANCELLED`. The enum's declaration order is the admin's display order (`Object.values(OrderStatus)`).
  Stock is taken at checkout, given back on cancel and taken again on reopen — only through
  `updateOrderStatus`. Revenue counts `DELIVERED` only.
- **Writes** are Server Actions (`lib/actions/*`). Every admin action calls `requireAdmin()` itself;
  `proxy.ts` is only the first gate.
- **Admin feedback**: actions redirect with `?saved=1` or `?error=<key>` (a key of `t.admin`); `Notice`
  shows it as a bottom-end toast. Keep the page's own params in that redirect (settings `tab`, list
  filters, orders `back`, categories `open`), or the admin lands somewhere else after each save.
- **Images**: every upload goes through `saveUpload()` (`lib/actions/admin.ts`: jpg/png/webp/avif/gif,
  ≤ 8 MB, no SVG) into `public/uploads/` (created at boot by `instrumentation.ts`), URL
  `/uploads/<Date.now()>-<name>`, kept in `Image` (products) or `Settings.heroImage`. Deleting the row
  deletes the file. Served by `app/uploads/[file]/route.ts` because Next only serves `public/` files that
  existed at build time.
- **Dropdowns**: never a native `<select>`. Use `FormSelect` (`components/form-select.tsx`, shadcn Select
  on Base UI): posts its value through a hidden input named `name`; supports `required`, `placeholder`,
  `autoSubmit` (submits the surrounding form on change), `size="sm"`.
- **Product URLs**: slug generated from the name at creation (`freeSlug`, `-2`… if taken), never
  typed and never changed on rename. Variant code `sku` is labelled "Référence" in the UI.
- **Variant** (one color × size row) is "Variante(s)" in FR and "متغيّر / المتغيرات" in AR. Never
  "déclinaison" or "صنف / أصناف" (user's call: jargon / reads like "category").
- **Categories** are a two-level tree (`Category.parentId`; depth checked in the actions, not the DB),
  managed in Réglages › Catégories (`/admin/settings/categories`): one `<details>` fold per main
  category, all folded on load, `?open=<main id>` unfolds the group the last action touched.
  Navbar = main categories, sub-categories in a CSS hover/focus menu.
  `?category=<slug>` on a main category includes its sub-categories (storefront `inCategory`, admin
  `OR: [{ id }, { parentId }]`). The shop lists only categories with products (`SHOWN_CATEGORY`).
  Slugs follow the product rule (from the name, never changed). Delete only when no products and no
  sub-categories. Admin selects use `categoryOptions()` ("Hauts › Chemises"); the product form passes
  `leaves = true`: a main category with sub-categories is a group, not offered for a product.
- **Public pages don't look orders up**: `/merci` shows the summary from `sessionStorage` only;
  never fetch an order by URL param (anyone can open the URL).
- **Browser storage keys are namespaced** `atelier:*` (`atelier:cart`, `atelier:shipping`,
  `atelier:last-order`): localStorage is per origin, and the other local projects on
  localhost:3000 use `cart` too. Bump the cart `version` if `CartItem` changes shape.
- **Réglages** (`/admin/settings`, model `Settings`, single row `id = 1` inserted by its migration):
  store name, FR/AR tagline / hero title / delivery text, hero image, WhatsApp number, flat delivery
  fee, low-stock threshold. Tabs (`SettingsNav` in `components/admin/fields.tsx`): Boutique · Page
  d'accueil · Livraison · Stock faible are `?tab=` on the same page, one short form each;
  `updateSettings(tab, f)` writes only the fields the form posted, so a new setting goes in exactly one
  tab. Catégories is the last tab, its own route. Read with `getSettings()` (`lib/i18n.ts`, React
  `cache` = one query per request). Empty text = dictionary default. Never hard-code the "Stock faible"
  `3` again: use `lowStock`.
- **Delivery fee**: flat, from Réglages, re-read by `checkout` (never from the client).
  `Order.totalAmount` = items + `Order.shippingFee` (the fee at checkout time); revenue includes it.
- **Colors** are free text; `swatch()` in `lib/utils.ts` maps French names to hex, else uses the
  text as a CSS color.
- **Charts** (admin dashboard): shadcn `ChartContainer` + Recharts in `components/admin/charts.tsx`
  (client, draws only); data shaped on the server in `app/(admin)/admin/page.tsx`. One series per
  chart, ink (`var(--foreground)`), flat soft-cloud panels (no shadcn `Card`), bars ≤ 24px with 4px
  rounded ends, solid hairline grid, never two y-axes (counts and dinars are separate charts).
  Charts render `dir="ltr"` in Arabic too. Each chart has `accessibilityLayer` (keyboard + tooltip);
  rankings carry their value at the bar tip, the per-day values have an `sr-only` table.

## Design system mapping (Nike → this app)

- Colors: ink `#111111`, canvas white, soft-cloud `#f5f5f5`, hairline `#cacacb`, mute `#707072`,
  sale `#d30005`, success `#007d48` — Tailwind names `ink`, `canvas`, `cloud`, `hairline`, `mute`, …
- Fonts (open substitutes per DESIGN.md): Inter for UI, Bebas Neue for the 96px campaign tier,
  Noto Sans Arabic / Noto Kufi Arabic in RTL.
- Pill CTAs (`rounded-full`, h-12), flat zero-radius product cards on soft-cloud, no shadows,
  1px hairline dividers, 48px section rhythm.
- Pressed state toned down from the spec's `scale(0.5)` to `scale(0.97)` — 0.5 reads as broken.

## Journal

### 2026-10-11 — Phase 1: setup & schema
- `create-next-app@latest` → Next 16.4.0. Read `node_modules/next/dist/docs` (AGENTS.md rule).
- Installed prisma/@prisma/client 6.19.3, next-auth 5.0.0-beta.32, bcryptjs, zustand, zod, tsx (dev).
- `shadcn init -d` (base-nova, Base UI primitives, `cn` package) + input, label, table, badge.
- `prisma/schema.prisma`: User, Category, Product, ProductVariant (`@@unique([productId,color,size])`,
  price as Int DZD), Image (optional variantId = color-specific image), Order, OrderItem.
  SQLite enums (Role, OrderStatus) work on Prisma 6.
  `binaryTargets` adds `linux-musl-openssl-3.0.x` for the Alpine image.
- `prisma/seed.ts`: admin user, categories Chemises/Pantalons, 3 products (Chemise Oxford,
  Chemise en lin, Pantalon chino) × colors × sizes, a few 0-stock combos, one SVG placeholder per
  color written to `public/uploads/`. Idempotent: products only seeded into an empty catalog.
- `npx prisma migrate dev --name init` → migration `init` + seed OK.

### 2026-10-11 — Phase 2: auth & admin shell
- `auth.ts`: Auth.js v5, Credentials (bcryptjs compare), JWT strategy, `id` + `role` copied into
  token/session (module augmentation in the same file). `requireAdmin()` helper.
- `proxy.ts` (Next 16 name for middleware, Node runtime → can import Prisma): `/admin/:path*`,
  role ≠ ADMIN → `/login?callbackUrl=…`. Admin layout re-checks and redirects too.
- `lib/actions/auth.ts`: `login`/`register` (useActionState, French/Arabic error strings),
  `logout`, `setLocale` (cookie `lang`). `callbackUrl` only accepts same-site paths (no `//host`).
- Admin shell: `app/(admin)/admin/layout.tsx` — ink sidebar (Nike inverse surface), locale switch,
  logout. Dashboard with 4 stat tiles (products, pending orders, low stock ≤3, revenue).

### 2026-10-11 — Phase 3: admin data management
- `lib/actions/admin.ts` — all writes, each starts with `requireAdmin()`:
  - `createProduct`: fields + color list × size list → one variant each (SKU `SLUG-COLOR-SIZE`).
  - `updateProduct`: product fields **and** every variant row (`price_<id>`, `stock_<id>`) in one transaction.
  - `addVariants`: adds only the missing color×size combos.
  - `deleteVariant` / `deleteProduct`: refused (`?error=hasOrders`) when order lines reference them.
  - `uploadImages`: FormData → `arrayBuffer` → `fs.writeFile` into `public/uploads/`,
    name `Date.now()-slug.ext`, row in `Image` (variantId = first variant of the chosen color → color gallery).
    Whitelist jpg/png/webp/avif/gif, ≤ 8 MB; SVG refused (script risk). `serverActions.bodySizeLimit: 10mb`.
  - `deleteImage` removes row + file. `updateStock`, `updateOrderStatus` (whitelisted statuses).
- Pages: products list, new (with matrix), edit (fields + variant table + add-matrix form + image
  upload/grid + delete). Separate forms instead of nested ones; per-variant delete uses `formAction`.
  Feedback via `?saved=1` / `?error=<key>` → `Notice` reads `t.admin[key]`.
- `components/admin/client.tsx`: the only client bits — `AutoSubmitSelect`, `ConfirmButton`.
- `app/uploads/[file]/route.ts`: serves runtime uploads (`basename` only, MIME whitelist,
  `nosniff`, sandbox CSP). `instrumentation.ts` creates `public/uploads` at boot.

### 2026-10-11 — Phase 4: storefront & cart
- Root layout: `<html lang dir>` from cookie, fonts Inter / Bebas Neue / Noto Sans Arabic / Noto Kufi Arabic.
- `cacheComponents` + `partialPrefetching` (create-next-app 16.4 defaults) **turned off**: every page
  reads the DB or the locale cookie, plain dynamic rendering is simpler than Suspense everywhere.
- Header: utility bar (lang switch, account links), primary nav (categories from DB), search pill
  (plain GET form → `/products?q=`), cart badge. Mobile: nav row scrolls horizontally (no drawer).
- Home: ink campaign block with `display-campaign` lockup (no photography in a template), latest 6, category tiles.
- Catalog `/products`: single-select facets in the URL (`category`, `size`, `color`, `q`), filter chips
  per Nike `filter-chip`; size/color facets scoped to the selected category; mobile chips scroll.
  Search = Prisma `name: { contains }` (SQLite LIKE → ASCII case-insensitive).
- PDP: `components/store/product-view.tsx` — thumbnail rail + square image, color swatches swap the
  gallery (images of that color + color-less ones), size grid, sold-out sizes struck through,
  **Add to cart disabled when the selected variant has `stockCount === 0`**, low-stock hint ≤3.
  Description/shipping in `<details>` rows (pdp-disclosure-row); description `dir="auto"`.
- Cart: Zustand `persist` (localStorage key `cart`), qty capped at variant stock.
  `useCartReady()` (useSyncExternalStore on persist hydration) avoids SSR mismatch; lint forbids setState-in-effect.

### 2026-10-11 — Phase 5: checkout, orders, Docker
- `lib/actions/checkout.ts`: requires login; re-prices from DB; in one transaction each line does a
  conditional `updateMany({ stockCount: { gte: qty } }, decrement)` — 0 rows → rollback +
  "Stock insuffisant pour « … »". Creates Order (PENDING) + OrderItems with `priceAtPurchase`.
- `/account`: order history with status badges; `?order=` shows the thank-you notice.
- Admin `/admin/orders`: table + status select that auto-submits. `/admin/inventory`: all variants
  sorted by stock (toggle ↑/↓), inline stock form per row.
- `Dockerfile` (node:24-alpine + openssl, `npm ci`, `prisma generate`, `next build`), `VOLUME
  /app/prisma /app/public/uploads`, `EXPOSE 3000`. Schema/migrations/seed copied to `/app/db` so the
  volume over `/app/prisma` never hides newer migrations. `docker-entrypoint.sh`: AUTH_SECRET from
  env or generated once into the volume → `prisma migrate deploy` → idempotent seed → `next start`.
- `.gitattributes` forces LF on `*.sh` (Windows checkout would break the entrypoint).

### 2026-10-11 — Verification
- `npm run typecheck`, `npx eslint .`, `npm test` (node:test via tsx on `lib/utils.test.ts`), `npm run build` — all clean.
- Browser (dev, :3600): home, catalog filters, PDP sold-out → disabled button, add to cart, login
  with callback, checkout (stock 15 → 14, order shown in account + admin), order status → SHIPPED,
  inline stock edit, product creation with 2×3 matrix, PNG upload tied to a color, Arabic RTL on
  home/catalog/PDP, 375px width without horizontal scroll.
- Production (`next start` on a fresh DB, same commands as the entrypoint, seed run twice): all pages 200,
  a file written to `public/uploads` **after** the build served 200 by the route handler, `/uploads/../.env` 404,
  `/_next/image` on an upload 200, anonymous `/admin/products` → 307 to `/login`.
- **Not verified**: `docker build` itself — Docker Desktop is installed but not initialized on this
  machine (no WSL distro). First real build should be checked.

### 2026-10-11 — Delivery details at checkout
- `Order` + `fullName`, `phone`, `wilaya`, `address` (migration `order_shipping`, `@default("")` so
  older orders migrate; UI hides the block when `wilaya` is empty).
- `lib/wilayas.ts`: the 58 wilayas (code, FR, AR). Stored as `"16 - Alger"`; the select shows the
  label in the UI language. `normalizePhone()` accepts 05/06/07 + 8 digits with `0`, `+213` or
  `00213` and spaces/dots/dashes, stores `0XXXXXXXXX`.
- Cart checkout panel is now a form (name, tel, wilaya select, address). Native `required` +
  `pattern` on the phone; the server action re-validates everything (tested with client checks
  bypassed → "Numéro de mobile invalide"). Fields prefilled from the customer's last order.
- Shown in `/account` ("Livraison à : …") and in a new "Livraison" column of `/admin/orders` (tel: link).
- Copy now says cash on delivery ("Paiement à la livraison"). Shipping stays free: no per-wilaya fee.
- `lib/utils.test.ts` covers phone formats, landline rejection, 58 wilayas.
- Verified in browser: invalid phone blocked client-side and server-side, valid order saved with
  normalized phone, shown in account + admin; pre-migration order renders without the block.
- Gotcha (Windows): `prisma generate` fails with EPERM while `next dev` runs — stop the dev server first.

### 2026-10-11 — No customer accounts (guest checkout)
- Decision (user): clients must not have accounts. Removed, not just hidden — a hidden `/register`
  would still be reachable by URL.
- Deleted `/register`, `/account`, the `register` action and their strings; header shows only
  language / search / cart (Admin + logout appear only for a signed-in ADMIN); footer link gone.
- `Order.userId` now optional (migration `guest_checkout`); guest orders have `userId = null`.
- `authorize()` returns null unless `role === "ADMIN"`: even an existing CUSTOMER row can't sign in
  (tested with a temp user → "E-mail ou mot de passe incorrect", user deleted after).
  `/login` is now "Connexion administrateur", unlinked, `noindex`; default redirect `/admin`.
- Checkout no longer needs a session. Success → `/merci?ref=XXXXXXXX` (last 8 chars of the id).
  That page does **no DB lookup**: anyone can open it, so it must never show name/phone/address.
- Delivery details remembered per browser in localStorage `shipping` (replaces "last order" prefill).
- Admin orders: "Client" (email) column removed; the "Livraison" column identifies the buyer.
- `Role.CUSTOMER` kept in the enum (old rows, zero cost).
- Verified: guest header, guest order saved (`userId: null`, phone normalized), `/register` and
  `/account` 404, `/admin` still 307 → login.
- Risk to watch: anyone can place COD orders that reserve stock. If fake orders appear, add a
  per-IP rate limit on `checkout` and/or release stock when an order is cancelled.

### 2026-10-11 — UX pass 1 (simplest items)
- **Catalog sort**: `?sort=price-asc|price-desc` (default newest), link row "Trier" above the grid.
  Price sort done in JS on the min variant price (`lib/catalog.ts`); fine for hundreds of products.
- **Loading skeleton**: `app/(storefront)/loading.tsx` (soft-cloud tiles) covers every storefront page.
  Side effect: fetched HTML now streams; test pages by navigating, not by `fetch` + DOMParser.
- **Add-to-cart toast** (PDP): fixed bottom-end card, 5 s, "Voir le panier" + "Commander"
  (`/cart#checkout`; cart scrolls to the form after hydration). Replaces the small green line.
- **WhatsApp on PDP**: secondary pill "Une question ? WhatsApp", `wa.me` link with product/color/size
  pre-filled. Shown only if env `STORE_WHATSAPP` (digits, e.g. 213555123456) is set — `.env.example`
  documents it; local `.env` has a placeholder number for testing. Pass `-e STORE_WHATSAPP=…` to Docker.
- **Thank-you summary**: checkout writes `sessionStorage.lastOrder` (ref, items, total);
  `components/store/order-summary.tsx` shows it on `/merci` only when the ref matches. Still no DB read
  on that public page.
- **Mobile checkout bar**: fixed bottom bar (total + "Commander") on < md, `form="checkout"` so native
  validation still runs; in-form button hidden on mobile; page gets bottom padding.
- **Admin toast**: `Notice` is a fixed bottom-end toast; success fades after 4 s (`.toast-auto` in
  `globals.css`), errors stay. Don't put `animate-in` on the success toast — it overrides the fade.
- **Admin orders**: status tabs with counts (`groupBy`), search box (name, phone digits ≥3, or the
  8-char ref with/without `#`), pending count badge on "Commandes" in the sidebar.
- Verified in browser: sort order, toast + WhatsApp URL, `#checkout` scroll + prefill → order →
  summary on `/merci`, sticky bar bound to the form at 375 px, admin tabs/search/badge, toast fade.
  typecheck, lint, tests, `next build` clean.
- Gotcha: plain CSS rules added to `app/globals.css` weren't hot-reloaded by Turbopack + the
  Tailwind loader; restart `npm run dev` after editing non-utility CSS.
- Not done from the UX list (bigger): cancelled status + stock restore, admin hero image,
  per-wilaya delivery fee / stop-desk, image ordering / main image, order detail page, global WhatsApp FAB.

### 2026-10-11 — shadcn Select instead of native dropdowns
- `npx shadcn add select` → `components/ui/select.tsx` (base-nova = Base UI Select). Restyled to Nike:
  trigger like the inputs (h-12, hairline, ink border on hover/open, chevron flips), popup on canvas with
  hairline ring + 18px radius, 40px rows with soft-cloud highlight. RTL-safe (`ps/pe`, `end-3` check, `text-start`).
- `components/form-select.tsx`: one wrapper for form use (items → value/label, hidden input for
  FormData/server actions; `autoSubmit` waits a tick so the hidden input holds the new value).
  `key={defaultValue}` remounts it when the server sends a new default — avoids Base UI's
  "changing the default value of an uncontrolled Select" warning after a status save.
- Replaced all 4: cart wilaya (required, FR/AR labels), admin product category, image color
  ("Toutes les couleurs" = ""), admin order status (autoSubmit). `AutoSubmitSelect` and `selectCls` deleted.
- Verified: status change saves and reverts with no console errors; empty wilaya blocks submit
  (`required` honoured by native validation); picked wilaya posts `"16 - Alger"`; admin forms post
  categoryId / color; Arabic popup mirrored correctly. typecheck, lint, tests, build clean.

### 2026-10-11 — Deployment guide + ops scripts
- `DEPLOY.md`: what runs where (volumes, env vars, start sequence), VPS prep (Docker, swap for the
  build, ufw), build/run with `127.0.0.1:3000`, Caddy for HTTPS (nginx: `client_max_body_size 10m`),
  compose alternative, updates, backups + cron + restore, non-Docker systemd path, customization
  map, day-to-day commands, security checklist, troubleshooting. States plainly that
  `docker build` hasn't been run yet. Linked from README.
- `scripts/admin.mts` (`npm run admin:set -- <user> <password>`): upsert an ADMIN — the only way to
  change the seeded `admin`/`password`. `scripts/backup.mts` (`npm run db:backup`): `VACUUM INTO`
  snapshot → `prisma/backups/store-YYYY-MM-DD-HH-MM.db` (inside the DB volume in Docker; safe while running).
  `.mts` because package.json isn't `"type": "module"` and tsx refuses top-level await in CJS.
- Verified locally: backup file opens and contains 4 orders / 4 products / 1 user; admin script
  creates a user (temp user deleted after); usage message without args. `prisma/backups` ignored by git and Docker.
- Commands in the guide that only exist on a server (Caddy, ufw, cron, `docker …`) were not executed.

### 2026-10-11 — No slug field, "Référence", WhatsApp icon
- Product form no longer has a slug input. `createProduct` derives it from the name (`freeSlug`:
  `slugify(name)`, then `-2`, `-3`… if taken; `produit` if the name has no usable characters).
  `updateProduct` never touches the slug, so renaming a product keeps its URL (shared links,
  WhatsApp messages) working. Strings `slug`/`slugHint` removed; error key `slugTaken` → `duplicate`
  (only a duplicate color×size can trigger it now).
- Admin label "SKU" → **Référence** (FR) / **المرجع** (AR). DB column and code stay `sku`.
- PDP: WhatsApp pill now uses the official glyph (`components/whatsapp-icon.tsx`, inlined from
  Simple Icons 16.34.0, CC0 — no dependency added) in WhatsApp green `#25D366`; the disclosure rows
  get `mt-8` so they no longer touch the button.
- Verified: new "Chemise Oxford" → `/products/chemise-oxford-2`, references `CHEMISE-OXFORD-2-ROSE-M`;
  rename keeps the URL; test product deleted afterwards.
- Gotcha: the dev server served stale server code twice this session (after a concurrent
  `npm run build`). If a change doesn't show up, restart `npm run dev` before debugging.

### 2026-10-11 — DEPLOY.md: local dev section
- Added section 0 to `DEPLOY.md`: first-time setup (.env, AUTH_SECRET one-liner, `db:migrate`), daily use,
  pre-deploy checks (typecheck/lint/test/build — stop dev before build), `npm start` and Docker tried locally,
  a 10-minute manual test run (catalog, PDP sold-out, order with DZ phone, admin orders/products/stock, Arabic),
  dev commands (prisma studio, migrate reset, admin:set, db:backup) and dev gotchas (EPERM, stale dev server, CSS, stale types).
- Checked: `npm run lint` without args does lint the whole project (probe file flagged, then removed).

### 2026-10-11 — Admin logs in with a username
(This change came before the deploy guide; the entry was first appended at the end of the file by mistake.)
- `User.email` → `User.username` via hand-written migration `username_login` (`ALTER TABLE … RENAME COLUMN`,
  unique index recreated, seeded `admin@store.local` renamed to `admin`). `prisma migrate dev` refused
  non-interactively (it saw drop + add = data loss), hence the manual SQL; `migrate diff` confirms no drift.
- Credentials: `admin` / `password`. Plain text field, no format rules (only non-empty, trimmed username,
  exact-case match). Session carries `name` = username; admin sidebar shows it.
- Verified: wrong password → "Identifiant ou mot de passe incorrect.", right one → `/admin`.

### 2026-10-11 — Cart storage clash with other local projects + CLAUDE.md audit
- User hit "State loaded from storage couldn't be migrated since no migrate function was provided"
  (`lib/cart.ts`). Cause: `phone-store-template` and `kaba-store` also persist under localStorage
  `cart` (version 1, `{ lines }`) on the same origin, localhost:3000. Fix: key `atelier:cart`,
  `version: 1`, and a `migrate` that returns an empty cart for any older/unknown state. `shipping` →
  `atelier:shipping`, `lastOrder` → `atelier:last-order`. Verified: planted both conflicting values →
  no console error, empty cart, other project's `cart` left untouched; add-to-cart writes `atelier:cart`.
- Audit: moved the username entry above, refreshed Commands, Conventions (slugs, `/merci`, storage
  keys, `STORE_WHATSAPP`) and Known gaps.
- Incident: a shell edit of this file put backticks inside a double-quoted bash string, so bash
  *executed* the command lines meant as text (`db:migrate`, `db:seed`, `build`, a failed `start`,
  `db:backup`, `docker build`). Checked afterwards: no stray files, admin password unchanged, data counts
  intact, no new migration. The dev server was restarted because a build had run under it.
  **Rule: edit docs with the Edit/Write tools, never with shell heredocs or `node -e` strings that contain backticks.**

### 2026-10-11 — UX pass 2 (quick wins from a review)
- **Mobile catalog**: products started ~770px down (three chip rows first) in a 1-column grid. Now
  `ProductGrid` is 2 columns from phone width (3 from 1024px; home uses it too), and on < md the filters
  sit in a native `<details>` "Filtres" pill (ink + count when category/size/color is set). The filter
  JSX is rendered twice (details on mobile, plain block on desktop) instead of `::details-content`,
  which older phones lack. Chips wrap instead of scrolling. The panel stays open across filter taps
  (soft navigation keeps the DOM). Sort row: no "Trier" label on phones, `whitespace-nowrap`.
- **404**: `app/not-found.tsx` (FR/AR, store header + footer, link to the catalog) replaces Next's
  black English page, for unmatched URLs and every `notFound()` (deleted product links). It renders
  under the root layout only, so it includes Header/Footer itself; no double header. Next preloads it in
  every page's RSC payload, so 404 text in a page's HTML source is expected.
  `/products/<unknown>` still answers 200 (streaming starts in `loading.tsx` before `notFound()`;
  Next adds `noindex`). Unmatched URLs answer 404.
- **Sold-out last** in `getProducts` (stable sort after the price sort): catalog and home.
- **Cart, mobile**: server errors (stock, bad phone) also show in the fixed bottom bar; the aside's copy
  is `md:` only. Both order buttons say "Envoi…" while pending.
- **Admin orders**: WhatsApp icon link next to the phone (`wa.me/213` + phone without its leading 0).
- Verified at 375px: products on the first screen, no horizontal scroll, `(1)` badge, chips wrap;
  bad phone with client pattern removed → error visible in the bar while scrolled to top, no order
  created; "Envoi…" seen during submit; 404 FR + AR; wa.me hrefs in admin. typecheck, lint, tests clean.

### 2026-10-11 — Cash-on-delivery order statuses
- `OrderStatus`: `PENDING, PAID, SHIPPED` → `PENDING, CONFIRMED, SHIPPED, DELIVERED, CANCELLED`
  (FR: En attente / Confirmée / Expédiée / Livrée / Annulée). "Payée" before "Expédiée" made no sense
  when the cash arrives with the courier.
- Migration `cod_statuses` is hand-written and data-only: SQLite keeps the enum as TEXT, so the only
  change is `PAID → DELIVERED` on existing rows. `migrate diff` (DB vs schema) reports no difference.
  Name a hand-written migration with the real current time, or later `migrate dev` folders sort before it.
- `updateOrderStatus(orderId, back, f)`: one transaction; the status write is conditional on the status
  just read (a double submit can't move stock twice); `stockDirection(from, to)` in `lib/utils.ts`
  (+1 cancel, −1 reopen, 0 otherwise, unit-tested). Reopen uses the checkout's conditional decrement;
  not enough stock → rollback and `?error=noStock` toast. `back` = current tab/search URL (bound in the
  page, must start with `/admin/orders`), so the redirect keeps filters and clears an old `?error`.
- Dashboard: "Encaissé (commandes livrées)" sums `DELIVERED` only; tiles link to the matching status tab.
  Orders page now renders `Notice`; cancelled rows' select is muted.
- Verified on order ODVOFJ26 (stock 7): cancel → 8, cancel again → 8, reopen → 7; cancel, stock forced
  to 0, reopen → toast, still `CANCELLED`, stock 0; stock restored, reopen → `PENDING`, 7, `?error` gone.
  All 4 orders and stocks back to their starting values. DB backed up first (`prisma/backups/store-2026-10-11-10-48.db`).
- The dev server (`npm run dev` from a PowerShell window) had to be stopped for `prisma generate` (EPERM gotcha).

### 2026-10-11 — Filters + pagination on admin Produits and Stock
- Request was "/products and /stock": read as the admin lists (`/admin/products`, `/admin/inventory`,
  labelled "Stock"); the storefront catalog already had filters.
- Same filter bar on both (`ListFilters` in `components/admin/fields.tsx`): stock chips Tout / Stock faible
  (≤3, same as the dashboard tile) / Rupture, category `FormSelect` (autoSubmit on a GET form), search
  (products: name; stock: product name or Référence). Products: "faible" = some variant ≤3, "rupture" =
  every variant at 0. Title shows the matching count.
- Pagination: 5 products / 7 variants per page (user's choice; `PER_PAGE` at the top of each page),
  `Pager` (Précédent · Page n / N · Suivant, chevrons flip in RTL). Everything lives in the URL; helpers `listParams` / `listHref` / `paginate` in
  `lib/utils.ts` (unit-tested): empty params and page 1 stay out of URLs, a new filter or search goes back
  to page 1, an out-of-range `?page=` is clamped to the last page. Stock sort toggle keeps the filters.
- Dashboard "Stock faible" tile → `/admin/inventory?stock=low`.
- Verified: category select → 2 Chemises; chips keep the category; `?stock=low&q=oxford` → 2 variants at 0;
  `q=LIN-NOIR` matches references; at 10 per page: 35 variants → 4 pages, links keep
  `sort`, `page=99` → 4/4, inline stock save stays on the page; Arabic labels + RTL chevrons.

### 2026-10-11 — Admin product edit page layout
- Complaint: key info only after a long scroll (Save at 1239px, images at 1733px on a 12-variant product,
  right half of a wide screen empty). Now: 4 stat tiles under the title (price or price range, total
  stock, out-of-stock variants in red, variant count); a 360px images column on the right, sticky on
  `lg` (aside comes first in the DOM, so on phones images follow the tiles); the Save button sits in a
  sticky bottom bar of the product form; "Ajouter des déclinaisons" (now "Ajouter les variantes") is
  folded in a `<details>`.
  Variant stock inputs are colored like the Stock page (0 red, ≤3 amber); rows a bit tighter (h-9).
- Same actions and form fields as before. Page 2152px → 1609px tall.
- Verified at 1280px (images pinned at 40px and Save visible while scrolled, unchanged save → `?saved=1`
  toast) and 375px (tiles → images → form, no horizontal scroll).

### 2026-10-11 — Categories: admin screen, men's catalog, two-level tree
- `/admin/categories` (sidebar "Catégories"): add (name + parent), rename / move (one form per row),
  delete only when empty. Tree view: main rows, sub-categories indented; counts per group link to the
  filtered admin product list; empty ones say "masquée dans la boutique". Actions `createCategory`,
  `updateCategory`, `deleteCategory` (errors `catDuplicate`, `catDepth`, `catHasProducts`, `catHasChildren`).
  `freeSlug(name, fallback, taken)` now serves products and categories.
- Migration `category_parent` (Prisma-generated table redefinition, data kept): `parentId` + self-relation
  `CategoryTree` (onDelete SetNull, but the action refuses to delete a category with sub-categories).
- Store is **men-only** (user): 6 main categories / 17 sub-categories — Hauts (Chemises, T-shirts, Polos,
  Pulls, Sweats & hoodies), Bas (Pantalons, Jeans, Shorts), Vestes & manteaux (Vestes, Manteaux), Tenues
  (Costumes, Survêtements, Qamis), Nuit & sous-vêtements (Pyjamas, Sous-vêtements), Chaussures & accessoires
  (Chaussures, Accessoires). Same tree in the seed and in the local DB.
- Seed: demo categories + products only go into an empty store (no category and no product), so a
  restart never brings back a category the admin deleted. Entry point and DEPLOY.md updated.
- Storefront: only categories with products (directly or via a sub-category) are listed. Navbar = "Tout" +
  main categories (all 6 fit at 1280px); sub-categories open in a CSS-only menu (`group-hover`, and
  `group-has-focus-visible` for keyboard); the main link opens the whole group. Phones: the scrolling row
  shows main categories. Catalog: main-category chips, then a sub-row (Tout + sub-categories) for the
  selected group; title = the exact category. Home: main-category tiles (image from the group's latest
  product), a denser 2/4-column grid once there are more than 2.
- Admin: product form category select has no default on a new product (placeholder) and shows
  "Hauts › Chemises" labels; Produits/Stock category filters include sub-categories; new-product page
  links to Catégories when none exist.
- Tried first and dropped: a flat list of 17 in the navbar (overflowed at "Polos"), then top-5 + a native
  popover "Catégories" dropdown — superseded by the tree when the user asked for sub-categories.
- Verified: create / duplicate refusal / rename (slug kept) / delete; move Polos → Bas → Hauts;
  Polos under Chemises refused (`catDepth`); `?category=hauts` → 2 Chemises with sub-row; admin filter
  "Hauts" → 2 products; with empty categories temporarily shown: 6 groups + Tout on one line at 1280px,
  6 home tiles in the dense grid. Hover menu checked by its generated CSS only (the browser pane was
  hidden, so no real hover). typecheck, lint, 7 tests clean.
- Gotcha: a hidden browser pane never fires `requestAnimationFrame`, so streamed Suspense content
  (everything under `loading.tsx`) stays on the skeleton there. Check such pages with curl or a visible pane.

### 2026-10-11 — Product form: leaf categories only
- Product category select no longer offers a main category that has sub-categories ("Hauts" when
  "Hauts › Chemises" exists). Childless main categories stay selectable (else nothing could go there).
  A product already sitting on such a group keeps it listed on its edit page (`keep`), so the select
  never shows a raw id. Admin list filters still offer main categories (filter the whole group).
- The actions don't re-check it (admin-only form; a stale tab could still post a group id).

### 2026-10-11 — Réglages (admin settings)
- Request: make important things configurable in the admin. Picked by the user: store identity, delivery
  text, home banner, delivery fee, low-stock threshold (not: admin password change).
- Migration `settings` (Prisma-generated + a hand-added `INSERT` of row 1): table `Settings`, and
  `Order.shippingFee` (old orders 0). Prisma writes `AUTOINCREMENT` for any SQLite `Int @id`; harmless,
  every write passes `id: 1`.
- `lib/i18n.ts` split: dictionaries → `lib/dict.ts` (client-safe); `lib/i18n.ts` is now server-only
  (`getSettings`, `getLocale`, `getI18n` with the overrides). Client components switched to `@/lib/dict`.
- `/admin/settings` (sidebar "Réglages"): FR/AR fields side by side, default text as placeholder; hero
  image upload with preview + "Retirer l'image" (old file deleted on replace/remove); sticky Save bar.
  `updateSettings` strips non-digits from WhatsApp, needs 8–15 digits (`?error=badWhatsapp`).
  `saveUpload()` now shared by product images and the hero image (same whitelist, 8 MB, no SVG).
- `STORE_WHATSAPP` env var **removed** (setting replaces it; `.env.example`, DEPLOY.md updated). A local
  `.env` may still have it: unused.
- Storefront: header/footer/title use the store name; hero photo fills the campaign block under an ink
  gradient; cart shows the fee (or "Gratuite") and total; `/merci` summary has a delivery line
  (`fee` in `atelier:last-order`). Threshold used by dashboard, Stock, Produits, product edit page, PDP hint.
- Verified (dev, FR + AR): bad WhatsApp refused; full save with a generated 1600×900 PNG → home shows
  name/title/tagline/photo, footer text, PDP wa.me link + "Plus que 4 en stock" at threshold 5,
  dashboard "Stock faible" 3→11 variants; order with 400 DA fee → DB `totalAmount` 6300 / `shippingFee`
  400, `/merci` delivery line; AR falls back to AR defaults; remove-image deletes the file. Test order
  deleted and its stock restored; settings reset to defaults. typecheck, lint, 7 tests clean.
  DB backed up first (`prisma/backups/store-2026-10-11-12-38.db`).
- The user's own `npm run dev` (separate window) had the pre-migration Prisma client in memory → every
  page 500 (`db.settings` undefined). It was stopped, `prisma generate` re-run, dev restarted from the
  preview pane. After any schema change: restart dev.

### 2026-10-11 — Dashboard charts (shadcn chart)
- `npx shadcn add chart` → `components/ui/chart.tsx` + `recharts@^3.8` (globals.css untouched: the
  `--foreground`, `--border`, `--muted-foreground` it uses already hold the Nike values). The `card.tsx`
  it pulled in was deleted (unused; Nike panels are flat).
- Dashboard: the 4 tiles stay (big values now proportional figures, no `tabular-nums`), then "Activité"
  with one range filter `?days=7|30|90` (default 30, chips like the admin lists) over four charts:
  orders per day (columns), order value per day excluding cancelled (area, 2px line, 10% wash),
  orders by status in enum order (horizontal bars), top 5 products by quantity excluding cancelled.
  No orders in the range → one "Aucune commande sur la période." line instead of empty charts.
- Day buckets use the server's local date (`toLocaleDateString("en-CA")`); labels formatted on the
  server ("11 oct." / "11 أكتوبر") so SSR and client match. Top products summed in JS (`ponytail` note).
- Range labels are a per-range array in the dict (`ranges`), not a `{n}` template: Arabic needs
  "7 أيام" but "30 يوماً".
- Gotcha: shadcn's `ChartTooltipContent` with `indicator="line"` and one series nests the label inside the
  row, so a custom `formatter` (which replaces the row) drops the date. Keep the default "dot".
- Verified (dev): 30 days → 4 orders on 11 oct., value 22 500 DA (sum of the 4 totals), status 3 en
  attente / 1 expédiée, top Chemise en lin 2; keyboard tooltip "12 sept. Commandes 0"; 7 and 90 days;
  Arabic titles, ticks, chips. Mouse hover couldn't be exercised: the hidden pane runs no animation
  frames, and Recharts 3 updates hover state on them. typecheck, lint, 7 tests clean.

### 2026-10-11 — Réglages in tabs, Catégories moved under it
- Request: categories as a sub-section of Réglages, and no long scroll on Réglages.
- Réglages is now a tab row under the title (pill chips, same style as the list filters): Boutique ·
  Page d'accueil · Livraison · Stock faible · Catégories. The four settings tabs are `?tab=` on
  `/admin/settings` (default Boutique), each rendering only its section in its own form; the sticky Save
  bar is gone (forms are short). The settings tab is labelled "Stock faible", not "Stock", which is
  already the sidebar's inventory page.
- `updateSettings(tab, f)`: keeps only the keys present in the FormData (`f.has`), so saving one tab
  leaves the others untouched; redirects back to the same tab (`?tab=…&saved=1` / `&error=…`).
- `/admin/categories` → `/admin/settings/categories` (page moved, `CATS` in the actions, new-product
  link, seed comment). Sidebar "Catégories" removed. The old URL is a 404 (no redirect: admin-only, unlinked).
- Verified (dev, via DOM, pane hidden): Stock faible 5 then Livraison 400 → each kept the other;
  bad WhatsApp → error toast on the Boutique tab; duplicate category → toast on
  `/admin/settings/categories`, 23 rows listed, tab marked current. Values restored (3, 0). typecheck, lint clean.
- Then: categories folded. One native `<details>` per main category (PDP disclosure-row look): folded line =
  name, its sub-category names (truncated), "Produits · n" or "masquée dans la boutique"; open = the old edit
  rows (headerless table per group). All start folded; category actions redirect with `?open=<main id>`
  (create/move → the group it landed in, row error → same group, delete → its parent) and the page sets
  `open={sp.open === m.id}` on the server.
- Gotcha: Next remounts the page when its search params change, so `<details>` state does **not**
  survive a save that changes the URL (a client "only ever opens" wrapper was tried and dropped: no gain).
  Folds the admin opened by hand close after a save; only `?open=` comes back open.
- Verified: 6 folds closed on load; re-save Polos → Hauts open; duplicate rename → error toast, Hauts open;
  temp "Test pli" under Bas → Bas open, deleted → Bas still open, 23 rows again.

### 2026-10-11 — "Déclinaisons" → "Variantes"
- User's call: the admin says **Variantes** (FR) / **المتغيرات**, singular **متغيّر** (AR) for a color × size
  row, instead of "Déclinaisons" (PrestaShop jargon) / "الأصناف" (صنف reads close to "category").
  Only `lib/dict.ts` strings changed (section titles, column, stat tile, add button, matrix hint,
  duplicate error, low-stock hint); code and DB keep `variant`.

### Known gaps / next steps
Keep this section last; update it when something here gets done or newly found.
- `docker build` never run yet (Docker Desktop not initialized on the dev machine). The first build may need fixes.
- Dashboard day buckets follow the server's time zone; the Docker image runs in UTC, so set
  `TZ=Africa/Algiers` there (untested) or orders placed between midnight and 1 am land on the day
  before. No "delivered on" date exists, so there is no revenue-over-time chart (only order value by
  order date).
- No rate limit on guest checkout: fake COD orders hold stock until the admin cancels them.
- Categories: no manual order (alphabetical), no category images (home tiles use the latest product's).
  On touch tablets (≥768px) the hover menu doesn't open: tapping a main category opens its page, whose
  sub-row lists the sub-categories.
- Delivery fee is one flat amount (Réglages): no per-wilaya fee or stop-desk option; commune is free
  text in the address. Admin orders show the total only, not the fee part. If the admin changes the fee
  while a customer has the cart open, the order is charged the new fee (cart showed the old one).
- `createProduct`/`updateProduct` don't refuse a main category that has sub-categories (only the form
  hides it).
- Store name is one value for both languages (FR/AR for tagline, hero title, delivery text only).
- Product images: no main-image choice or ordering. No order detail page in admin.
- Product content is single-language (no `nameAr`); add columns if the catalog must be bilingual.
- Admin password can only be changed with `npm run admin:set` (no UI; not picked for Réglages).
- Réglages: switching tabs drops unsaved edits without a warning (each tab is its own form).
  Categories: folds opened by hand close after every save (only the `?open=` group reopens); the old
  `/admin/categories` URL is a 404.
- WhatsApp button only on product pages (admin orders have a per-customer WhatsApp link).
- Admin on phones: orders table scrolls sideways (6 columns); inventory saves one row per click and reload.
- No pagination on admin Commandes (grows fastest) or on the storefront catalog; reuse `paginate`/`Pager`.
- PDP: sold-out colors look like the others; switching color keeps a size that may not exist there
  (greyed "Ajouter au panier", no reason); a single-image product still shows a 1-thumbnail rail;
  add-to-cart toast timer isn't reset on a second add. Cart qty buttons are labelled "-"/"+".
