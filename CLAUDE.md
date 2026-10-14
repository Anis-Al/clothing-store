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

- **No customer accounts.** Guest checkout only (name, phone, wilaya, commune, address; cash on delivery).
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
  `SHIPPED → RETURNED` (parcel refused / not collected, set once it is back in the shop), or `CANCELLED`.
  The enum's declaration order is the admin's display order (`Object.values(OrderStatus)`).
  `DELIVERED`, `RETURNED` and `CANCELLED` are **final** (`FINAL_STATUSES` in `lib/utils.ts`): `updateOrderStatus`
  only writes to an open order (`RETURNED` only to a `SHIPPED` one; the select offers it only there), the
  orders page shows a badge instead of the select, and picking a final status asks first (`FormSelect confirm`).
  Stock is taken at checkout and given back once on cancel or return (`UNSOLD_STATUSES`) — only through
  `updateOrderStatus`. Revenue counts `DELIVERED` only; charts and best sellers leave `UNSOLD_STATUSES` out.
- **Writes** are Server Actions (`lib/actions/*`). Every admin action calls `requireAdmin()` itself;
  `proxy.ts` is only the first gate.
- **Admin feedback**: actions redirect with `?saved=1` or `?error=<key>` (a key of `t.admin`); `Notice`
  shows it as a bottom-end toast. Keep the page's own params in that redirect (settings `tab`, list
  filters, orders `back`, categories `open`), or the admin lands somewhere else after each save.
- **Commandes URL** (`/admin/orders`): `status`, `q`, `sort` (`date|wilaya|total` + `-asc|-desc`, none = newest
  first), `from` / `to` (YYYY-MM-DD), `page`. Every tab, header, pager link and every `back` passed to the status
  and note actions comes from `href(patch)` in the page; the two GET forms carry the rest with `keep(...)`.
  A new param goes into `cur` there, or saves and tab switches drop it.
- **Images**: every upload goes through `saveUpload()` (`lib/actions/admin.ts`: jpg/png/webp/avif/gif,
  ≤ 8 MB, no SVG) into `public/uploads/` (created at boot by `instrumentation.ts`), URL
  `/uploads/<Date.now()>-<name>`, kept in `Image` (products) or `Settings.heroImage`. Deleting the row
  deletes the file. Served by `app/uploads/[file]/route.ts` because Next only serves `public/` files that
  existed at build time.
