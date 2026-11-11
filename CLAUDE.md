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
| Next.js | 16.4.6 (App Router, Turbopack) | `proxy.ts` replaces `middleware.ts` (Next 16). 16.4.0–16.4.5 have critical advisories. |
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
npm run db:seed                      # admin; category tree + demo products only into an empty store
                                     # SEED_DEMO=0: categories only, no demo products (real store launch)
npm run typecheck && npm run lint && npm test
npm run build && npm start           # stop the dev server before building (both use .next/)
npm run admin:set -- USER PASSWORD   # create an admin or change a password
npm run db:backup                    # VACUUM INTO prisma/backups/
```

Deployment (Docker, HTTPS, backups, updates) and the full local test run are in `DEPLOY.md`; Google Cloud VM
setup (demo / staging) in `DEPLOY-GCP.md`.
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
  only writes to an open order (`RETURNED` only to a `SHIPPED` one), the order row shows no buttons on final orders (its status chip says it),
  and every button leading to a final status asks first (`ConfirmButton`, `t.admin.confirmFinal`).
  Status changes are **next-step buttons** (`stepsOf()` in the orders page): one main button for the usual next step
  (Confirmer → Expédier / Marquer prête → Marquer livrée / retirée), the rest in a "⋯" menu (`MoreMenu`, native
  `<details>`; its panel is portalled to `<body>` and fixed under the trigger so the table's overflow can't clip it;
  closes on outside click / Escape / scroll / a link click): back one step, Colis retourné / Jamais retirée, Annuler.
  Each is a submit button posting `status=<target>` to `updateOrderStatus`, with `form="status-<id>"` since the portal
  takes it out of the form in the DOM. No status dropdown any more.
  Stock is taken at checkout and given back once on cancel or return (`UNSOLD_STATUSES`) — only through
  `updateOrderStatus`. Revenue counts `DELIVERED` only; charts and best sellers leave `UNSOLD_STATUSES` out.
- **Writes** are Server Actions (`lib/actions/*`). Every admin action calls `requireAdmin()` itself;
  `proxy.ts` is only the first gate.
- **Admin feedback**: actions redirect with `?saved=1` or `?error=<key>` (a key of `t.admin`); `Notice`
  shows it as a bottom-end toast. Keep the page's own params in that redirect (settings `tab`, list
  filters, orders `back`, categories `open`), or the admin lands somewhere else after each save.
- **Commandes URL** (`/admin/orders`): `status`, `method` (`HOME|PICKUP|STOPDESK`), `q`, `sort` (`date|wilaya|total` +
  `-asc|-desc`, none = newest first; picked from a select, "date-desc" = none), `from` / `to` (YYYY-MM-DD), `page` (6 rows per page, 2 cards on phones: `PER_PAGE` / `PER_PAGE_PHONE`, user's call).
  Every tab, pager link and every `back` passed to the status / note / courier actions comes from `href(patch)` in the
  page; the GET forms carry the rest with `keep(...)`. A new param goes into `cur` there, or saves and tab switches drop it.
  Layout (from the 2026-11-10 mockup): status tab strip, then search · period segments (Tout / Aujourd'hui / 7 j / 30 j /
  Personnalisé… = the two date fields in a popover) · method · sort, then a bordered **table** from `lg` (`cols` in the
  page: Commande = status chip + ref · Client = name, phone + WhatsApp, note line · Livraison = method · place,
  courier state chip (the parcel number until the first check) · Articles (the piece count only, "n article(s)"; names in the panel) · Total · Actions = next-step
  button, ⋯, chevron), 6 per page, and the same rows as **cards** below `lg` (2 per page, phone sniffed from the headers like Stock). The
  chevron (`RowToggle`, context from `OrderRow` in `components/admin/client.tsx`) opens a details panel under the row:
  Livraison (address, parcel number + courier + `CopyButton` + refresh, 4-step timeline whose "Expédiée" step carries the
  courier's own state + check date as its sub-label; trouble states amber), Articles (itemised, sous-total /
  livraison / total), Note (`NoteInput`). The status chip is solid in its colour with an icon (`StatusChip`); tabs keep the
  bare `TONE` dot. Footer: "1–6 sur 16" + `Pager`. Not built from the mockup: checkboxes / bulk actions, Exporter, Imprimer,
  "Action requise", the history log (no data behind them).
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
  managed in Réglages › Catégories (`/admin/settings/categories`): one soft-cloud card per main category with its
  sub-categories listed inside, product count per row (eye icon = 0 = hidden in the shop). Read-only until "Modifier"
  (`?edit=1`): names become inline fields (`NoteInput`: Enter or blur saves), empty ones get a trash icon, each card an
  "Ajouter une sous-catégorie…" field, and a field on top adds a main category. Rows rename only; the parent is the card.
  The actions still append `?open=<main id>` (unused since the folds went).
  Navbar (from `lg`) = "Tout" + main categories, sub-categories in a CSS hover/focus menu; how many fit is set per
  breakpoint (`SHOWN` in `components/store/header.tsx`: 2 from lg, 4 from xl, 6 from 2xl), the rest under "Plus".
  Below `lg`: a menu button (`MenuDrawer`, native `<details>`) opens every category, mains folding open their subs.
  `?category=<slug>` on a main category includes its sub-categories (storefront `inCategory`, admin
  `OR: [{ id }, { parentId }]`). The shop lists only categories with products (`SHOWN_CATEGORY`).
  Slugs follow the product rule (from the name, never changed). Delete only when no products and no
  sub-categories. Admin selects use `categoryOptions()` ("Hauts › Chemises"); the product form passes
  `leaves = true`: a main category with sub-categories is a group, not offered for a product.
- **SEO / link previews** (`lib/site.ts`, server-only): `siteUrl()` = `SITE_URL` env or the request's host, used as
  `metadataBase` (root layout) and by `app/sitemap.ts` / `app/robots.ts`; `ogImage(url)` = an upload through `/_next/image`
  (raw for `.svg`). The root layout sets the Open Graph defaults; a page that needs its own card sets `openGraph` whole (Next
  replaces, never merges, nested `openGraph`). Every indexable page sets `alternates.canonical` without its facet / sort /
  search params (catalog: `/products?category=<slug>`); product pages carry a schema.org `Product` JSON-LD. `/admin`,
  `/login`, `/merci` stay `noindex` and out of robots / sitemap.
- **Public pages don't look orders up**: `/merci` shows the summary from `sessionStorage` only;
  never fetch an order by URL param (anyone can open the URL).
- **Browser storage keys are namespaced** `atelier:*` (`atelier:cart`, `atelier:shipping`,
  `atelier:last-order`): localStorage is per origin, and the other local projects on
  localhost:3000 use `cart` too. Bump the cart `version` if `CartItem` changes shape.
  `atelier:shipping` = the whole checkout form incl. `method` and `stopDeskId` (merged on save, so a pickup
  order keeps the saved address); `atelier:last-order` = `{ ref, total, fee, method, pickup?, desk?, items }`.
- **Réglages** (`/admin/settings`, model `Settings`, single row `id = 1` inserted by its migration):
  store name, WhatsApp number, FR/AR tagline, shop address as wilaya › commune › street (`storeWilaya` "16 - Alger",
  `storeCommune` Latin name checked with `isCommune`, `storeAddress`; `storePlace()` in `lib/wilayas.ts` joins them in the
  UI language for the cart's pickup line and the home page), opening hours (`storeHoursFr` / `storeHoursAr`, a FR/AR
  `pair()`, shown under the address on the home page and on the pickup line; the other language when one is empty), GPS position (`storeLat` / `storeLng`, pasted as one
  "36.7538, 3.0588" field; null = no map), low-stock threshold (debug) (Boutique); FR/AR hero title,
  hero image, Instagram / Facebook / TikTok (`social()` in `lib/actions/admin.ts`: a link or a handle,
  stored as an http(s) URL, anything else `?error=badSocial`; footer links) (Page d'accueil); Livraison = full width, three columns from `xl` (form 16rem, the two lists share the rest; two
  from `lg`, the third wraps under the first; phones stack): the save form (pickup / stop-desk switches; **in debug** also the FR/AR delivery text, the courier
  picker, its credentials, origin wilaya and the "Charger la grille…" button), the per-wilaya tariff (`?fp=`, 10 rows per
  page, `updateWilayaFees` writes only the rows posted) and the relay points (`StopDesk`, add form + list, `?dp=`,
  `DESK_PAGE` = 10; add lands on the new point's page, delete stays on its page). Every grid that stacks on phones
  needs `grid-cols-1`: an implicit track sizes to its content and overflows the screen. Tabs (`SettingsNav` in `components/admin/fields.tsx`): Boutique · Page
  d'accueil · Livraison are `?tab=` on the same page, one short form each; `updateSettings(tab, f)` writes only the
  fields the form posted (`f.has`), so a new setting goes in exactly one tab, and a checkbox needs a hidden `""` twin +
  `f.getAll(k).includes("on")`.
- **Debug mode** (Odoo-style, `lib/debug.ts`): `?debug=1` on any admin URL turns it on, `?debug=0` (or the "debug ×"
  badge on the Réglages title) turns it off; `proxy.ts` keeps it in an httpOnly `debug` cookie (path `/admin`) with one
  redirect to the same URL. **Réglages exists only in debug mode**: its menu entry is hidden and `/admin/settings*` is a
  404 outside it (`isDebug(sp)` + `notFound()`); the empty-catalog link to Catégories also needs it. Not a security
  boundary (any admin can type `?debug=1`): it hides the technical setup from the shop's everyday admin. Inside, the
  `debug && (...)` gates below still exist (harmless now that the page needs debug). In debug Réglages shows technical fields: the whole courier block (picker incl.
  the "Sandbox" entry, credentials, origin wilaya, Yalidine defaults button), the relay point `deskId` field and the
  `#id` tags, the FR/AR "Livraison et retours" text, the "Stock faible" threshold (Boutique). `SettingsNav debug` keeps it on every tab link; the settings actions keep it across saves by reading the
  `referer` (`debugQ()` in `lib/actions/admin.ts`), so no hidden input is needed. Gate a field with `debug && (...)`.
  Outside debug the save form doesn't post `courier`, so the saved courier stays.
  Catégories is its own route, listed in the same tab row (`SettingsTab`). Read with `getSettings()`
  (`lib/i18n.ts`, React `cache` = one query per request). Empty text = dictionary default. Never hard-code the
  "Stock faible" `3` again: use `lowStock`. No loose explanatory text on Réglages: every explanation is a `hint`
  (help icon); the FR/AR `pair()` fields carry `settingsHint` ("empty = default") on their first field.
- **Wilaya + commune**: `lib/wilayas.ts` (58 wilayas, value `"16 - Alger"`) and `lib/communes.ts` (1541 communes,
  generated from dzship's `GET /v1/communes`, keyed by wilaya **code**, `[latin, arabic]`; the Latin name is exactly what
  the courier gateway expects). A French spelling people should read differently goes in `COMMUNE_LABELS`
  (`communeLabel()`, `lib/wilayas.ts`: "Douira" shown "Douera"); every FR commune label goes through it, the value never changes. Orders store the commune's Latin name; labels
  follow the UI language. `checkout` refuses a commune outside the posted wilaya (`isCommune`). Never rename stored
  wilaya values: map spellings to a courier's list (Yalidine) at export / API time.
- **Delivery fee**: per destination wilaya and method, model `WilayaFee { wilaya, home, desk }` (one row per wilaya,
  table in Réglages › Livraison, `updateWilayaFees` upserts all 58). Nothing is seeded (the tariff is the courier's):
  a missing row = 0 = free. When the saved courier is Yalidine or a sister network, Réglages › Livraison (debug) shows
  "Charger la grille tarifaire et les agences Yalidine" (`loadCourierDefaults`: `data/yalidine-fees.csv` +
  `data/yalidine-desks.csv` parsed by `lib/defaults.ts`; the 2019 wilayas take their former parent's tariff; replaces
  every tariff row, adds the agencies missing by `deskId`). Other couriers type their tariff. `checkout` re-reads it (never from the client); the cart gets `fees[wilaya] = [home, desk]` and shows
  the fee as the wilaya changes. `Order.totalAmount` = items + `Order.shippingFee` (the fee at checkout time);
  revenue includes it. No flat fee any more.
- **Delivery method** (`Order.method`, enum `DeliveryMethod`): `HOME` (courier, address, flat fee), `PICKUP` (collected
  at the shop: name + phone only, `wilaya`/`commune`/`address` = `""`, fee 0) or `STOPDESK` (Yalidine relay point:
  `Order.stopDeskId` → `StopDesk` row, `wilaya` = the point's, `address` = "name — address" copied as text, fee = the
  point's `fee`; `onDelete: SetNull`, so deleting a point keeps the order readable). Pickup is offered while
  `Settings.pickupEnabled` (checkbox, Réglages › Livraison) is on; the address shown with it is `Settings.storeAddress`
  (Réglages › Boutique, optional). Stop-desk is offered while `Settings.stopdeskEnabled` is on **and** a `StopDesk` row exists (Réglages ›
  Livraison: wilaya, name, commune, address, the point's id at the courier, typed in, or Yalidine's 200 agencies
  loaded by the button above when Yalidine is the courier; folded per wilaya in the admin; commune + `deskId` are what
  the API needs to route a parcel there; the fee is the wilaya's `WilayaFee.desk`, not per point). The cart shows the method tiles only when more than one method is offered; the
  customer's last method is saved in `atelier:shipping` and falls back to the first offered method if no longer offered.
  `HOME` is a switch too (`Settings.homeEnabled`, default on): `updateSettings` refuses the Livraison form with all three
  methods off (`?error=noMethod`). `checkout`
  derives wilaya/address/fee from the desk row, never from the client. Statuses are shared: on a pickup order the
  admin labels `SHIPPED` "Prête en boutique", `DELIVERED` "Retirée", `RETURNED` "Non retirée" (`statusLabel()` in the
  orders page; tabs and the dashboard keep the generic names).
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
- **Admin field hints** are help icons, never a muted line under the field: `Field hint="…"` or `<Help text="…" />`
  (`components/admin/fields.tsx`): hover / focus bubble on desktop, tap → bottom bar below `md`. Only a short general
  note may stay as text (Réglages has none).
- **Courier API** (`lib/courier.ts`, catalog `lib/couriers.ts`): the shop picks **one** delivery company in Réglages ›
  Livraison, debug mode only (`Settings.courier` = a key of `COURIERS`, 99 Algerian couriers with their credential field names,
  generated from dzship's `GET /v1/couriers`; `courierKeys` = JSON of those fields; `courierFromWilaya`, required by
  the Yalidine family). Once `courierReady(settings)`, Commandes shows "Envoyer à <courier>" on open home / relay
  orders → `sendToCourier(orderId, back)` creates the parcel through **dzship** (`https://freeship.dzbuild.com/v1/orders`:
  free gateway, one request shape for every courier; the shop's credentials travel in each call and are not stored,
  per its docs), keeps `Order.courier` + `tracking` + `labelUrl`, leaves the status to the admin. `codAmount =
  totalAmount` with `freeShipping: true` (the customer pays exactly the total they saw; the shop pays the courier's
  fee out of it). The order is claimed (`tracking = "…"`, conditional `updateMany`) before the call, so a double
  click can't create two parcels; a refusal clears it and shows the gateway's message in the toast
  (`?error=courierRefused&detail=…`, `Notice` renders `detail` under the dictionary line). Pickup and final orders
  never get the button; a relay order needs its point's `commune` (`?error=courierDesk`), the point's `deskId` is sent
  when set. The courier picker is a GET form (`?tab=courier&courier=<key>` re-renders that courier's credential
  fields, password inputs: empty = keep the stored value; "— Aucun" = feature off). "Sandbox" in the list tests the
  flow without creating anything. **Parcel options** (Réglages › Livraison, debug, under the courier fields):
  `parcelOpenable` → `hasOpenPackage`, `parcelInsured` → `declaredValue = totalAmount`, `parcelWeightKg` (0 = not sent)
  → `weightKg`; `parcelFor(order, settings)` adds them. **Tracking**: a sent order's card shows the parcel's last courier status and "Actualiser
  le suivi" (`trackOrder` → `trackParcel()` = dzship `POST /v1/track`; kept in `Order.courierStatus` (dzship's vocabulary,
  labels `t.courierStatus`), `courierRaw` (courier wording, shown for `unknown`), `courierCheckedAt`). The order moves
  forward by `statusSteps()` (`lib/courier.ts`, unit-tested): on its way → `SHIPPED`, delivered → `DELIVERED`, returned →
  `RETURNED` via `SHIPPED`, through the same `moveStatus` as a manual change (stock back once); cancelled / lost / on_hold
  change nothing. Only for the courier saved in Réglages (`?error=courierOther` otherwise) and open orders. The logic
  lives in `lib/tracking.ts` (`syncOrder`, `syncAll`, `moveStatus`, `trackable`; no Next imports) and runs three ways:
  the per-card refresh, "Tout actualiser" on Commandes (`trackAll`, toast "n colis vérifiés, m commandes avancées"),
  and `npm run track:sync` (`scripts/track.mts`) from the server's cron (DEPLOY.md §5: every 2 h, 8:00–22:00; skips
  parcels checked within `TRACK_MIN_AGE_MIN`, default 60; sequential with a pause, ≤ 200 per run). Switching to a courier's own API later = `createParcel()` only.

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
- Pagination: 7 products / 8 variants per page on desktop, 5 / 3 on phones (`PER_PAGE` / `PER_PAGE_PHONE` at the top of each page, phone sniffed from the headers),
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
  orders by status in enum order (horizontal bars; replaced 2026-11-10 by the top wilayas), top 5 products by quantity excluding cancelled.
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
- `app/robots.txt` (static, no code; → `app/robots.ts` on 2026-11-11): `Disallow: /cart` only. `/admin`, `/login`, `/merci` deliberately not
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

### 2026-10-21 — Checkout rate limit, group-category check, Docker TZ
- `checkout`: in-memory per-IP limit (10 attempts / 10 min, failed ones count; IP from `x-forwarded-for`, so
  Caddy must set it), `t.errors.tooMany`. A restart clears it. Not browser-tested.
- `createProduct` refuses a main category that has sub-categories (`?error=catGroup`); `updateProduct` refuses
  moving onto one but lets a product already on a group keep it.
- Dockerfile: `TZ=Africa/Algiers` (dashboard day buckets, date filter). Docker build still not run.
- typecheck, lint, 7 tests clean.

### 2026-11-09 — Seed without demo products (`SEED_DEMO=0`)
- Request: "launch without demo data". The seed now reads `SEED_DEMO`: `0` / `false` / `no` → admin + the men's
  category tree only (the tree is the real store's, not demo), no demo products and no placeholder SVGs. Default
  unchanged (3 demo products). Still only into an empty store, so it matters on the first start only.
  Documented in `.env.example`, `DEPLOY.md` (0.2 reset recipe, start sequence, env table, `/srv/atelier.env`).
- Verified on scratch DBs (`migrate deploy` + seed twice): `SEED_DEMO=0` → 1 user, 23 categories (6 main), 0
  products, 0 images; default → 3 products, 29 variants, 8 images; second run "Catalogue déjà rempli" both times.
- Local `prisma/dev.db` then reset with `SEED_DEMO=0` (on the user's explicit go-ahead; Prisma also wanted
  `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`), `public/uploads/seed-*.svg` deleted. The old data (4 test
  orders, 4 products) is in `prisma/backups/store-2026-11-09-12-35.db`. The user then added their first real
  product (Hoodie La Martina) and renamed the store "Le Repère" in Réglages.

### 2026-11-09 — PDP image capped on desktop
- "Product image too big on desktop": at 1440px the gallery column got ~900px (square image 824px). The PDP grid
  (`components/store/product-view.tsx`) is now `mx-auto max-w-[1100px]`: image 580px, info column still 400px;
  `sizes` hint `600px` above `md`. Phones unchanged. Verified at 1440px with a temp product (deleted after).

### 2026-11-09 — Hosting notes (no code)
- Questions answered in chat, kept here for the deploy: the app needs a Linux VPS (long-running Node + writable
  disk for SQLite and uploads); shared cPanel/PHP plans can't run it, a CloudLinux cPanel plan with Node 22 +
  Terminal can but with a 1 GB RAM cap (build elsewhere, Passenger cold starts). Algerian VPS offers (Icosnet,
  Hostarts, Ayrade, Octenium, Algérie Télécom, ~2 400–5 000 DA/month, CIB/Edahabia) fit; a 4 vCPU / 8 GB one also
  runs a small Odoo. Loi 18-05 (e-commerce) requires a registre du commerce and a site "hébergé en Algérie" under
  `.com.dz`; loi 18-07 covers the customer data. The user's client is a physical shop (has an RC), so local VPS +
  `.com.dz` is the path; add the e-commerce activity to the RC at the CNRC.

### 2026-11-09 — Store pickup ("Retrait en boutique")
- Request: other "expedition methods", first of all collecting the order at the physical shop. Migration
  `delivery_method`: `enum DeliveryMethod { HOME, PICKUP }`, `Order.method @default(HOME)`, `Settings.pickupAddress`
  (≤ 200 chars, textarea in Réglages › Livraison; empty = pickup not offered, so the feature is a setting, no flag).
- Cart: when pickup is offered, two radio tiles (Livraison à domicile / Retrait en boutique) under the heading
  "Mode de réception"; pickup hides wilaya, commune and address (unmounted, so `required` doesn't block), shows the
  shop address, fee line reads "Retrait en boutique · Gratuite", footnote "Paiement en boutique au retrait…". The
  choice is saved in `atelier:shipping` with the rest (merged, so a saved address survives a pickup order).
  `checkout(lines, fee, shipping)`: `shipping.method`; pickup = fee 0 (compared like the flat fee), name + phone
  only (`t.cart.missingPickup`). `/merci` summary (`atelier:last-order` + `method`, `pickup`) shows the address.
  `t.confirm.call` now says "confirmer votre commande" (was "la livraison").
- Admin Commandes: the Livraison cell shows name, phone links and a "Retrait en boutique" badge instead of the
  address (guard is now `o.fullName`, not `o.wilaya`); the status select labels Expédiée "Prête en boutique" on
  pickup orders. No method filter yet.
- Verified (dev, 1024px): fee 400 + address saved in Réglages → cart defaults to home (400 DA), pickup tile →
  fields collapse, "Gratuite", total 4 500; order → `/merci` with the address line; DB row `method PICKUP`,
  `shippingFee 0`, empty wilaya/commune/address; admin badge + select items "En attente · Confirmée · Prête en
  boutique · Livrée · Annulée". Test order + product deleted, fee and address reset to 0 / "". typecheck, lint,
  7 tests clean. Dev server was stopped (preview pane) for the migration.

### 2026-11-09 — Stop-desk (Yalidine relay points)
- Second method, picked by the user after pickup. Yalidine's `/centers` + `/deliveryfees` need merchant API keys we
  don't have, so the points are a small admin table: migration `stop_desk` = `StopDesk { wilaya, name, address, fee,
  yalidineId? }`, `DeliveryMethod.STOPDESK`, `Order.stopDeskId?` (SetNull). New Réglages tab **Points relais**
  (`/admin/settings/desks`, `SettingsTab` + nav entry in `components/admin/fields.tsx`): add form (wilaya select, name,
  address, fee) + `Table stack` list with delete; actions `createStopDesk` / `deleteStopDesk` (`?saved=1`).
- Cart: a third tile "Point relais" when desks exist (grid 2 or 3 columns); its form = wilaya (only wilayas with a
  point) → point (`FormSelect` rows "name — address · fee", trigger = name) → name + phone. Fee line "Point relais ·
  350 DA" ("—" until a point is picked). `checkout`: `stopDeskId` → desk row or `t.cart.missingDesk`; fee compared
  against the desk's, `address` = "name — address". `/merci` gets `desk` in `atelier:last-order`. Admin Commandes:
  "Point relais" badge above the wilaya + desk text.
- Verified (dev, pane hidden → DOM-driven): two points added (Alger 350, Oran 450), cart primed with a saved STOPDESK
  choice → "Point relais 350 DA", total 4 850, both selects prefilled → order → `/merci` with the point line → DB
  `STOPDESK`, fee 350, wilaya "16 - Alger", address "Yalidine Alger Centre — 5 rue…" → admin badge. Real clicks on the
  selects not exercised this time (pane hidden); the same `FormSelect` is used everywhere else. Test order, product
  and both points deleted. typecheck, lint, 7 tests clean.

### 2026-11-09 — Method switches, store address on the Boutique tab
- User: the address belongs to the shop (Boutique tab), and each method should be a plain on/off. Migration
  `method_flags`: `Settings.pickupAddress` → `storeAddress` (Boutique tab, textarea, optional), `pickupEnabled` and
  `stopdeskEnabled` (Livraison tab, native checkboxes with a hidden `""` twin so `updateSettings`' `has` filter sees
  the key when unchecked: `f.getAll(k).includes("on")`). `CartView` takes `pickup: boolean` + `storeAddress`; the
  address line under the pickup tile shows only when set; the cart page passes `desks` only when `stopdeskEnabled`.
  `checkout` refuses a method that was switched off meanwhile (same path as a fee change).
  `prisma migrate dev` refused the column rename non-interactively (drop = "data loss", the column was empty), so the
  migration SQL was generated with `migrate diff --from-schema-datasource --to-schema-datamodel --script` into a
  hand-named folder, then applied with `migrate dev`; `migrate diff` is empty afterwards.
- Verified (dev, DOM-driven): Boutique tab shows "Adresse de la boutique"; Livraison shows both checkboxes; pickup on →
  DB `pickupEnabled true`, cart with an item shows the two tiles and no address line (address empty); pickup off →
  DB `false` (the hidden twin keeps the key). Both flags left off, address empty. typecheck, lint, 7 tests clean.

### 2026-11-09 — Settings hints as help icons
- User: the long hint lines under the Réglages fields should be a help icon (hover on desktop, tap on phones).
  `Help` (`components/admin/fields.tsx`): a `CircleHelp` button next to the label, tooltip `role="tooltip"` shown with
  `group-hover` / `group-focus-within` (a tap gives the button hover or focus on phones; iOS keeps the hover state until
  the next tap). Desktop: 16rem ink bubble below the icon; below `md`: a bar fixed at the bottom of the screen, so it
  never overflows. `Field`'s `hint` now renders the icon; the two Livraison checkboxes use `Help` inline. The one
  general line "Un champ laissé vide reprend le texte par défaut" stays as text. No dependency added.

### 2026-11-10 — Yalidine API (via dzship), Réglages refactor, sticky admin sidebar
- User attached `dzship-1.2.0.zip` ("this api of yalidine"): it is **not** Yalidine's API but DZBuild's free gateway
  (`freeship.dzbuild.com`, MIT docs + clients, proprietary hosted service) in front of 99 Algerian couriers; the shop's
  Yalidine API ID + token are sent with every call ("never stored"). Built on it as asked; plain `fetch`, no dependency
  (the npm client is a thin wrapper). Migration `yalidine_api`: `Order.tracking` / `labelUrl`, `StopDesk.commune`,
  `Settings.yalidineApiId` / `yalidineApiToken` / `yalidineFromWilaya`. See the Yalidine convention above.
- Token field is `type="password"`, shown empty: empty = keep the stored one; clearing the API ID switches the
  feature off. Keys live in the DB with the rest of Réglages (not env): the admin sets them without server access.
- Verified (dev, user's own server on :3000, pane hidden → DOM-driven; `YALIDINE_COURIER=sandbox` in a temp `.env`
  line): keys saved; test order (DB-created: hydration stalls in the hidden pane, so the cart can't be driven there)
  with phone `0123` → toast "Yalidine a refusé le colis : Request validation failed — phone: String must contain at
  least 9 character(s)", `tracking` back to `""`, button still there; phone fixed → `DZTEST-J8A0E4` on the order,
  `?status=CONFIRMED&saved=1` kept, button gone (sandbox returns no label, so no "Étiquette" link). Test order deleted,
  stock 0 → 1, keys cleared, env line removed. A real Yalidine key was not available: first real send should be
  watched (commune spellings, `labelUrl`).
- **Réglages refactor** (user: ambiguity, redundancy, loose text): 7 tabs → 5. Points relais moved into the Yalidine
  (now Transporteur) tab (the keys form, then the points' add form + list; `/admin/settings/desks` deleted, `DESKS` redirects to
  `?tab=yalidine`); "Stock faible" (one number, clashed with the sidebar's "Stock") moved into Boutique. The repeated
  "Un champ laissé vide…" line (3 tabs) is now `settingsHint` on each FR/AR pair's first help icon; the desks,
  categories and Yalidine intro paragraphs became help icons (`deskFeeHint`, `categoriesHint` on "Catégorie parente",
  `yalidineHint` on "API ID"); the long "Texte « Livraison et retours » (fiches produit, pied de page)" label is
  short + `shippingTextHint`. `desksHint` deleted. Verified: 5 tabs, no `p.text-mute` left on the tabs, 6 help icons
  on Yalidine, a relay point added and deleted from the new tab.
- **Any courier, not just Yalidine** (user): dzship's request is the same for its 99 couriers, only the `courier`
  key and the credential field names differ. `lib/yalidine.ts` → `lib/courier.ts` + a static catalog `lib/couriers.ts`
  (generated from `GET /v1/couriers`: key, name, platform, credentials; the generic "ecotrack" entry left out).
  Migration `courier` (hand-generated with `migrate diff`, Prisma refuses column drops non-interactively):
  `Settings.yalidine*` → `courier` / `courierKeys` (JSON) / `courierFromWilaya`, `Order.courier`, `StopDesk.yalidineId Int?`
  → `deskId String`. Tab "Yalidine" → "Transporteur": courier picker (GET form, `autoSubmit`, platforms with several
  networks grouped: YALIDINE, ECOTRACK), the picked courier's fields, origin wilaya (`required` for the Yalidine
  family only), then the relay points. `YALIDINE_COURIER` env dropped: "Sandbox" is an entry of the picker. Strings
  renamed (`sCourier`, `courierHint`, `sendCourier` "Envoyer à {courier}"…). typecheck, lint, 10 tests clean.
  The user's own dev server kept the old Prisma client after the migration (500 "column Settings.yalidineApiId does
  not exist"; stopping it from here was not allowed), the user stopped it and dev now runs from the preview pane.
  Verified then (DOM-driven): picker Yalidine → `?courier=yalidine`, two password fields, wilaya `required`; save →
  `courierKeys` `{"apiId":"test-id","apiToken":"test-token"}`, dots placeholders; empty re-save keeps the keys;
  Sandbox → no fields, wilaya optional; order row "Envoyer à Sandbox (test courier)" → "Sandbox (test courier)
  DZTEST-1HUWTD", `Order.courier = "sandbox"`; "— Aucun" saved → courier "", keys "". Found and fixed: the picker's
  "none" item must not use value `""` (FormSelect shows an empty trigger for it) → sentinel `"none"`.
  Test order deleted, stock back to 1, settings cleared.
- **Yalidine's tariff and agencies as defaults** (user pasted both lists: 48 destinations with home / stop-desk /
  return fees, 200 stop desks with ids). Kept as given in `prisma/yalidine-fees.csv` and `prisma/yalidine-desks.csv`
  (copied to `/app/db` by the Dockerfile), parsed by `lib/defaults.ts` (`parseFees`, `parseDesks`, `wilayaFor`:
  courier spellings → our "16 - Alger" values without accents / case; "El Menia" → El Meniaa; the 10 wilayas of 2019
  take their former parent's tariff; a few desk addresses hold an unquoted comma → address = every column between Nom
  and GPS). Migration `wilaya_fees`: new `WilayaFee { wilaya @id, home, desk }`, `Settings.deliveryFee` and
  `StopDesk.fee` dropped (the fee is the wilaya's, not the point's). Seed fills each table only when empty (admin
  edits survive restarts); the user's hand-typed test point "Yalidine Draria" was deleted so the 200 agencies could
  seed. Réglages › Livraison: the flat fee field is gone, a 58-row table (home / relay inputs, `updateWilayaFees`
  upserts all) sits under the short form; Transporteur: points folded per wilaya (55 folds), no fee column. Cart:
  `fees[wilaya] = [home, desk]`, the fee line follows the wilaya; `checkout` reads `WilayaFee` by the destination.
  "Tarif retour" and "Délai" columns are not used (no return accounting, no delay shown).
- Verified (dev from the preview pane): seed → 58 tariffs (Alger 500 / 450, Timimoun 1450 / 1150 from Adrar), 200
  points (Annaba row with the unquoted comma: "Champs de Mars Numéro N°3, Annaba", id 230102); Livraison table 58
  rows, Alger 500 → 550 saved then restored; Transporteur 55 folds, Alger 26 points; cart with a planted item: Oran
  → 850 DA, picking 16 - Alger in the select → 500 DA. typecheck, lint, 12 tests clean.
- Then (user: "those fees are Yalidine's, not every courier's"): the seed no longer fills either table. The CSVs moved
  to `data/` (read at runtime from `process.cwd()`, so they are in the image, not in the `/app/db` copy), and
  `loadCourierDefaults` + a button on Transporteur, shown only when the **saved** courier's platform is `yalidine`,
  loads them on demand (tariff rows replaced, agencies added by `deskId`, confirm first). A store on another courier
  starts with an empty tariff (= free until typed) and no points. The local DB keeps the already loaded data.
- **Admin sidebar** (user: had to scroll to reach "Voir la boutique" / logout): the aside stretched to the page height
  with `md:mt-auto` pushing those links to its end. Now `md:sticky md:top-0 md:h-dvh md:overflow-y-auto`: 768px tall
  in a 768px viewport, logout at 720px on an 855px page. Phones unchanged (`contents`).

### 2026-11-10 — Debug mode, Transporteur merged into Livraison, two-column layout
- `?debug=1` on Réglages (user: "like Odoo"): see the Debug mode convention. Badge "debug" next to the title.
- Transporteur tab gone (user: "combine livraison and transporteur"): `SETTINGS_TABS` = store · home · delivery;
  `?tab=courier` falls back to Boutique. Then (user) the courier block became debug-only: a shop sets its courier once.
- Livraison first got two `<details>` folds (tariff, points), then (user: "a lot of vertical scrolling", "2 horizontal
  divs … with pagination", then "still need to scroll to the points") the column layout: form | tariff | points side
  by side from `xl`, tariff 10 rows per page (`?fp=`, the action upserts only the posted rows — a paged form must never
  zero the rows it doesn't show) and relay points 10 per page (`?dp=`, compact rows "name / wilaya · commune · address",
  delete bound to the current page). The per-wilaya select tried in between came back later as a filter over the pager. `url(patch)` in the page
  builds every pager link (keeps `tab`, `debug`, `fp`, `dp`). Help icons removed from the two method checkboxes, the
  delivery text pair (`pair(..., null)` = no icon) and the tariff heading (user).
- Verified (dev, user's own server on :3000, pane hidden → DOM-driven): debug badge + nav links + hidden picker input;
  save with `debug=1` → `?tab=delivery&debug=1&saved=1` (referer); no debug → no picker, no `courier` hidden input,
  no deskId field / tags; `?courier=sandbox` still shows its trigger; pagers 1/6 and 3/20 with links carrying both
  pages; `?dp=3` lists Béjaïa; 375px: no sideways scroll (`grid-cols-1` needed: an implicit grid track sizes to
  content). A wilaya `FormSelect` read right after navigation showed its placeholder: it was pre-hydration, after 2 s
  it read "16 - Alger · 26" — wait before reading a Select's trigger in the hidden pane.

### 2026-11-10 — Home delivery is a switch too
- User: "livraison à domicile should also be chosen in Modes de réception". Migration `home_enabled`:
  `Settings.homeEnabled Boolean @default(true)`. Third checkbox (first in the list) on Livraison; `updateSettings`
  refuses all three off (`noMethod`); cart builds `methods` from the three flags and falls back to `methods[0]`;
  `checkout` refuses `HOME` when off (same `priceChanged` path as the other two).
- Gotcha: `prisma migrate dev` applied the SQL, then failed on `prisma generate` (EPERM, the user's dev server holds the
  engine dll). Its folder **was** created (`…091531_home_enabled`), but with a UTC timestamp that sorted *before*
  `…092116_wilaya_fees` (hand-named earlier), so `ls | tail` hid it and a second, hand-written `ADD COLUMN` migration
  was wrongly added and resolved: a fresh DB would have hit "duplicate column". Fixed by renaming the real folder to
  `…092500_home_enabled` (between wilaya_fees and store_place, since store_place's RedefineTables copies `homeEnabled`),
  updating its `_prisma_migrations` row, deleting the duplicate + its row, and replaying every migration on a scratch
  DB (`DATABASE_URL=file:./scratch.db prisma migrate deploy`: all applied, columns present). Lessons: `ls` the whole
  folder, not `tail`; on Windows with a dev server running use `migrate dev --skip-generate`, then `prisma generate`
  once the server is stopped.
- The user's own `npm run dev` was stopped (with their OK) for `prisma generate`; dev runs from the preview pane again.
  Verified (DOM-driven): three boxes checked by default; all three off → `?error=noMethod`, flags unchanged; home off →
  cart (planted item) shows Retrait en boutique* · Point relais only, no address field; flags restored to on.
  Livraison columns 256 / 393 / 393 px at 1440. typecheck, lint, 12 tests clean.

### 2026-11-10 — Relay point modal, read-only tariff
- User: the add form out of the Points relais column, in a modal behind "Ajouter". `Modal` (`components/admin/client.tsx`):
  native `<dialog>` + `showModal()`, backdrop click / Escape / × close it, the server-action form inside redirects and
  remounts the page, so no close-on-success logic. No dialog dependency added. Title "Nouveau point relais".
- Then: commune as a dropdown that follows the wilaya, placed right after it (`DeskPlace`, client: `communesOf`, same
  data as the cart; `key={wilaya}` remounts it empty). Plain labels, not `Field` (fields.tsx pulls server-only i18n).
  The commune help icon went with it. Order: Wilaya · Commune · Nom du point · Adresse (· Identifiant in debug).
- Gotcha: a Base UI Select popup is portalled to `<body>`, which sits **under** a modal `<dialog>`'s top layer: the
  list showed in the DOM but no click reached it. `FormSelect` now finds `input.closest("dialog")` and passes it as the
  popup's portal `container` (`SelectContent container`). Any future popover inside `Modal` needs the same.
- Points relais filter (user, after the pager alone): `?w=<wilaya>` GET select above the list (wilayas that have points;
  the count next to the "Points relais" title follows the filter; × clears), the pager runs over the filtered list, `url()` keeps `w`. Add / delete redirects drop it.
- "Seuil « Stock faible »" (Boutique) is debug-only too (user).
- Shop address split (user): migration `store_place` adds `Settings.storeWilaya` / `storeCommune`; `storeAddress` keeps
  the street. `PlaceFields` (was `DeskPlace`, `components/admin/client.tsx`: `names`, `wilaya`, `commune`, `required`)
  serves the Boutique tab and the relay point modal. `updateSettings` drops a commune outside the wilaya. The cart page
  builds the pickup line "street, commune, wilaya" (AR names in Arabic) and passes it as `storeAddress`; `/merci`
  gets the same text through `atelier:last-order`. Verified: picked 16 - Alger › Alger Centre + a street, saved, cart
  shows "À retirer en boutique : 12 rue Didouche Mourad, Alger Centre, Alger"; values reset to "" afterwards.
  Both migrations today ran with `--skip-generate` + `prisma generate` after `preview_stop`.
- Catégories rows (user): the `?category=<slug>` column and the parent select are gone; a row only renames (hidden
  `parentId` keeps the parent). Moving a category = delete it (when empty) and re-add under the other parent.
- Catégories redesign (user: "make the categ ui better looking"): folds + table rows → card grid (1/2/3 columns,
  `items-start`), no repeated main-category row, no parent select, no per-row Enregistrer buttons; adding a sub-category
  happens in its card. Summary line "6 catégories · 17 sous-catégories" + help icon. Verified: add "Test pli" in Bas,
  rename on blur, delete, all staying in edit mode; 375px no sideways scroll; Arabic mirrored.
- Catégories read-only until "Modifier" (user): `?edit=1` shows the add form, rename fields and delete buttons;
  "Terminer" leaves. The category actions keep `edit` and `debug` through the referer (`fromReferer(...keys)` in
  `lib/actions/admin.ts`, which `debugQ` now wraps). Verified: read-only = names + counts, no form; edit = 24 name
  inputs + add form; re-saving Jeans → `?open=<Bas>&edit=1&saved=1`, still editing; Livraison save with `debug=1`
  still lands on `…&debug=1`.
- In debug the courier fields (credentials, "Wilaya de départ") stack one per line: the column is 16rem from `xl`.
- Tariff read-only until "Modifier" (user): `?edit=fees` renders inputs + Enregistrer / Annuler, otherwise plain
  values; `url()` keeps `edit` on the pager; a save redirects without it. `t.admin.cancel`, `close`, `newDesk` added.
- Verified (DOM-driven, 1440): modal opens 512px centred with the fields, × closes; read-only shows 1450 / 1150 and
  "Modifier"; `?edit=fees&fp=2` → 10 inputs, pager links keep `edit=fees`, save → `?tab=delivery&fp=2&saved=1`,
  read-only again.

### 2026-11-10 — Commandes redesign
- User: "redesign the orders route view for better UI/UX". The table became one card per order: top line `#REF` ·
  date · method badge with an icon (À domicile / Retrait en boutique / Point relais: every order says its method now);
  then four columns from `xl` (2 from `md`, stacked on phones): customer (name, call pill with the number, WhatsApp pill,
  inline note), delivery (commune + wilaya, address, courier parcel or "Envoyer à …"), items ("2 × name · colour ·
  size", total pieces when several lines), total with "Livraison <fee>" under it + status (select or final badge). The
  last column is a fixed 12rem so the columns line up from card to card.
- Status colours (`TONE`): En attente amber `#b45309` (needs a call), Confirmée `info`, Expédiée ink, Livrée `success`,
  Retournée `sale`, Annulée `stone`. Shown as the card's start edge, a dot in the tab strip and in the status select /
  badge. Cancelled cards get a faint cloud background.
- New: method filter (`?method=`) and a sort select (newest / oldest / total ↓ ↑ / wilaya A → Z) in one GET form, which
  replaces the sortable table headers and so also works on phones; title shows the matching count. Tab counts follow
  the method filter too. Desktop status strip stays on one line (scrolls sideways if it ever has to).
- Verified with 6 temporary `ZZTEST` orders (inserted straight into the DB, no stock moved, deleted after; DB backed up
  first: `prisma/backups/store-2026-11-10-09-49.db`): 1440 columns aligned on every card, "Prête en boutique" fits;
  `?method=STOPDESK` → 1 card + tab counts; `?sort=total-desc` → 18 850 … 6 000; picking Confirmée in a card's select
  saved and turned its edge blue; 375px no sideways scroll, total + status on one row; Arabic mirrored. The user's real
  order (KOJNF7Q4, Expédiée) and the variant stock (1) are unchanged.

### 2026-11-10 — Local DB reset to demo data
- User: "relaunch the app with demo data (and sandbox method)"; picked "back up, wipe, demo + Yalidine data". Backup
  `prisma/backups/store-2026-11-10-10-00.db` (real product Hoodie La Martina, order KOJNF7Q4, Réglages "Le Repère").
  `prisma migrate reset --force` (with `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`) → default seed: admin, category
  tree, 3 demo products / 29 variants. Then a one-off script did what "Charger la grille Yalidine" does (58 tariffs,
  200 relay points from `data/yalidine-*.csv`; the seed never loads them) and set `courier = "sandbox"` with the three
  delivery methods on. Uploaded files in `public/uploads/` were left on disk. Store name is back to the default "ATELIER".
- Checked: /, /products (the 3 demo products), /cart (three method tiles) answer 200; /admin → login.
- Then (user: "load some orders too"): 16 demo orders over the last 20 days, by a one-off script (not the seed): every
  status (3 en attente, 2 confirmées, 3 expédiées, 6 livrées, 1 retournée, 1 annulée) and method, fees from the
  loaded tariff, relay orders on a real `StopDesk` row, shipped home / relay ones with a Sandbox parcel (`DZTEST-…`),
  stock taken for every order except the returned / cancelled ones. Commandes shows them over 2 pages; the dashboard
  "Encaissé" reads 53 250 DA.

- Then (user: "compact them" on phones): name and the call / WhatsApp pills share one row, tighter gaps and padding,
  note field 28px, address clamped to one line, the "n article(s)" line and the pickup "—" hidden below `md`.
  375px: cards ~410 → ~300px, a page of 3 from 1635 to 1331px tall. 1440px unchanged (columns still aligned).

### 2026-11-10 — Parcel tracking (dzship /v1/track)
- User asked whether dzship has a tracking endpoint (yes: `POST /v1/track`, read in the zip's `docs/endpoints.md` and
  `docs/statuses.md`), then "add it". Migration `courier_status`: `Order.courierStatus`, `courierRaw`, `courierCheckedAt`.
  `lib/courier.ts`: the gateway POST + error parsing is shared (`call()`), `trackParcel()`, `statusSteps()`. Action
  `trackOrder` reuses `moveStatus`, now extracted from `updateOrderStatus`. Card: status label + "vérifié le …" + a
  refresh icon (text "Actualiser le suivi" before the first check). `courierSetup` / `courierDesk` texts now point to
  Réglages › Livraison (the Transporteur tab is gone).
- Sandbox answers every tracking number with `in_transit` and 3 fake events, so only that path is proven: demo order
  Sofiane Haddad (Confirmée, DZTEST-JAXHYH) → "En transit · vérifié le 10 nov. 2026", order moved to Expédiée.
  delivered / returned are covered by `lib/courier.test.ts` only. A real courier account is still needed to see real wording.
- Slip: `lib/courier.test.ts` was overwritten by a Write meant to create it (the parcel / courierReady tests from
  `e0d9d2b`); restored from git and the new tests appended. 15 tests pass.

### 2026-11-10 — Next-step buttons instead of the status dropdown
- User asked whether a dropdown of every status was the best way; it isn't (two clicks for the common case, allows
  skipping or going backwards, hides the next step). Built the proposal: current status with its dot, then one main
  button for the next step and a "⋯" menu for the rest; final targets confirm first. Pickup orders read "Marquer prête"
  / "Marquer retirée" / "Jamais retirée", and their final badges "Retirée" / "Non retirée" (user's "sure" covered both).
  The coloured status strip / start border is gone (design hook: side-tab accent, off the Nike language): the status
  (dot + label) now leads the card's top line instead, before the ref and date.
- Verified on demo orders: Yacine (pickup) En attente → Confirmer → Confirmée → Marquer prête → Prête en boutique,
  menu showed Jamais retirée / Revenir à Confirmée / Annuler; declining the prompt on "Marquer retirée" left it unchanged;
  outside click closed the menu; walked back to En attente through the menu. 375px FR + AR: menu panel on screen, no
  sideways scroll. Demo data left as it was.

### 2026-11-10 — Phones: collapsed order cards, compact admin header
- User: only ~1.5 order cards fit on a phone screen. Admin header (190px) + title/search (150px) left ~470px for
  300px cards. Now on phones each card is collapsed (`OrderCard`, client, `components/admin/client.tsx`): a summary
  "⌄ ● status · date · total / name" with the next-step button over its bottom-end corner (a sibling of the toggle,
  not nested); a tap unfolds the full card (the summary's action hides, the card's own buttons + ⋯ show). From `md`
  the summary is hidden and cards are always open. Chevron at the start (user: at the end it sat right above the
  button). Then (user: lines too close) the two summary lines got a 16px gap, so the total and the button no longer
  touch. 375px: 98px per card, 3 cards + pager end at ~640px.
  Opened on a phone, the card no longer repeats what the summary shows (user): its name, date and total are
  `max-md:hidden`; the fee line "Livraison 850 DA" stays next to the buttons. Desktop unchanged.
- Admin header on phones (user: "fold the links row into the nav", "we have to scroll horizontally to see
  Commandes"): one thin bar (store name + "⋯" `MoreMenu` holding Voir la boutique / العربية / Se déconnecter / user)
  that scrolls away, then a sticky row of five equal tabs, icon + short label (`dashboardShort` "Accueil"), no sideways
  scroll; `AdminNavLink` (client, `usePathname`) marks the current section on phones and in the desktop sidebar (icons
  there too, links padding tightened so "Commandes 2" fits). Header 190 → 107px. `MoreMenu` gained `triggerClassName`.
- Tablet (768px) overflow fixed while at it: the status tab strip needed `min-w-0 max-w-full` to scroll inside itself,
  the date row wraps at every width, the "Envoyer à <courier>" button wraps (long courier names).
- Verified at 375 (FR + AR), 768, 1280/1440: no sideways scroll anywhere checked (orders, settings, dashboard), no
  cut names or tab labels, expand / collapse, ⋯ account menu opens on screen and closes on outside click.

### 2026-11-10 — Delivery method highlighted on order cards
- User: "highlight the expedition method better, mobile and web". The small grey badge in the top line is gone. Now the
  method heads the delivery column: an ink disc with its icon (`MethodMark`: À domicile truck, Retrait en boutique
  store, Point relais pin) + the label at 16px; pickup cards show only that header there (no more "—"). Phone summary:
  a small disc before the customer's name, the label for screen readers. Desktop columns still aligned at 1440,
  375px FR + AR no sideways scroll, collapsed cards still 98px.
- Then (user: "no need to show the wilaya number"): the card's place line is names only, in the UI language
  (`place()` in the orders page: "Akbou, Béjaïa" / "أقبو، بجاية"), and a commune named like its wilaya shows once
  ("Oran"). Stored values unchanged ("06 - Béjaïa", Latin commune).

### 2026-11-10 — Scheduled tracking sync
- User: can "Actualiser le suivi" run on its own; picked cron over an in-app timer (a timer runs twice in dev and stops
  silently on a restart). Tracking moved out of the server actions into `lib/tracking.ts` so a plain tsx script can run
  it; `trackOrder` and the new `trackAll` call it, `updateOrderStatus` uses its `moveStatus`. `Notice` now shows
  `?detail=` under a success toast too (it did only for errors).
- `scripts/track.mts` imports through the `@/` aliases (tsx reads tsconfig paths; `.ts` extensions break `tsc`). It
  must not import `lib/i18n.ts` (`next/headers`): it reads `Settings` straight from the DB.
- Verified: `TRACK_MIN_AGE_MIN=0 npm run track:sync` → "checked 5, moved 0, failed 0" (5 open Sandbox parcels, all
  already Expédiée); run again with the default hour → "checked 0". "Tout actualiser 5" on Commandes → toast
  "5 colis vérifiés, 0 commandes avancées."; 375px no sideways scroll (the button sits on its own line under the title).
  The server's crontab line itself is untested (no server yet).

### 2026-11-10 — Communes aligned with dzship
- User pasted dzship's wilaya list and asked to compare. The commune list came from its public `GET /v1/communes`
  (no credentials). Result: 58 wilaya names identical; 1506 / 1541 communes identical, 33 differing by accents / caps /
  hyphens ("Sidi M'hamed" → "Sidi M'Hamed", "Larbaa" → "Larbâa"), "M'sirda Fouaga" → "MSirda Fouaga", and Tabelbala
  in 08 Béchar for us but 52 Béni Abbès at dzship (the 2019 split). User: align them. `lib/communes.ts` regenerated
  from dzship (Arabic spaces collapsed; it also fixes our "Ain Beida Harriche" Arabic, which held stray quote marks).
  Migration `…101000_dzship_communes` (data only) renames the stored values in `Order`, `StopDesk` and `Settings.storeCommune`
  and moves Tabelbala rows to "52 - Béni Abbès", so a restored backup gets fixed by `migrate deploy`.
- Slip, caught before commit: the first version of the rename script matched names across wilayas, so three
  same-named communes in another wilaya were picked (Larbaa Blida → Batna, Sidi M'hamed M'Sila → Alger, Ain El Hadjar
  Saïda → Bouira) and two Blida relay points landed in Batna. The local DB was restored from the backup taken just
  before (`prisma/backups/store-2026-11-10-11-04.db`), the script fixed (same wilaya first; another wilaya only for a
  single unique match), the migration regenerated and applied. Only Tabelbala moves now.
- Verified: re-comparison 1541 / 1541 exact; Larbâa points back in Blida; `isCommune` true for the new spellings,
  false for the old; every migration replays on a scratch DB; 15 tests; cart 200.

### 2026-11-10 — Parcel options, shop map on the home page
- User asked whether orders carry everything Yalidine needs: every field dzship's OpenAPI marks required is sent
  (recipient name / phone / wilaya code / commune, delivery type, product list, COD amount). Then "add them" = the
  optional ones that fit Réglages: open before paying, insured value, a fixed weight (migration `parcel_options`). Not
  added: a second phone (needs a checkout field) and a note for the courier (the order note is the admin's call log).
  Verified: saved in Réglages (checkboxes + 1.5 kg), a demo parcel sent to Sandbox with `hasOpenPackage`,
  `declaredValue 9850`, `weightKg 1.5` → accepted (`DZTEST-Z01Y0Q`, nothing written to the DB); unit test; options reset.
- User: a map of the shop on the home page from the admin's coordinates. Migration `store_location`
  (`Settings.storeLat` / `storeLng`, nullable). Réglages › Boutique: "Position GPS de la boutique" (one field; accepts
  "36.7538, 3.0588", "36.7538,3.0588", "36,7538 ; 3,0588"; a comma is a decimal mark only without any dot; out of range
  → `?error=badCoords`). Home: a last "Notre boutique" section with the address line, "Itinéraire" (Google Maps
  directions) and "Agrandir la carte" (Google Maps search), plus a map iframe (`loading="lazy"`,
  `referrerPolicy="no-referrer"`). Section hidden without coordinates. First an OpenStreetMap embed, then (user:
  "what about google maps?", picked the keyless option) Google's `maps.google.com/maps?q=lat,lng&z=16&hl=<locale>&output=embed`:
  no key, labels in the shop's language. It 301s to `/maps/embed?pb=…`, which answers 200 with no `X-Frame-Options`
  (only the redirect carries `SAMEORIGIN`, which browsers ignore). Not an official API: if it breaks, use the Maps
  Embed API (`/maps/embed/v1/place?key=…`, free, needs a Google Cloud key with billing on).
- Verified: bad coordinates → toast; "36.6652,2.9431" saved and shown back as "36.6652, 2.9431"; home renders the
  section with the right links in FR and AR, no sideways scroll at 375; without coordinates the page has no map.
  **Not seen**: the map tiles themselves — the preview pane doesn't load outside sites in frames. Checked by headers
  only (above); open the home page in a real browser once the coordinates are set. Test coordinates removed afterwards (the
  user's shop position is theirs to type).
- Migration order: `prisma migrate dev` names folders in UTC, so the hand-named `…120500_dzship_communes` (local time)
  sorted after `parcel_options`; renamed `…101000_dzship_communes` (its real apply order) with its history row updated.
  Name hand-made migrations with `date -u`.

### 2026-11-10 — Opening hours, home store section, shop link in a new tab
- User: hours apart from the address. Migration `store_hours` (`Settings.storeHoursFr` / `storeHoursAr`); Réglages ›
  Boutique "Horaires d'ouverture" FR/AR under the address (the address hint no longer says "horaires"). The cart's
  pickup line = address, then "Horaires : …" on its own line (also what `/merci` gets through `atelier:last-order`).
- Home "Notre boutique" section now shows whenever there's an address, hours or coordinates (map column only with
  coordinates). "Agrandir la carte" replaced (user) by "Nous écrire sur WhatsApp" (`wa.me/<Settings.whatsapp>`, shown when
  the number is set) next to "Itinéraire".
- Admin "Voir la boutique" opens the shop in a new tab (`target="_blank"`, plain `<a>`).
- Verified: hours saved and read back (FR + AR); home section FR "Horaires : Sam–Jeu : 9h–19h" and AR text; WhatsApp
  button with a temporary number (`wa.me/213555123456`), hidden when empty; cart pickup line with the hours on line 2.
  Test hours and number removed afterwards; the user's own coordinates (Douira) were left as they set them.

### 2026-11-10 — Yalidine data files checked against dzship communes
- User asked to "prepare the data files" for the Yalidine tariff + relay points: they already exist and ship in the
  image (`data/yalidine-fees.csv` 48 destinations → 58 wilayas, `data/yalidine-desks.csv` 200 agencies; read at runtime by
  `loadCourierDefaults`). Checked them: all 200 rows parse, every wilaya gets a tariff. But 60 agencies' Commune column
  used Yalidine's own spelling instead of dzship's: 50 by accents / hyphens ("Béjaïa" → "Bejaia", "Tizi Ouzou" →
  "Tizi-Ouzou"), 9 by more ("Mahelma" → "Maalma", "Ksar Boukhari" → "Ksar El Boukhari", "Bordj Bou Arreridj" →
  "B. B. Arreridj", which is dzship's canonical name, "In Salah" → "Ain Salah", "El Menia" → "El Meniaa"…). That commune is
  what a relay parcel is sent with. Only that column was rewritten (diff of the other columns empty); the same 60 rows
  fixed in the local DB by `deskId`. Re-check: 200 / 200 communes exact for their wilaya. A store that already loaded the
  old rows keeps them (the button only adds missing `deskId`s): delete and reload the points there if needed.

### 2026-11-10 — Production build, Next.js 16.4.0 → 16.4.6
- User: "run a build". `npm run build` compiled and type-checked, then stopped once on a Next.js security notice; npm's
  audit confirmed three critical advisories on `next` 16.0.0–16.4.0 (RCE in the image optimizer with SVG, Server Actions
  DoS, RCE in `use cache` typed arrays; GHSA-2464-fhr4-w9xw, -p3m5-59mp-jv5r, -673q-mjm6-r5xr). The second build run
  passed. User: upgrade. `next` + `eslint-config-next` 16.4.6, exact pins (patch release, React 19.3 within its peer range).
- After the upgrade: typecheck, lint, 16 tests, build (first try), `next start` on :3600 → home, catalog, PDP, cart,
  robots, login 200, `/admin` 307, unknown 404. `npm audit --omit=dev` lists nothing on `next` any more; the rest (express,
  body-parser, qs, undici, fast-uri, minimatch) all come through the `shadcn` CLI package, which the app only uses for
  `@import "shadcn/tailwind.css"` at build time; its CLI never runs in production. Left as is.
- Docker image still not built: Docker isn't installed on this PC.

### 2026-11-10 — Réglages only in debug mode, smaller category tiles
- User: "make the whole settings page only visible on debug mode". Debug went from a Réglages-only URL param to a
  cookie (see the convention). Verified: `?debug=0` → menu without Réglages (4 tabs on phones, grid columns follow the
  count), `/admin/settings` → 404 "Page introuvable"; `?debug=1` → Réglages back, tab links carry `debug=1`, badge links
  to `/admin?debug=0`, Catégories renders, a Boutique save → `?saved=1` on the same page.
- User: home category tiles too big (phones, a bit on desktop). Two per row at every width (was one full-width 4:5 tile
  on phones, ~430px tall each), square on phones; from lg four per row when there are more than two, otherwise two wide
  2:1 tiles. Then (user: "uncropped on pc") from `md` the photo is `object-contain` with padding on the soft-cloud tile;
  phones keep `cover`. Measured: phone 168 × 168 (section ~870 → 224px), 1440px 660 × 330 (was ~660 × 495), whole
  garment visible. The Google map also rendered in the preview pane this time (pin at Douira).

- Then (user: "fill more demo data… to see how the navbar would look"): 15 demo products by a one-off script (local DB
  only, backup `prisma/backups/store-2026-11-10-12-10.db` first), one per empty sub-category (T-shirt, polo, pull, hoodie,
  jean, short, veste, manteau, costume, survêtement, qamis, pyjama, boxers, baskets, casquette) with new SVG silhouettes,
  same variant / stock pattern as the seed. 18 products, 157 variants; every main category now shows. Navbar measured:
  1440px fits exactly (956 / 956), **1280px overflows by ~56–62px** in FR and AR ("Vestes & manteaux" runs into the
  search pill), phones scroll the row (751px in 375, by design). Order is alphabetical (no manual order yet).

### 2026-11-10 — Catalog filter layout
- User: "improve the shop filters layout, no ai slop". Measured first at 1440 with the 18 demo products: a 3000px filter
  column (34 size pills mixing S–XL, waists, suit and shoe sizes; 18 colour pills with names), the title wrapping in the
  220px column, no summary of what's applied. Kept the existing Nike vocabulary (hairlines, ink, soft-cloud, no new
  colour or effect):
  - title + count and the sort on one row across the page; below it, a row of applied filters as soft-cloud chips with
    × (each removes only itself, `q` included) + "Effacer les filtres" when there are two or more;
  - filter column sticky under the 100px header (`md:sticky md:top-[116px]`, own thin scroll when taller than the screen);
  - each group a native `<details open>` with the picked value muted next to its name ("Taille M") and a chevron;
  - sizes as a tight 4-column grid, letter sizes first then "Tailles en chiffres"; colours as 28px swatches (name in
    `title` / `aria-label` and in the group heading once picked, ring-2 ink when selected);
  - phones: the "Filtres (n)" pill fold as before, the sort row under it.
- Verified: column 3000 → 842px and pinned at 116px after scrolling 1200px; `?category=hauts&size=M&color=Noir` → three
  chips linking to the URL without each filter, headings "Catégorie Hauts / Taille M / Couleur Noir"; 375px: chips, pill,
  sort, products on the first screen, no sideways scroll; Arabic RTL, no overflow.

### 2026-11-10 — Storefront menu on phones, capped navbar, catalog filter fixes
- User: the phone category row scrolled sideways without showing it could. Now a menu button (`MenuDrawer`,
  `components/store/menu-drawer.tsx`) before the store name opens a panel under the sticky header listing "Tout" and
  every main category; a main one with sub-categories folds open in place (its "Tout" + subs). Closes on a link tap,
  outside tap, Escape. Used below `lg` (tablets too, where hover menus never worked). Header on phones 132 → 100px;
  the search field takes the row's free width (placeholder no longer cut), store name one line (`text-2xl` on phones).
- Desktop navbar capped by breakpoint (2 / 4 / 6 main categories from lg / xl / 2xl, rest under a "Plus" hover menu
  with their subs, Plus hidden when nothing is left over; gaps 16px below xl). Measured with the 6 demo groups, FR + AR:
  no overflow at 1024 / 1280 / 1440 / 1536, no page scroll at 375.
- Catalog filter column (user): a main category's chevron only unfolds its sub-categories (`<details>` per group, the
  name stays the filter link, open on the picked group); the group headings no longer repeat the picked value ("Catégorie
  Jeans"), which the title, the applied chip and the highlighted row already show.
- Verified (preview pane): phone menu open → Hauts unfolded → Chemises → `?category=chemises`, panel closed; catalog
  chevron on Bas → opened, URL unchanged; name → `?category=bas`. typecheck, lint clean.
- Then (user: "slightly animated"): the panel fades + slides down on open (tw-animate `animate-in`, 200ms), the X spins in,
  a sub-category fold slides in; closing sets `data-closing` for a 150ms slide-up before `open = false` (a `<details>`
  hides its content at once). All `motion-safe:`. Checked by the computed `animationName` (enter / exit) at each step.
- `DEPLOY-GCP.md` (user: "simple guide to deploy to gcp"): Compute Engine VM (`e2-small`, Paris / Madrid, Ubuntu 24.04,
  HTTP/HTTPS tags), static IP, DNS or `sslip.io`, SSH, then `DEPLOY.md` §3.1–3.6; optional copy of the local DB + photos
  into the volumes; snapshots, cost, budget alert. Says GCP is for demo / staging (loi 18-05). Not run: no GCP project
  here. `DEPLOY.md`'s Réglages mentions now say debug mode (`/admin?debug=1`).

### 2026-11-10 — Storefront footer
- User: "the footer is kinda dull". Now an ink block (`components/store/footer.tsx`), everything from Réglages and
  hidden when empty: a facts strip (Livraison dans les 58 wilayas when home delivery is on, Paiement à la livraison,
  Retrait en boutique / Point relais when switched on, same rule as the cart), the store name in Bebas + tagline, Boutique
  = Tout + the main categories, Contact = WhatsApp, shop place, hours, Itinéraire (coordinates), social links, Aide = the
  delivery text. Phones: Boutique | Contact side by side (871 → 733px). The Panier link and the "© year" row were removed
  (user); the language switch stays in the header only.
- Social links (user, "yes"): migration `social_links` = `Settings.instagram` / `facebook` / `tiktok` (Réglages ›
  Boutique, one row of three fields, help icon on the first). `@lerepere` → `https://www.instagram.com/lerepere`,
  `facebook.com/lerepere.dz` → `https://facebook.com/lerepere.dz`, `javascript:…` → `?error=badSocial` toast.
- Verified (dev, DOM-driven; screenshots timed out, the pane wasn't drawing): those three saves; footer text and
  links at 375 / 768 / 1280 in FR and AR, no page overflow. Test links cleared afterwards. DB backed up first
  (`prisma/backups/store-2026-11-10-13-13.db`). typecheck, lint, 16 tests clean.

- Then: the three social fields moved to the Page d'accueil tab (user). Douira → **Douera** (user): display only,
  `COMMUNE_LABELS` in `lib/wilayas.ts`, used by the cart and admin commune selects, `storePlace()` (cart pickup line,
  home, footer) and the order cards; "Douira" stays the stored value (dzship's name, sent to the courier). Unit-tested.
  Verified: Boutique tab without the social fields, Page d'accueil saves `@lerepere`, commune select and home page read
  "Douera", no "Douira" left on the page. Test link cleared.

### 2026-11-10 — Admin Stock and Produits on phones
- Stock (user: "4 elements per page on mobile"): `PER_PAGE_PHONE = 4` when the request looks like a phone
  (`Sec-CH-UA-Mobile: ?1`, or `Mobi` in the user agent), else 7. Server-side, so the pager counts match the device
  (375px emulated Android: 4 rows, 1 / 40; desktop: 7 rows, 1 / 23).
- Produits list (user: columns cut, sideways scroll): `Table stack`; on phones a row = photo + name + one muted line
  "category · Variantes n · Stock n (red at 0) · lowest price", the other cells hidden. 375px: rows 79px, no overflow;
  desktop keeps the header and six columns.

- Order cards tightened (user: "lots of useless margins"): 12px padding at every width, top line `mb-2`, method
  header = small disc + text-sm (was a 32px disc + 16px text + margin), courier + parcel number + last status + refresh
  on one wrapping line (was two), note field 28px everywhere, from `md` the total + buttons sit beside the items (the
  items used to share a row with an empty cell, and the total had its own ruled row below `xl`). Measured: 1440px
  210 / 230 / 170 → 174 / 194 / 148px, 1024px 318 / 338 / 274 → 278 / 298 / 236px; phones unchanged (98px closed).

- Status chip (user: "the current status part doesn't look so good"): the card said its status twice (a small dot +
  label on top, and an outline badge under the total on final orders). Now one tinted chip on top (amber En attente,
  blue Confirmée, grey Expédiée, green Livrée, red Retournée, muted Annulée), also in the phone summary; the badge is
  gone, final cards just end on the total. Seen in screenshots at 800px and 375px; phones' closed card 98 → 102px.

- Column captions (user: "Détails" and "Articles"; picked "headings on columns"): small muted `caption` over the delivery
  column (`t.admin.orderDetails`, "Détails" / "التفاصيل") and over the items (`t.admin.items`, "Articles", as an
  `aria-hidden` first `<li>`, the list keeps it as `aria-label`). Seen at 1024, 1440 and 375 (opened card), no overflow.

- Collapsed phone card: the method icon before the name removed (user); the name lines up under the status chip.

- Pointer cursor (user: Voir la boutique / العربية / Se déconnecter): `cursor-pointer` on the sidebar's `item`, and a base
  rule in `app/globals.css` (enabled `button`, `[role=button]`, `summary`), since Tailwind v4 dropped the pointer on
  buttons: every status button, menu and fold now shows it. Dev restarted for the CSS (Turbopack gotcha).

- Signed-in username (user: "move admin to the top"): under the store name in the desktop sidebar, first line of the
  phone ⋯ menu; no longer under Se déconnecter.

- Status made "really clear" (user): solid chips with white text and an icon (Clock En attente amber, Check Confirmée
  blue, Package Expédiée ink, CircleCheck Livrée green, Undo2 Retournée red, X Annulée grey on hairline), h-7 semibold, in
  the card and the phone summary; desktop adds the 4-step progress bar next to it. Screenshots at 1280 (every status)
  and 375; phone closed card 102 → 106px, no overflow. A 500 seen while editing came from the half-applied import
  (`Clock is not defined`), gone after the second edit.

### 2026-11-10 — Dashboard on one screen, "Depuis le début", rare status tabs folded
- Dashboard (user: "don't want to scroll"): title and range chips share the first row (the "Activité" heading is gone),
  tiles 2 per row then 4 from `xl` at `px-4 py-3` / `text-2xl`, chart panels `px-4 py-3`, time charts `h-44`, ranking
  rows 30px. 1280×800: page exactly 800px tall, nothing to scroll. Phones still scroll (four charts can't fit 812px).
- "Depuis le début" (user: "all time"): `?days=all` = from the first order's day; above 90 days the two time charts
  switch to one bar per month (`monthly`, titles "Commandes / Montant commandé par mois", ticks "mai 2026").
  Checked by moving the oldest demo order 200 days back (monthly axis May → Nov), then restored to 2026-10-21.
- Commandes tab strip (user: Retournée / Annulée "collapsed"): on desktop they sit under a "Plus n ⌄" tab (`RARE`,
  `MoreMenu` with a `trigger`); while one of them is the filter the tab reads "● Annulée 1", underlined. The strip
  no longer needs its own sideways scroll. Phones keep them as pills inside the Filtres fold. `MoreMenu` now closes when
  a link inside it is clicked (soft navigation kept it open).

- Tried and undone (user): desktop orders as collapsed one-line rows (12 per page, a click opened the card). The open
  cards, 3 per page, stay the desktop layout; only phones collapse them.

- "Commandes par statut" replaced (user: "something more important") by **Wilayas qui commandent le plus**: the top 6
  destination wilayas over the range, cancelled orders left out, pickup orders as one "Boutique" row (names in the UI
  language). Same `Ranking` chart; the status split is already on the Commandes tabs. 1280×800 still one screen.

### 2026-11-10 — Commandes rebuilt on the user's mockup
- User brought `Commandes — refonte liste.html` (a bundled artifact export: fonts + two nested boards, desktop 1440 and
  mobile 390; unpacked with Python from its gzip/base64 manifest, served from a temp folder to look at it). Rebuilt the
  page on its structure with our tokens (hairline borders, ink buttons, our status colours): see the Commandes
  convention. Deleted `OrderCard` (`OrderRow` + `RowToggle` replace it), the `Progress` bar and `MethodMark`.
- Kept from today's decisions although the mockup differs: Retournée / Annulée stay under "Plus", the status chip stays
  solid. Skipped on purpose (nothing behind them): selection checkboxes and bulk actions, Exporter, Imprimer les bons,
  "Action requise", Signaler un incident, the per-step dates and history (only `createdAt` exists).
- Verified in the pane: 1440 and 1280 (rows 89–97px, no inner scroll, total and button 23px apart), panel open
  (Livraison / Articles / Note), 375 cards 243px + the stacked panel, Arabic 1280 mirrored. typecheck, lint, tests clean.

- ⋯ menu clipped by the table (user): `MoreMenu`'s panel now renders through `createPortal` into `<body>`, `position:
  fixed` under the trigger's end edge (right in LTR, left in RTL), measured on toggle; closes on scroll / resize too.
  Its submit buttons name their form (`form` attribute) since they're no longer inside it. Checked: panel in `<body>`,
  fully visible, 4px under the trigger, buttons bound to the right form, outside click closes it; RTL aligned on the
  left edge; phone card too. Pagination (user): 6 rows on desktop, 2 cards on phones.

- Less on the row (user: "lessing the details"): dropped the date (it's the first step of the panel's timeline and the
  list is sorted by it), the courier name + parcel number next to the state chip (panel), the "n article(s)" line above
  the items, "dont livraison" under the total (itemised in the panel); the panel lost the "Transporteur" label line and
  the SKU. Rows 89 → 79px, back to 8 per page on desktop (2 cards on phones).

- Courier state vs our timeline (user asked if redundant): our 4 steps are the shop's decisions, the courier state is
  finer (5 states between Expédiée and Livrée, plus the trouble ones). The panel showed it twice; now the courier state
  + check date is the sub-label of the "Expédiée" step, and `delivery_attempted` / `on_hold` / `return_in_transit` /
  `cancelled` / `lost` / `unknown` read amber there and on the row chip (`trouble`). Checked with a demo order set to
  `delivery_attempted` for the screenshot, then put back to `in_transit`.

- Header line "Suivi transporteur vérifié le …" removed (user); its `_max(courierCheckedAt)` query and `lastSync` strings too.

- Panel address (user): the method on its own line, then "street, commune, wilaya" in one postal line (`place()`); a relay
  order shows the point's "name — address" alone (it already ends with its place); pickup orders show the method only. Rows read "À domicile → Oran" (← in Arabic).

- Row items (user: ambiguous, then "no names"): the Articles cell is the piece count only, "2 article(s)"; the panel
  itemises. The panel address is ink, not muted (user).

### 2026-11-10 — Import page simplified; list restyle tried and reverted
- Tried (user: "same layout as orders in stock & products"): a `ListCard` frame + footer, a search-first `ListFilters`
  with a segmented stock switch, and the Commandes header strip on the shared `Table`. Reverted the same hour (user):
  Produits, Stock, `Table` and `ListFilters` are back to their committed state; only Commandes has that layout.
- `/admin/products/import` simplified (user): two cards, "1. Le modèle" (one sentence + the template button) and
  "2. Votre fichier" (the form), one muted rule line under them (`importStep1/2`, `importStep1Text`, `importNote`
  replace the six `importRules`). Import logic untouched.

- Page sizes (user: "fix the numbers"): Produits 7 on desktop / 5 on phones (same header sniff as Stock), Stock 8 / 3; 2026-11-11 (user): phones 7 and 4.
  Measured so each list fits one screen (1280×800, 375×812) with its filters.

- Footer facts strip (Livraison dans les 58 wilayas · Paiement à la livraison · Retrait en boutique · Point relais)
  removed (user); the footer starts at the brand + columns. `t.footer.allWilayas` / `cod` dropped.

### 2026-11-11 — First real deployment (GCP demo)
- User deployed to a GCP `e2-small` (Ubuntu 24.04, Paris) from the browser SSH, following `DEPLOY-GCP.md` + `DEPLOY.md`
  §3: `docker build` passed on the first try (image 598 MB), the entrypoint applied all 23 migrations and seeded with
  `SEED_DEMO=0`. Simplified for a no-domain demo: `-p 80:3000` instead of Caddy, plain HTTP on the VM's IP (Auth.js
  logs in fine over HTTP: `AUTH_TRUST_HOST=true` in the Dockerfile). Pitfalls hit: the `YOU` placeholder left in the
  clone URL (repo is public: `Anis-Al/clothing-store`), `/srv/atelier.env` not created before `docker run`.
- Account is on the 90-day free credit: ~0.50 $/day for the VM + disk. Known gaps updated (Docker build verified).
- On the VM afterwards: a second admin created with `docker exec atelier npx tsx scripts/admin.mts …` (§3.6), the local
  DB backup + `uploads.tgz` copied to the VM's home (the `DEPLOY-GCP.md` "bring your local demo data" recipe), demo data
  loaded then removed again (seed only). The user then imported real brand products with photos through the CSV import:
  `prisma/backups/produits-marques.csv` (18 products / 145 variants, written here, validated with `planImport`, gitignored
  like every backup). The storefront feature review / ROI grouping asked the same day lives in the chat only.
- Then (user: "a full singular command for deployment, including docker installation"): `DEPLOY.md` §3.0 = one pasteable
  command (apt git/curl → get.docker.com if no `docker` → 2 GB swap when RAM ≤ 2 GB and no swap → `/srv/atelier.env`
  with `SEED_DEMO=0` if missing → clone or pull `/srv/atelier` → build → replace the container on `-p 80:3000` → follow
  the log). Re-runnable = the update path too (§4 points to it); `DEPLOY-GCP.md` §6 leads with it. Checked with
  `bash -n` and a stubbed simulation of the three branches (fresh server, second run, big server); not run on a server.

### 2026-11-11 — Home page wider than a phone screen
- User's iPhone showed the home page zoomed out with a white strip on the right. Cause: the category tile labels. The
  label span passed its extra classes *inside* `buttonVariants({ className })`, which doesn't merge, so the base's
  `shrink-0` + `whitespace-nowrap` won over `whitespace-normal`: "Chaussures & accessoires" (208px) overflowed its
  168px tile and pushed the page to 412px. Now `cn(buttonVariants(...), "min-w-0 shrink whitespace-normal …")`: the
  label wraps on two lines. Rule: overrides go in `cn()` *around* `buttonVariants`, never in its `className`.
- Also, iOS-only guard on the home map: the iframe is `w-px min-w-full` (Safari sizes an iframe to its content and
  ignores `width: 100%`) and the store section's phone column is `minmax(0,1fr)`.
- Verified in the pane at 375px: `scrollWidth` 375 (was 412), labels 144px wide on two lines. Not re-checked on the
  iPhone itself; needs a rebuild on the VM (`git pull && docker build … && docker run …`, DEPLOY.md §4).

### 2026-11-11 — Product page: actions in the title row
- User (desktop): Enregistrer sat under the variant table (read as "save the variants"), Ajouter les variantes under that,
  Supprimer at the very end: a scroll for each. Now the title row holds Voir la boutique · Supprimer (destructive, confirm)
  · Ajouter les variantes (`Modal` with the matrix form, replaces the `<details>` fold) · Enregistrer (`form="product"`,
  the product form's new id). The sticky bottom Save bar stays on phones only (`lg:hidden`), where the title row has
  scrolled away by the end of the list; the title-row Save is `max-lg:hidden` there. Then (user: "the variants table could be too long"): the title row is
  sticky from `lg` (`-mt-10 pt-10` under the main's `p-10`, canvas background, hairline shadow), so a 40-row table scrolls under
  the actions; the sticky images column pins at `top-28` (the row is 104px: 40 + h-10 buttons + 16; a product name long
  enough to wrap the row would overlap it). Nothing changed in the actions.
- Phones (user: "the product form layout is bad on the mobile"): the actions are h-10 (`size="sm"`, desktop too), Supprimer
  is the icon alone below `md` (label `sr-only`), and a variant row is one line: "● colour size" · price (w-20) · stock (w-16)
  · trash, cells `px-1`, the reference hidden (it is on the Stock page). 375px: rows 120 → 73px, page 3120 → 2384px, no
  sideways scroll. The actions still wrap under the title on phones (link + trash, then Ajouter les variantes).
- Produits list on phones (user: the muted line "Accessoires · Variantes 3 · Stock 33 · 1 900 DA" was ambiguous): the
  price now ends the name line (ink, tabular); a first "Accessoires · Variantes : 3 · Stock : 33" line was still "noise"
  (user), so the three facts are chips: category (cloud), "3 variantes" (outline, muted), "Stock 33" (outline, ink /
  amber ≤ lowStock / red 0). Desktop columns unchanged.
- Review before the commit (5 findings, all fixed): the product delete prompt / aria-label now name the product (same trash
  icon and generic prompt as the variant rows otherwise); from `lg` the title row is `flex-nowrap` and the name truncates
  (`title` keeps it), so the row is always 104px under the pinned images column; the colour span got `min-w-0`; the count
  chip has a singular (`t.admin.variantOne` / `variantMany`, `{n}`; `t.admin` values must stay strings, `Notice` indexes
  it); the delete button's overrides moved into `cn()` around `buttonVariants` (the rule from the home-page fix).
- Verified in the pane at 1280×800: all four at y=104, modal opens with the four fields, title-row Save → `?saved=1`
  toast; 375px: no sideways scroll, sticky bar shown, buttons wrap under the title.

### 2026-11-11 — Open Graph link previews
- First item of the feature list (user: "just build the first"). `lib/site.ts`: `siteUrl()` = `SITE_URL` env when set, else
  the request's host + `x-forwarded-proto` (nothing to configure on a bare-IP demo or behind Caddy), `ogImage()` = the upload
  through `/_next/image?w=1200` (a 4 MB photo becomes ~180 KB, under WhatsApp's cap; `.svg` demo files go raw, the
  optimizer answers 400 for them). Root layout: `metadataBase`, `openGraph` (site name, tagline, hero image, `fr_DZ` /
  `ar_DZ`) and `twitter.card` for every page; the product page overrides with name, "6 200 DA · description", first photo
  (`og:image` + alt), `product:price:amount` / `currency`. A product without variants returns no metadata (it's a 404).
  `.env.example` + DEPLOY.md env table mention `SITE_URL` (optional).
- Checked with curl on dev: home and catalog carry the defaults, Pantalon chino its own tags and image URL; a real jpg
  through the optimizer = 200, 183 KB. Not yet seen in WhatsApp itself: paste a product link from the live store once
  redeployed (Facebook's Sharing Debugger shows the same card).

### 2026-11-11 — SEO: sitemap, canonical, JSON-LD
- `app/sitemap.ts` (home, catalog, every `SHOWN_CATEGORY` as `?category=<slug>`, every product with a variant; `siteUrl()`
  for absolute URLs, read at request time) and `app/robots.ts` replacing the static `robots.txt` (same `Disallow: /cart`,
  plus the `Sitemap:` line, which has to be absolute). Catalog `generateMetadata` reads `?category=`: the title is the
  category's name, the canonical `/products?category=<slug>` (size / colour / sort / q combos collapse onto it; unknown slug
  → `/products`). Product page: canonical `/products/<slug>` and a schema.org `Product` JSON-LD (`AggregateOffer` low /
  high price in DZD, `InStock` while any variant has stock, every image absolute, brand = store name); `<` escaped in the
  JSON so a description can't close the script.
- Checked with curl on dev: robots 200 with the sitemap line, sitemap 43 URLs (2 + 23 categories + 18 products),
  `?category=hauts&size=M&sort=price-asc` → title "Hauts", canonical with the category only; JSON-LD parses. Not run through
  Google's Rich Results test (needs the public URL).

### Known gaps / next steps
Keep this section last; update it when something here gets done or newly found.
- **SEO**: `metadataBase`, Open Graph, sitemap, robots, canonicals and Product JSON-LD done 2026-11-11 (`lib/site.ts`,
  `app/sitemap.ts`, `app/robots.ts`). Still missing: a favicon (Next's default), category pages share the home description,
  product `lastModified` is the creation date (no `updatedAt` column). Arabic is invisible to search engines (locale is a
  cookie on the same URL): only `/ar/...` routes + `hreflang` would fix it.
- **Courier integration** (done 2026-11-10 through dzship, see Conventions): one-way parcel creation + tracking.
  Tracking: per order, "Tout actualiser", and a cron script (not running until the server's crontab gets the line);
  no event history shown (only the last status); Sandbox always says `in_transit`. Not done: per-wilaya delivery fee
  (`POST /v1/rates`), relay points pulled from the courier (`POST /v1/desks`) instead of typed by hand, label
  printing for couriers that return none, a second courier at the same time (one courier per shop today), going to a
  courier's own API (Yalidine: `https://api.yalidine.app/v1/parcels`, headers `X-API-ID` / `X-API-TOKEN`, JSON array
  of parcels) to stop sending credentials through a third party. Not verified against a real courier account yet
  (only dzship's sandbox): first real send should be watched (commune spellings, `labelUrl`). Our wilaya / commune
  spellings are mapped by the gateway per courier; never rename stored values.
- Docker: built and run once on a GCP `e2-small` (2026-11-11, demo on a bare IP, no Caddy). HTTPS via Caddy and the
  cron line are still untested on a server.
- Dashboard day buckets and the Commandes date filter follow the server's time zone (Dockerfile sets
  `TZ=Africa/Algiers`, untested). No "delivered on" date exists, so there is no revenue-over-time chart (only order value by
  order date).
- Guest checkout limit is per IP, in memory: fake COD orders from many IPs still hold stock until cancelled.
- Categories: no manual order (alphabetical), no category images (home tiles use the latest product's). With all six
  navbar counts per breakpoint are fixed for today's name lengths: much longer main-category names can overflow
  again (lower the counts in `SHOWN`). On touch screens ≥1024px the hover menus don't open: a tap opens the main
  category's page (its sub-categories are in the catalog's filter column).
- Delivery fee is per wilaya and method only (no per-commune, weight or free-shipping threshold); the tariff table is
  edited by hand (no CSV import / export). Built-in tariff + agencies exist for Yalidine only (`data/yalidine-*.csv`,
  a static copy from 2026-11: re-paste when Yalidine changes its grid); other couriers type theirs, or later pull them
  through dzship's `POST /v1/rates` / `POST /v1/desks`. Relay points have no edit row (delete + re-add).
  The "Expédiée" tab is also where "Prête en boutique" pickup orders sit. Orders placed before communes have `commune = ""`
  (their commune is inside `address`). The commune select is a plain list with type-ahead (Tizi Ouzou: 67), no search box.
- Store name is one value for both languages (FR/AR for tagline, hero title, delivery text only).
- Product images: no main-image choice or ordering. No separate order page in admin (the details panel on Commandes
  is the order view; nothing printable yet).
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
- Admin on phones: Stock's sort toggle lives in the (hidden) table header, so phones get the default order only
  (lowest stock first; a sort select like Commandes' would fix it); inventory saves one row per click and reload.
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
  screen; a sticky price + button bar would fix it), product cards show the lowest variant price with no "Dès" when prices
  differ; `/merci` offers no contact (WhatsApp with the order ref); no swipe on PDP images.
