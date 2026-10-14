# Deploying ATELIER

How to run and test the store on your PC, then put it online, keep it running, back it up and update it.

> **Status:** the production commands below (`migrate deploy` → seed → `next start`) were run and
> tested locally. The `docker build` itself has **not** been run yet (Docker wasn't set up on the dev
> machine). Expect to fix small issues on the first real build. Troubleshooting is at the end.

---

## 0. Run and test locally (dev mode)

### 0.1 First time

Needs **Node.js 22.18+** (24 recommended) and npm. Works on Windows, macOS and Linux.

```bash
cd clothing-store
npm install
cp .env.example .env
```

Open `.env` and set `AUTH_SECRET` to a random value. To get one:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Then:

```bash
npm run db:migrate   # creates prisma/dev.db, applies migrations, runs the seed the first time
npm run dev          # http://localhost:3000
```

- Shop: <http://localhost:3000>. Admin: <http://localhost:3000/admin>, login `admin` / `password`.
- Language: the "العربية / Français" link in the top bar.
- Pages reload by themselves when you save a file.

### 0.2 Every day

```bash
npm run dev
```

If the database already exists, `db:migrate` doesn't re-run the seed. Use `npm run db:seed` for that
(it only adds what's missing: the admin user, plus demo categories and products into an empty store).

### 0.3 Checks before you deploy

```bash
npm run typecheck   # TypeScript
npm run lint        # ESLint
npm test            # unit tests (phone numbers, wilayas, sizes, slugs)
npm run build       # production build; must finish without errors
```

**Stop `npm run dev` before `npm run build`.** Both write to `.next/`, and running them together
leaves the dev server serving stale code.

### 0.4 Try the production build locally

```bash
npm run build
npm start           # http://localhost:3000, same as on the server minus Docker
```

### 0.5 Try the Docker image locally (optional)

Needs Docker Desktop installed **and started**.

```bash
docker build -t atelier .
docker run --rm -p 3000:3000 \
  -v atelier-test-db:/app/prisma -v atelier-test-uploads:/app/public/uploads atelier
# stop with Ctrl+C; throw the test data away with:
docker volume rm atelier-test-db atelier-test-uploads
```

### 0.6 Manual test run (10 minutes)

Run this after any meaningful change, on desktop and at phone width (browser dev tools → device toolbar):

1. **Catalog** `/products`: filter by category, size and colour; sort by price; search for "chemise".
2. **Product page:** switch colours (photos change). Pick a sold-out size (struck through): the button
   says "Épuisé" and is disabled. Pick an available size, then "Ajouter au panier": a card pops up bottom-right.
3. **Cart → order:** fill in the form. Use a mobile number like `0555 12 34 56` (`+213…` also
   works; landlines such as `021…` are refused). Pick a wilaya and submit. You land on `/merci`
   with the order number and summary.
4. **Admin** `/admin/orders`: the order is there with name, phone and wilaya. Change its status and
   check the tab counts and the badge in the sidebar.
5. **Admin products:** create a product with 2 colours × 3 sizes, upload a JPG/PNG for one colour, and
   check that the product page shows that photo for that colour.
6. **Stock:** `/admin/inventory`: change a stock number and save. Set one to 0 and check the size
   shows as sold out in the shop.
7. **Arabic:** switch language and repeat 1–3 quickly. The layout must mirror (right-to-left).

### 0.7 Useful dev commands

| Need | Command |
|---|---|
| Look at / edit the database in a browser UI | `npx prisma studio` |
| Wipe the local DB and start fresh (deletes everything, re-seeds) | `npx prisma migrate reset` |
| Change a local admin password | `npm run admin:set -- admin "new-password"` |
| Snapshot the local DB | `npm run db:backup` → `prisma/backups/` |
| After editing `prisma/schema.prisma` | `npm run db:migrate -- --name what-changed` |

### 0.8 Dev gotchas

- **Windows: `EPERM … query_engine-windows.dll.node`** when migrating or running `prisma generate`:
  the dev server holds the file. Stop `npm run dev`, run the command, start again.
- **A change doesn't show up:** restart `npm run dev`. This happens especially after a `npm run build`,
  or after editing plain CSS (not Tailwind classes) in `app/globals.css`.
- **TypeScript errors about a page you deleted** (`.next/dev/types/…`): delete `.next/dev/types` and
  run `npm run typecheck` again.
- Uploaded test photos go to `public/uploads/`, and the local DB is `prisma/dev.db`. Neither is committed
  to git, and neither ends up in the Docker image.

---

## 1. What you are deploying

One Node.js process. No external services.

| Piece | Where it lives | Survives restarts because… |
|---|---|---|
| App (Next.js 16) | the Docker image | rebuilt on each update |
| Database (SQLite file) | `/app/prisma/store.db` | Docker volume `atelier-db` |
| Uploaded product photos | `/app/public/uploads/` | Docker volume `atelier-uploads` |
| Login secret (`AUTH_SECRET`) | `/app/prisma/.auth-secret`, or an env var | stored in the DB volume |

On every start the container does this by itself:
1. Applies new database migrations (`prisma migrate deploy`).
2. Runs the seed. It creates the `admin` user if it's missing. Demo categories and products are only
   added to an **empty** store, so a restart never overwrites (or brings back) your categories and products.
3. Starts the site on port 3000.

### Environment variables

| Variable | Required | Default / note |
|---|---|---|
| `AUTH_SECRET` | no | Generated once and kept in the DB volume if not set. Set it yourself to control it (`openssl rand -base64 32`). Changing it logs the admin out. |
| `DATABASE_URL` | no | `file:/app/prisma/store.db` (set in the image) |
| `AUTH_TRUST_HOST` | no | `true` (set in the image; needed behind a reverse proxy) |
| `PORT` | no | `3000` |

---

## 2. Server requirements

- A Linux VPS (Ubuntu 24.04 is assumed below). **1 vCPU / 1 GB RAM** runs the shop fine.
  **Building** the image needs about **2 GB**, so add swap on a 1 GB server (step 3.1).
- A domain name with an **A record** pointing to the server's IP (e.g. `boutique.example.dz`).
- Ports **80** and **443** open. Port 3000 should **not** be public.
- Internet access while building (npm packages and Google Fonts are downloaded at build time).
  The running site needs no outside service.

---

## 3. Deploy with Docker (recommended)

### 3.1 Prepare the server (once)

```bash
# Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # then log out and back in

# 2 GB swap, only if the server has ≤ 2 GB RAM (the build needs it)
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Firewall: SSH + web only
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
```

### 3.2 Get the code onto the server

Either push the project to a private Git repository and clone it:

```bash
git clone <your-repo-url> /srv/atelier
```

or copy it from your PC (without `node_modules`, `.next`, `.env`, `prisma/*.db`, `public/uploads`):

```bash
rsync -av --exclude node_modules --exclude .next --exclude '.env*' --exclude 'prisma/*.db*' --exclude public/uploads ./clothing-store/ user@server:/srv/atelier/
```

### 3.3 Configure

Create `/srv/atelier.env` (outside the project folder, so updates never touch it):

```bash
# AUTH_SECRET=...   optional, see the table above
```

Store name, WhatsApp number, delivery fee and the rest are set later in the admin, `/admin/settings`.

### 3.4 Build and start

```bash
cd /srv/atelier
docker build -t atelier .

docker run -d --name atelier --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  --env-file /srv/atelier.env \
  -v atelier-db:/app/prisma \
  -v atelier-uploads:/app/public/uploads \
  atelier

docker logs -f atelier    # migrations applied → "Seed OK — admin / password" (first start) → "Ready"
```

`127.0.0.1:3000` means only the server itself can reach the app; the web server below publishes it.

### 3.5 HTTPS with Caddy

Caddy gets and renews the Let's Encrypt certificate automatically.

```bash
sudo apt install -y caddy
```

Replace `/etc/caddy/Caddyfile` with:

```
boutique.example.dz {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000
}
```

```bash
sudo systemctl reload caddy
```

Open `https://boutique.example.dz`. If you use **nginx** instead, set `client_max_body_size 10m;`.
Otherwise image uploads over 1 MB fail with a 413 error. The app itself accepts up to 10 MB per request and 8 MB per image.

### 3.6 First login: change the admin password (do this right away)

The seeded login is `admin` / `password`. Change it:

```bash
docker exec atelier npx tsx scripts/admin.mts admin 'a-long-new-password'
```

The same command creates another admin if you give it a new username
(`... scripts/admin.mts karim 'his-password'`). The admin login page is `/admin`; it isn't linked anywhere in the shop.

After 10 wrong passwords for a username, that username is locked for 15 minutes ("Trop de tentatives").
The lock lives in memory: `docker restart atelier` clears it.

### 3.7 Optional: docker compose instead of `docker run`

`/srv/atelier/compose.yaml`:

```yaml
services:
  atelier:
    build: .
    image: atelier
    container_name: atelier
    restart: unless-stopped
    ports: ["127.0.0.1:3000:3000"]
    env_file: /srv/atelier.env
    volumes:
      - atelier-db:/app/prisma
      - atelier-uploads:/app/public/uploads
volumes:
  atelier-db:
  atelier-uploads:
```

Then use `docker compose up -d --build` to deploy or update, and `docker compose logs -f` for the logs.

---

## 4. Updating to a new version

```bash
cd /srv/atelier
git pull                          # or rsync the new files again
docker build -t atelier .
docker stop atelier && docker rm atelier
# same docker run command as 3.4
```

Data is in the volumes, so it survives. New migrations are applied automatically when the container
starts. **Take a backup before updating** (section 5).

---

## 5. Backups

There are two things to back up: the **database** and the **photos**.

```bash
# 1) database: consistent snapshot, safe while the shop is running
docker exec atelier npx tsx scripts/backup.mts
#   → /app/prisma/backups/store-YYYY-MM-DD-HH-MM.db (inside the DB volume)
docker cp atelier:/app/prisma/backups ./atelier-backups

# 2) photos
docker run --rm -v atelier-uploads:/data -v "$PWD":/backup alpine \
  tar czf /backup/uploads-$(date +%F).tgz -C /data .
```

Keep copies **off the server** (your PC, another server, cloud storage). A backup kept only on the same VPS is lost if the VPS is lost.

**Nightly, automatic** (`crontab -e` on the server):

```
30 3 * * * docker exec atelier npx tsx scripts/backup.mts >/dev/null 2>&1
45 3 * * * docker run --rm -v atelier-uploads:/data -v /srv/backups:/backup alpine tar czf /backup/uploads-$(date +\%F).tgz -C /data .
```

Old DB snapshots pile up in `/app/prisma/backups`; delete old ones from time to time.

### Restore

```bash
docker stop atelier
docker run --rm -v atelier-db:/data -v "$PWD":/backup alpine \
  cp /backup/store-2026-10-11-03-30.db /data/store.db
docker run --rm -v atelier-uploads:/data -v "$PWD":/backup alpine \
  sh -c "rm -rf /data/* && tar xzf /backup/uploads-2026-10-11.tgz -C /data"
docker start atelier
```

---

## 6. Running without Docker (alternative)

Needs Node.js **22+** (24 recommended) on the server.

```bash
cd /srv/atelier
npm ci
cat > .env <<'EOF'
DATABASE_URL="file:/srv/atelier-data/store.db"
AUTH_SECRET="paste-output-of: openssl rand -base64 32"
AUTH_TRUST_HOST=true
EOF
mkdir -p /srv/atelier-data
npx prisma migrate deploy
npx tsx prisma/seed.ts
npm run build
```

systemd unit `/etc/systemd/system/atelier.service`:

```ini
[Unit]
Description=ATELIER store
After=network.target

[Service]
WorkingDirectory=/srv/atelier
EnvironmentFile=/srv/atelier/.env
ExecStart=/usr/bin/npm start
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

```bash
sudo chown -R www-data /srv/atelier /srv/atelier-data
sudo systemctl enable --now atelier
```

Put Caddy in front exactly as in 3.5. Photos live in `/srv/atelier/public/uploads`: back them up, and
never delete that folder when updating. To update: `git pull && npm ci && npx prisma migrate deploy && npm run build && sudo systemctl restart atelier`.

---

## 7. Making it your store

| What | Where |
|---|---|
| Store name, tagline, home banner (title + image), WhatsApp number, delivery fee and delivery text, "Stock faible" threshold | Admin → **Réglages** (`/admin/settings`). No rebuild. Empty text fields use the built-in defaults. |
| All other interface text (FR + AR) | `lib/dict.ts` (edit both `fr` and `ar`) |
| Colours, radii | `app/globals.css` (`@theme` block) |
| Fonts | `app/layout.tsx` |
| Categories | Admin → **Réglages › Catégories** (`/admin/settings/categories`): main categories (shown in the navbar) and their sub-categories (shown on hover). Add, rename, move, delete when empty. Categories without products are hidden in the shop. The demo list for a fresh store is in `prisma/seed.ts`. |
| Demo products | Delete them in `/admin/products` once your real products are in. A product that already has orders can't be deleted; set its stock to 0 instead. |
| Wilayas list | `lib/wilayas.ts` |

Apart from the admin screens (Réglages, Catégories, products), every customization is a code change, so rebuild the image afterwards (section 4).

---

## 8. Day-to-day

| Task | Command |
|---|---|
| See logs | `docker logs -f atelier` |
| Restart | `docker restart atelier` |
| Change / add admin | `docker exec atelier npx tsx scripts/admin.mts <user> '<password>'` |
| Backup now | `docker exec atelier npx tsx scripts/backup.mts` |
| Disk used by data | `docker system df -v` |

---

## 9. Security checklist

- [ ] Admin password changed from `password` (3.6).
- [ ] Site only reachable over HTTPS; port 3000 bound to `127.0.0.1`.
- [ ] Firewall allows only SSH, 80, 443.
- [ ] Nightly backups, copied off the server.
- [ ] `/srv/atelier.env` readable only by you (`chmod 600`).
- [ ] Keep an eye on fake orders. Anyone can place a cash-on-delivery order, and it reserves stock.
      There is no rate limit on orders: cancel fake ones ("Annulée") and their stock comes back.

---

## 10. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Build killed / `JavaScript heap out of memory` | Not enough RAM: add swap (3.1). |
| Build fails fetching `fonts.googleapis.com` | The server has no internet during the build: allow it, or build the image elsewhere and `docker save` / `docker load` it. |
| `prisma` error about OpenSSL / `libssl` | The image installs `openssl`. If you changed the base image, keep `apk add openssl` and the `linux-musl-openssl-3.0.x` binary target in `prisma/schema.prisma`. |
| Login redirects back to `/login` forever | `AUTH_SECRET` changed between restarts, or cookies are blocked. Set a fixed `AUTH_SECRET`. |
| `UntrustedHost` error in logs | `AUTH_TRUST_HOST=true` is missing (it's set in the image; check your env file doesn't override it). |
| Image upload fails, "413" | The reverse proxy's body limit: nginx needs `client_max_body_size 10m;`. |
| Uploaded photos missing after an update | The container was started without `-v atelier-uploads:/app/public/uploads`. |
| Orders / products gone after an update | The container was started without `-v atelier-db:/app/prisma`. Restore from backup (section 5). |
| `docker-entrypoint.sh: not found` or `\r` errors | The file got Windows line endings. `.gitattributes` forces LF; if you copied it by hand, run `sed -i 's/\r$//' docker-entrypoint.sh`. |