- **Dropdowns**: never a native `<select>`. Use `FormSelect` (`components/form-select.tsx`, shadcn Select
  on Base UI): posts its value through a hidden input named `name`; supports `required`, `placeholder`,
  `autoSubmit` (submits the surrounding form on change), `size="sm"`. Items may carry `group` (consecutive
  items with the same one go under a sticky heading) and `option` (row text; `label` stays the trigger's text).
  The popup is at most 20rem tall and scrolls.
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
- **Wilaya + commune**: `lib/wilayas.ts` (58 wilayas, value `"16 - Alger"`) and `lib/communes.ts` (1541 communes
  from the user's CSV, keyed by wilaya **code**, `[latin, arabic]`). Orders store the commune's Latin name; labels
  follow the UI language. `checkout` refuses a commune outside the posted wilaya (`isCommune`). Never rename stored
  wilaya values: map spellings to a courier's list (Yalidine) at export / API time.
- **Delivery fee**: flat, from Réglages, re-read by `checkout` (never from the client).
  `Order.totalAmount` = items + `Order.shippingFee` (the fee at checkout time); revenue includes it.
- **Checkout price check**: the cart sends the prices and fee it displayed; if any differs from the DB,
  `checkout` refuses (`t.errors.priceChanged`) and returns the current prices, the cart reprices
  (`reprice`) and refreshes (new fee). The customer never orders at a total they didn't see.
- **Colors** are free text; `swatch()` in `lib/utils.ts` maps French names to hex, else uses the
  text as a CSS color.
- **Charts** (admin dashboard): shadcn `ChartContainer` + Recharts in `components/admin/charts.tsx`
  (client, draws only); data shaped on the server in `app/(admin)/admin/page.tsx`. One series per
  chart, ink (`var(--foreground)`), flat soft-cloud panels (no shadcn `Card`), bars ≤ 24px with 4px
  rounded ends, solid hairline grid, never two y-axes (counts and dinars are separate charts).
  Charts render `dir="ltr"` in Arabic too. Each chart has `accessibilityLayer` (keyboard + tooltip);
  rankings carry their value at the bar tip, the per-day values have an `sr-only` table.
- **Admin tables on phones**: a table whose rows hold inputs, buttons or a status uses `<Table stack>`:
  below `md` the header is hidden and each row wraps its cells (no sideways scroll). Per cell:
  `max-md:basis-full` = own line, `max-md:ms-auto` = pushed to the end, `data-label={…}` = small caption
  above the value (replaces the hidden header for inputs). Read-only lists (Produits) stay plain tables.
- **Admin filters on phones** = one row on every list (Produits, Stock, Commandes): search + `FiltersPill`
  ("Filtres (n)", `components/admin/fields.tsx`), an empty-bodied `<details class="peer">` whose next sibling
  (chips, category, dates) unfolds below with `max-md:hidden max-md:basis-full peer-open:flex`. Desktop: no pill;
  Produits/Stock one row; Commandes `md:contents` → status tab strip (text, 2px ink underline, hairline) on row 1,
  dates + search on row 2.

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

### 2026-10-11 — Product import (CSV)
- `/admin/products/import` ("Importer" next to "Nouveau produit"): one CSV row per variant, columns named
  with the admin labels in FR or AR (`Nom;Catégorie;Description;Couleur;Taille;Prix (DA);Stock`, matched on
  the header's first word). Rows with the same name (any case) = one product; category + description from
  its first row. Category = existing name or `Main › Sub`, must not be a group. Existing product (same name):
  variants matched by color × size (any case) get the file's price and stock, new ones are added; the
  product's own fields are untouched. Images: on the product page afterwards.
- `lib/csv.ts` (pure, tested): `decodeText` (UTF-8, else windows-1252 = plain Excel "CSV"), `parseCsv`
  (quotes, `""`, line breaks in cells, separator `;`/`,`/tab detected on line 1), `planImport` (all checks,
  errors as "Ligne n : …" = Excel row numbers). `importProducts` (useActionState, `ImportForm` in
  `components/admin/client.tsx`) writes nothing if any row fails, else one transaction. `.csv` only, ≤ 1 MB.
- Template = `data:` link built on the page (BOM + `;`, headers in the admin's language, example in the first
  leaf category).
- Verified (dev): error file → 2 line errors, nothing written; windows-1252 file with `1 500,00` and a quoted
  `;` → product + 2 variants; re-import in lower case → 1 updated (spelling kept) + 1 added; Arabic page and
  template headers. Test product deleted. DB backed up first (`prisma/backups/store-2026-10-11-15-32.db`).
- Gotcha again: the running dev server kept serving `ImportForm` as undefined (new export of an existing
  client module) until the file was touched again; no code change needed.

### 2026-10-14 — Review fixes
- Request: "check if there is anything to improve", then "implement" the list. Work on branch `review-fixes`
  (the CSV import was committed first, as it was).
- **Stale cart price**: the cart kept the price from add-to-cart time while checkout charged the DB price, so
  the courier collected an amount the customer never saw (CSV import makes bulk price changes easy). Now
  `checkout(lines + price, fee, shipping)` compares inside the transaction, before any stock moves, and
  refuses on any difference (see Conventions). Also closes the old "fee changed while the cart is open" gap.
- **Product with no variant left** (last one deleted): the card showed "∞ DA" (`Math.min()` of nothing).
  `getProducts` always requires a variant, `HAS_PRODUCTS` too (no menu entry for such a category), the PDP
  is a 404.
- **Admin login lockout** (`auth.ts`): 10 wrong passwords, each within 15 min of the last, lock that username
  for 15 min ("Trop de tentatives…", `CredentialsSignin` subclass with `code = "locked"`, read by the login
  action). In memory, only existing admins tracked, cleared by a restart (DEPLOY.md 3.6).
- **CSV import**: a `"` opens a quoted cell only at its start (`32"` used to swallow the rest of the file);
  price must be ≥ 1 (form price inputs now `min={1}` too); `Main › Sub` must name the real parent
  (`Bas › Chemises` refused, keys `main/sub` in `catBy`). Rules text updated FR/AR.
- DEPLOY.md: stale "no cancelled status yet" removed.
- Verified (dev, user's own server): variant-less temp product absent from `/products`, PDP noindex 404;
  price 4500 → 4700 in DB → order refused, cart shows 4 700; fee 0 → 300 → refused, cart shows 300 / 5 000
  after refresh; third try → order 5 000 (fee 300, line 4 700) on `/merci` and in DB. Order deleted, price,
  stock and fee restored. Temp admin: 10 wrong → 11th with the right password "Trop de tentatives"; another
  temp admin logs in after one wrong try. Both deleted. typecheck, lint, 8 tests clean.
  DB backed up first (`prisma/backups/store-2026-10-14-08-52.db`).

### 2026-10-14 — UX review: orders pagination, sold-out colors
- Request: "any UX improvement?" → list of 13 items (phone + desktop pass); user picked these two. The
  rest went to Known gaps. Branch `ux-orders-pager-soldout-colors`.
- **Admin Commandes paginated**: 10 per page (`PER_PAGE`), same `paginate`/`Pager` as Produits/Stock;
  `q` and `page` read with `listParams`. Status tabs and search go back to page 1; the status select's
  `back` URL carries the current page, so a status change keeps the admin on that page.
- **PDP sold-out colors**: a color whose every size is at 0 gets a 50% swatch and a diagonal ink strike
  with a white edge (shows on black and white swatches); title / sr-only text / legend add "· Épuisé".
  Still clickable, so its photos stay viewable (sizes then all show struck through).
- Verified (dev, pane): at `PER_PAGE = 2` with 4 orders → 2 pages, page 2 status change stays on
  `?page=2`, `?page=99` → 2 / 2; order status put back. Bleu ciel (Oxford) and Noir (lin) zeroed → strike
  visible on both, selected → "Noir · Épuisé"; Arabic title "· نفد المخزون". Stock restored from the saved
  values. typecheck, lint, 8 tests clean. DB backed up first (`prisma/backups/store-2026-10-14-10-10.db`).

### 2026-10-14 — Admin on phones: stacked tables, sticky nav
- Complaint: on phones, tables whose last column is an action or a state needed a sideways scroll to reach
  it (375px: Commandes 832px wide, Stock 730, Catégories ~700, Variantes 484). Branch `admin-tables-mobile`.
- Sticky last column was considered and dropped: on Variantes the price/stock inputs sit mid-row, and on
  Stock the pinned form hid the color/size of the row being edited.
- `Table stack` (`components/ui/table.tsx`, see Conventions) on Commandes (ref + date / delivery / items /
  total + status select at the end), Stock (product / color, size, référence, price / "Stock" input + save),
  Variantes (color + size / référence / Prix · Stock · delete) and Catégories (name + parent + save form,
  then count + delete; the `?category=` slug is hidden on phones, name/parent fields grow to the line).
  Variantes' référence: `dir="ltr"` moved to an inner span, so the line follows the page direction in Arabic.
- Admin nav sticky on phones: the `<aside>` is `display: contents` below `md`, so the nav row alone
  (56px) sticks to the top; store name and links scroll away. Desktop sidebar unchanged.
- Verified (dev, user's own server, 375px): all four tables scrollWidth = clientWidth, page 375px wide,
  nav pinned while scrolled; Arabic orders + Variantes mirrored; 1280px: sidebar and tables as before.
  No data written. typecheck, lint, 8 tests clean.

### 2026-10-14 — Delivered and cancelled orders are final
- User: "delivered and canceled states are final". Same branch `admin-tables-mobile`.
- `updateOrderStatus`: one conditional `updateMany` (`status notIn FINAL_STATUSES`); stock goes back only
  when that write landed and the new status is `CANCELLED`, so a stale tab or double submit can neither
  change a final order nor give its stock back twice. The reopen path (take stock again, `?error=noStock`),
  `stockDirection` and its test are deleted; `t.admin.noStock` → `confirmFinal`.
- Orders page: final orders show a `Badge` (Livrée soft-cloud, Annulée outline/mute) instead of the select.
  `FormSelect` gained `confirm: { values, message }` (plain data, so server pages can pass it): picking
  Livrée/Annulée asks "Ce statut est définitif…"; "no" remounts the select on its old value, nothing posted.
- Verified (dev, 375px): "no" → still En attente, nothing posted; "yes" → Annulée badge, Oxford Blanc/M
  7 → 8; order set CANCELLED in the DB then "Annulée" picked from the stale page → chino stock stays 7;
  order set DELIVERED in the DB then "En attente" picked → stays Livrée, no prompt for a non-final pick.
  Statuses and stock restored to the starting values. typecheck, lint, 7 tests clean.
  DB backed up first (`prisma/backups/store-2026-10-14-11-49.db`).

### 2026-10-14 — Admin filters on phones
- Complaint: on phones the filter chips filled the first screen (375px: Commandes 184px of chips on 4 rows,
  1 order visible; Stock/Produits 136px on 3 ragged rows, 2 variants visible).
- `ListFilters`: search (full width) + "Filtres" pill on one row; the pill is ink with `(n)` when stock or
  category is set and unfolds the stock chips + category select (full width). Not the storefront's
  render-twice fold: the search must share the pill's row, so the panel is a sibling of an empty-bodied
  `<details class="peer">` and shows with `peer-open:flex`. Category select now has its own GET form
  (carries `q`); the search form carries `category`. Desktop: same single row as before.
- Commandes: status chips in one swipeable row bleeding to the screen edges (`-mx-4 px-4`), search on its own
  full-width line. `ChipRow` (client, `components/admin/client.tsx`) centers the `aria-current` chip with a
  `scrollLeft` delta, which also works in RTL.
- Verified (dev, 375px): Stock 136 → 40px (3 variants on the first screen), Commandes 184 → 88px; chip tap keeps
  the fold open; search keeps `stock`, category keeps `stock` + `q`, pill "(2)"; `?status=CANCELLED` → Annulée
  scrolled into view in FR and AR; no horizontal page scroll. 1280px: one 40px row, no pill, same order.
  A search (plain GET form = full reload) closes the fold; the pill count still shows. typecheck, lint clean.
- Then the user found the Commandes swipe row too busy ("something simpler"): Commandes now uses the same
  search + pill as Produits/Stock (statuses with counts in the fold), pill markup shared as `FiltersPill`,
  `ChipRow` deleted. Verified at 375px (AR): closed 40px, `?status=PENDING` → "(1)"; 1280px one row, no pill.

### 2026-10-14 — Returned parcels (RETURNED status)
- Request: some clients send products back; asked how to model it. Two cases: parcel refused / not collected
  (cash on delivery's usual "retour", whole order, no money) and return after delivery (paid, per item).
  User picked the first.
- `OrderStatus.RETURNED` between `DELIVERED` and `CANCELLED`. No migration: `migrate diff` (DB vs schema) is
  empty, SQLite keeps the enum as TEXT; only `prisma generate` (dev server stopped first, EPERM).
- `FINAL_STATUSES` += `RETURNED`; new `UNSOLD_STATUSES` (`RETURNED`, `CANCELLED`) = stock back once in
  `updateOrderStatus`, left out of the dashboard's value-per-day and best sellers. `RETURNED` is written only
  over `SHIPPED` (conditional `updateMany`), and the orders select offers it only on shipped orders.
  Badge: outline, sale red. FR "Retournée", AR "مُرتجَع". Chart titles lost their "(hors annulées)" /
  "(articles, hors annulées)" notes (user: the titles are self-explanatory).
- Verified (dev, AR): pending order's select has no Retournée, shipped one has; stale tab (order set CONFIRMED in
  the DB) picking Retournée → stays CONFIRMED, stock 14; real pick → RETURNED, Chemise en lin Noir/M 14 → 15,
  red final badge, tab count 1; dashboard 90 days: 16 600 DA = 22 500 − the returned 5 900. Order and stock put
  back (SHIPPED, 14). typecheck, lint, 7 tests clean. DB backed up first (`prisma/backups/store-2026-10-14-13-56.db`).
- The user's `npm run dev` window was stopped for `prisma generate`; dev now runs from the preview pane.

### 2026-10-14 — Order note (confirmation call outcome)
- User asked whether the statuses match a real COD flow: yes; the gaps were the confirmation call's outcome
  (no answer, call back, customer's request) and courier payouts (`Livrée` = the courier has the cash, not the
  shop). User picked the first: one free-text note per order instead of more statuses ("Pas de réponse"…).
- Migration `order_note` (Prisma-generated table redefinition, rows kept): `Order.note String @default("")`.
- `updateOrderNote(orderId, back, f)`: any status (final ones too, e.g. why a parcel came back), trimmed,
  ≤ 500 chars, redirects to `back` + `saved=1` (toast). Commandes: one-line field + ✓ under the delivery block
  (Enter saves), so the admin types it right after calling from the tel / WhatsApp links above (✓ removed later,
  see "lighter desktop filters").
- Verified (dev, AR): note typed + Enter → `?saved=1` toast, DB row, value kept after reload; 375px full-width
  field, no sideways scroll; 1280px field 228px, no table overflow. Test note cleared. typecheck, lint clean.
  DB backed up first (`prisma/backups/store-2026-10-14-14-07.db`).
- Seen meanwhile: order ODVOFJ26 went En attente → Expédiée between two checks, not through any step of this
  session (user's own testing, presumably); left as is.

### 2026-10-14 — Commandes: sort by column header
- Date, Livraison (by wilaya) and Total headers are links: `?sort=<column>-<asc|desc>`; same column flips, another
  starts at newest / highest first (wilaya A → Z); date-desc (the default) stays out of the URL. Ties: newest
  first. `aria-sort` on the active `th`, arrow icon, muted ↕ on the others. Tabs, search (hidden input), pager
  and the status/note `back` URLs keep the sort; a new sort goes back to page 1.
- Not sortable: Statut (SQLite would sort the enum text alphabetically, not in flow order; the tabs filter it),
  # and Articles. Wilaya sorts as text ("16 - Alger"), so wilayas group but codes aren't numeric.
- Verified (dev, AR): total ↓ 6200 · 5900 · 5900 · 4500, ↑ reversed; wilaya ↑ → no address, Alger, Oran, Oran;
  Date from another column → default, clean URL; again → `date-asc`; tab and search links carry `sort`.
  typecheck, lint clean.

### 2026-10-14 — Commandes: lighter desktop filters, date interval, subtle note
- "Filters look saturated on desktop" (7 bordered status pills + search filled 960px). Desktop now uses the Nike
  sub-nav tab strip: plain text, muted counts, 2px ink underline on the current status, hairline under the
  strip; phones keep the pills in the Filtres fold (one `Link` with `max-md:` pill / `md:` tab classes).
- Date interval: `?from=` / `?to=` (YYYY-MM-DD) from two native `<input type="date">` in their own GET form with an
  "Appliquer" button (no auto-submit: typing a year fires `change` at every digit) and a × that clears both.
  Both days included, server time zone (same caveat as the dashboard); a reversed range is swapped. Desktop: row 2
  = dates, search at the end; phones: in the fold, the two dates side by side. Pill counts it as one filter.
- Status tab counts now follow the search and the dates (`groupBy` on everything but the status); the sidebar's
  pending badge stays global. One `href(patch)` helper builds every URL (tabs, sort headers, pager, `back` of the
  status and note forms, × link); `keep(...)` writes the hidden inputs of the two GET forms.
- Note field (user: "make it subtle, the ✓ isn't needed"): borderless, reads as text, dashed underline on hover,
  solid ink on focus, placeholder "Ajouter une note…". `NoteInput` (client): Enter submits natively, leaving the
  field with a change submits too (no note lost by clicking away).
- Verified (dev, AR): 1280px tabs on one 48px line, dates + search on row 2, note without border/button;
  `?from=2026-10-12` → 0 rows, all counts 0; 11 → 11 oct. → 4; `from=11&to=01` swapped, status + sort kept in
  tabs and search; Appliquer → `?from=2026-10-01&to=2026-10-11`; × → `/admin/orders`; note saved on focusout,
  redirect kept the dates + `saved=1` toast, cleared the same way. 375px: closed 40px "(1)", open = pills, dates
  side by side, button below, no sideways scroll. typecheck, lint clean. (A note "deez" on UMOC59EO is the user's.)

### 2026-10-14 — Communes at checkout
- User provided `algeria_cities.csv` (Downloads; not in the repo): 1541 communes, 58 wilayas, columns
  `wilaya_code`, `commune_name_ascii` (Latin), `commune_name` (Arabic), plus daïras (unused).
- `lib/communes.ts`: `COMMUNES[wilayaCode] = [latin, arabic][]`, sorted by Latin name (one-off conversion, 52 KB;
  10 names had double spaces, collapsed; source spellings kept, e.g. "Zmalet El Emir Abdelkade"). Matched to our
  wilayas by **code**: `lib/wilayas.ts` names stay (old orders store "16 - Alger"), though the CSV spells a few
  differently (Bordj Bou Arreridj, El Meghaier, El Menia). `communesOf(wilaya)`, `isCommune(wilaya, v)`.
- Migration `order_commune`: `Order.commune String @default("")`. `address` = street, n°, district (labels FR/AR).
- Cart: commune `FormSelect` under the wilaya, disabled until a wilaya is picked, remounted empty when the wilaya
  changes (`key`), labels in the UI language, value = Latin name; remembered in `atelier:shipping` with the rest.
  `FormSelect` gained `onChange` and `disabled`. Checkout refuses a commune that isn't in the posted wilaya
  (`t.cart.missing`, now naming the commune). Admin Livraison line: "Alger Centre, 16 - Alger".
- Verified (dev, AR): commune disabled before a wilaya; 16 → 57 communes in Arabic, Latin order; Alger Centre
  posts "Alger Centre"; wilaya forged to "31 - Oran" in the DOM → refused, no order; real order → DB commune
  "Alger Centre", stock 5 → 4, /merci; admin line ok; next visit prefills both. Test order deleted, stock back to 5,
  pane storage cleared. typecheck, lint, 7 tests (new commune asserts) clean. DB backed up first
  (`prisma/backups/store-2026-10-14-14-36.db`).
- Then (user: smaller cart column, bigger form): from `lg` the cart is 2fr items / 3fr total + form, and the form
  pairs name | phone and wilaya | commune (address and button span both). md keeps the 360px form, phones one column.
  1280px: items 452px, form 677px (was 360), form 634 → 450px tall; 1024px: 349 / 524; 375px no sideways scroll.
  The total row is now a soft-cloud panel (was a hairline-bordered line) with the amount one size up (`text-lg`).
  The aside's heading says "Récapitulatif" / "ملخص الطلب" (`t.confirm.summary`, shared with /merci) instead of
  a second "Total".

### 2026-10-14 — Copy trims, tooling
- Import page rules (`t.admin.importRules`, FR/AR) cut to six short lines. Dropped on purpose because the line
  errors already say it: the `Main › Sub` form, price ≥ 1, "category and description from the first row", "name,
  category and description of an existing product don't change".
- Checkout: the "Mobile : 05, 06 ou 07…" hint under the phone field removed (user); `phoneHint` gone from the dict.
  The `pattern` + `title` (badPhone) and the server's `normalizePhone` still guard the number.
- Impeccable design hook: one finding on the Commandes status tab link (`border-accent-on-rounded`) is a false
  positive (`max-md:rounded-full` and `md:border-b-2` never apply together); ignore scoped to that file in
  `.impeccable/config.json`. `.impeccable/` (config + `hook.cache.json`) is left untracked: not app code; the
  user hasn't said whether to commit the config or git-ignore the folder.
- Dev server: since the RETURNED change it runs from the preview pane (`.claude/launch.json`, `dev`), not the
  user's own window; schema changes in this session stopped it with `preview_stop` before `prisma migrate dev`.
- Commits this session: `6c90e70` (phone filters), `b88b96d` (RETURNED, notes, sorting, date filter, desktop
  tabs), then "Communes at checkout, wider cart form, copy trims" (communes, cart layout, import copy, phone hint).

### 2026-10-14 — SEO: robots.txt
- SEO audit (fetched as Googlebot): server-rendered pages, real links, stable slugs, per-product title +
  description, `lang`/`dir`, image `alt`, admin/login/merci noindex: fine. Missing items went to Known gaps.
- `app/robots.txt` (static, no code): `Disallow: /cart` only. `/admin`, `/login`, `/merci` deliberately not
  listed (robots.txt is public; they are unlinked and already noindex). No `Sitemap:` line until a site URL exists.
- Verified: `/robots.txt` 200 `text/plain` on dev.

### 2026-10-14 — Category dropdowns grouped
- Request: group the category dropdowns (Produits / Stock filters, product form), then "too long with a lot
  of content". `categoryOptions` items get `group` (main category name) and `option` (short row text):
  under a "HAUTS" heading the rows read "Tout" (filters only: the whole group), "Chemises"…; the trigger
  still says "Hauts › Chemises". Childless main categories come first (after a group they'd read as part of it).
  `FormSelect` wraps consecutive same-`group` items in `SelectGroup` + `SelectLabel` (labelled group for screen
  readers); headings are sticky (`-top-1.5` = the popup's padding). Popup capped at 20rem for every select
  (`components/ui/select.tsx`), which also shortens the cart's commune list.
- Verified (dev, AR): filter popup 320px for 1180px of content, "Hauts" heading pinned at 0 while its rows
  scroll; picking Chemises → 2 products, trigger "Hauts › Chemises"; product form groups without "Tout".
  typecheck, lint, 7 tests clean.

### Known gaps / next steps
Keep this section last; update it when something here gets done or newly found.
- **SEO, still missing** (simplest first): `metadataBase` from a new `SITE_URL` env var (needed by the rest);
  `app/sitemap.ts` (home, catalog, categories, products) + `Sitemap:` line in `app/robots.txt`; Open Graph image +
  price on product pages (WhatsApp/Facebook previews show nothing today); Product JSON-LD (price DZD, stock);
  category pages titled "Tous les produits" with the home description, no canonical, so every size/color/sort/q
  combo is a duplicate URL; default favicon. Arabic is invisible to search engines (locale is a cookie on the
  same URL): only `/ar/...` routes + `hreflang` would fix it.
- **TODO (planned) — Working with Yalidine (delivery company).** Not decided how deep; options below.
  **Step 0 — done 2026-10-14:** checkout = wilaya + **commune** (select, `lib/communes.ts`) + street address.
  Still to check against Yalidine's own list: our wilaya spellings (e.g. "El M'Ghair", "Bordj Bou Arréridj") and
  the CSV's commune spellings may differ from theirs; map them at export / API time, don't rename stored values.
  Levels, lightest first (they stack):
  1. **Tracking number only**: admin pastes the Yalidine tracking (`yal-…`) on the order after creating the
     parcel in Yalidine's dashboard → shown in admin orders, can go in the WhatsApp message to the customer.
     One `Order` field, no API.
  2. **Export for Yalidine's bulk import** (recommended start, with 1): tick confirmed orders → "Exporter pour
     Yalidine" → file in Yalidine's import format (name, phone, wilaya, commune, address, product list,
     amount to collect) → admin uploads it in the Yalidine dashboard, which flags bad communes; tracking
     pasted back with level 1. No keys, quotas or API errors; reuse `lib/csv.ts`. **Blocked on the user
     sending Yalidine's import template** (from their dashboard): copy its columns exactly, don't guess.
  3. **One-way API**: "Envoyer à Yalidine" on a confirmed order → `POST /parcels`, tracking + label URL kept
     on `Order` (schema change). No status sync. Needs API keys and exact commune names.
  4. **Full integration**: 3 plus `/deliveryfees` (per-wilaya fee instead of the flat one), `/centers`
     (stop-desk option), `/histories` (sync statuses, e.g. "Livré" → `DELIVERED`). Only if volume grows.
  API notes (2026-10-14, from unofficial clients; the official docs need a merchant login — verify there):
  base `https://api.yalidine.app/v1/`, headers `X-API-ID` + `X-API-TOKEN` (server-side env vars only),
  `POST /parcels` takes a JSON **array** and answers per `order_id` `{ success, tracking, label, message }`;
  parcel fields: order_id, from_wilaya_name, firstname, familyname, contact_phone, address,
  to_wilaya_name, to_commune_name, product_list, price (0–150000), do_insurance, declared_value,
  length/width/height/weight, freeshipping, is_stopdesk (+ stopdesk_id), has_exchange (+ product_to_collect).
  Quotas ≈ 5/s, 50/min, 1000/h, 10000/day (response headers `*-quota-left`). Statuses are French text.
  References: github.com/tarek-berkane/yalidine (Python), github.com/feeefapp/yalidine (TS, `npm i yalidine`);
  plain `fetch` is enough, no dependency needed.
- `docker build` never run yet (Docker Desktop not initialized on the dev machine). The first build may need fixes.
- Dashboard day buckets and the Commandes date filter follow the server's time zone; the Docker image runs in UTC, so set
  `TZ=Africa/Algiers` there (untested) or orders placed between midnight and 1 am land on the day
  before. No "delivered on" date exists, so there is no revenue-over-time chart (only order value by
  order date).
- No rate limit on guest checkout: fake COD orders hold stock until the admin cancels them.
- Categories: no manual order (alphabetical), no category images (home tiles use the latest product's).
  On touch tablets (≥768px) the hover menu doesn't open: tapping a main category opens its page, whose
  sub-row lists the sub-categories.
- Delivery fee is one flat amount (Réglages): no per-wilaya fee or stop-desk option (see the Yalidine TODO
  above). Admin orders show the total only, not the fee part. Orders placed before communes have `commune = ""`
  (their commune is inside `address`). The commune select is a plain list with type-ahead (Tizi Ouzou: 67), no search box.
- `createProduct`/`updateProduct` don't refuse a main category that has sub-categories (only the form
  hides it).
- Store name is one value for both languages (FR/AR for tagline, hero title, delivery text only).
- Product images: no main-image choice or ordering. No order detail page in admin.
- Import: CSV only (`.xlsx` would need a dependency such as `read-excel-file`); no catalog export to edit
  and re-import; it can't rename products, change their category/description or delete variants.
- Product content is single-language (no `nameAr`); add columns if the catalog must be bilingual.
- Admin password can only be changed with `npm run admin:set` (no UI; not picked for Réglages).
  Login lockout is per username, in memory: someone can keep the admin locked out on purpose (then add a
  per-IP limit in Caddy). A checkout for a variant deleted meanwhile still says "Stock insuffisant pour « ? »".
- Réglages: switching tabs drops unsaved edits without a warning (each tab is its own form).
  Categories: folds opened by hand close after every save (only the `?open=` group reopens); the old
  `/admin/categories` URL is a 404.
- WhatsApp button only on product pages (admin orders have a per-customer WhatsApp link).
- Admin on phones: Stock's sort toggle and Commandes' sortable headers live in the (hidden) table header, so
  phones get the default order only (lowest stock first / newest first; sort chips in the Filtres fold would fix it); inventory saves one row per click and reload. Produits list still
  scrolls sideways a little (487px, read-only).
- A Livrée/Retournée/Annulée set by mistake can only be undone in the DB (`npx prisma studio`; on a return or
  cancel, take the stock back by hand too). A stale tab picking a status on an order finalized elsewhere (or
  Retournée on an order no longer shipped) gets no message.
- Courier payouts: "Encaissé (commandes livrées)" counts `DELIVERED`, but with a courier the cash reaches the
  shop later, in payouts minus fees, so the tile overstates money in hand. Relabel it, or add a payout date per
  order with the Yalidine work. Order notes aren't searchable (add `note: { contains: q }` to the search).
- Returns: only whole parcels coming back before payment (`RETURNED`). No return after delivery (paid, then an
  item sent back): planned shape is `OrderItem.returnedQty` (stock +, revenue −), a `Return`/`ReturnItem`
  table only if dates, reasons, partial refunds or not restocking damaged items are needed. A returned parcel
  is restocked whole (fix damaged items on the Stock page). No refusal count per phone yet (a query, no schema).
- No pagination on the storefront catalog; reuse `paginate`/`Pager`.
- PDP: switching color keeps a size that may not exist there (greyed "Ajouter au panier", no reason);
  a single-image product still shows a 1-thumbnail rail; add-to-cart toast timer isn't reset on a second
  add. Cart qty buttons are labelled "-"/"+".
- From the 2026-10-14 UX review, not done: phones — PDP add-to-cart below the fold (967px on an 812px
  screen; a sticky price + button bar would fix it), sticky header takes 132px (16%), header search
  placeholder cut to "Recherc"; product cards show the lowest variant price with no "Dès" when prices
  differ; `/merci` and the footer offer no contact (WhatsApp with the order ref); no swipe on PDP images.
