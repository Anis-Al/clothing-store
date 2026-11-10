# Deploying on Google Cloud (Compute Engine)

The short version: rent one small Linux VM, then follow `DEPLOY.md` §3 on it. The app needs a long-running
Node process and a writable disk (SQLite file + uploaded photos), so **Compute Engine** fits; Cloud Run and App
Engine don't (their disk is wiped on every restart).

> **Demo / staging only for a real Algerian shop.** Loi 18-05 asks for a site hosted in Algeria under `.com.dz`.
> Use GCP to show the store or test it; put the live store on an Algerian VPS (same steps from §3 of `DEPLOY.md`).

Commands below use the `gcloud` CLI (install: <https://cloud.google.com/sdk/docs/install>, then `gcloud init`).
Everything also exists in the web console; the console path is given next to each step.

---

## 1. Project and billing (once)

Console → select or create a project → **Billing** → link a billing account → **Compute Engine** → Enable.

```bash
gcloud config set project YOUR_PROJECT_ID
gcloud services enable compute.googleapis.com
```

## 2. Create the VM

| Choice | Pick | Why |
|---|---|---|
| Machine | `e2-small` (2 GB RAM, ~13 $/month) | builds the image without trouble. `e2-micro` (1 GB) is free in `us-west1` / `us-central1` / `us-east1` but needs the swap step and builds slowly. |
| Region | `europe-west9` (Paris) or `europe-southwest1` (Madrid) | closest to Algeria. |
| Image | Ubuntu 24.04 LTS | what `DEPLOY.md` assumes. |
| Disk | 30 GB balanced | system + Docker image + photos + backups. |
| Firewall | allow HTTP **and** HTTPS | Caddy needs 80 (certificate) and 443. |

Console: Compute Engine → VM instances → **Create instance**, fill in the table, tick *Allow HTTP traffic* and
*Allow HTTPS traffic*. Or:

```bash
gcloud compute instances create atelier \
  --zone=europe-west9-a --machine-type=e2-small \
  --image-family=ubuntu-2404-lts-amd64 --image-project=ubuntu-os-cloud \
  --boot-disk-size=30GB --boot-disk-type=pd-balanced \
  --tags=http-server,https-server
```

```bash
# only if these rules don't exist yet in the project (the console checkboxes create them)
gcloud compute firewall-rules create default-allow-http  --allow=tcp:80  --target-tags=http-server
gcloud compute firewall-rules create default-allow-https --allow=tcp:443 --target-tags=https-server
```

## 3. Fixed IP address

A new VM gets an IP that changes when it is stopped. Keep it: Console → VPC network → IP addresses → the VM's
external address → **Promote to static**. Or:

```bash
gcloud compute instances describe atelier --zone=europe-west9-a --format="get(networkInterfaces[0].accessConfigs[0].natIP)"
gcloud compute addresses create atelier-ip --region=europe-west9 --addresses=THE_IP_FROM_ABOVE
```

## 4. Domain

At your domain registrar, add an **A record**: `boutique.example.com` → the static IP. Wait until
`nslookup boutique.example.com` answers that IP.

No domain yet (demo)? Use `THE-IP-WITH-DASHES.sslip.io` (e.g. `34-155-10-20.sslip.io`): it resolves to that IP and
Caddy gets a real certificate for it.

## 5. Connect

```bash
gcloud compute ssh atelier --zone=europe-west9-a
```

(Console: the **SSH** button on the VM row opens a terminal in the browser.)

## 6. Install and start the store

On the VM, follow `DEPLOY.md` from §3.1 to §3.6, in order:

1. **3.1** Docker, swap (on `e2-micro`), firewall. `ufw` is optional on GCP (its firewall already filters), harmless if kept.
2. **3.2** Get the code. From GitHub: `git clone https://github.com/<you>/clothing-store.git /srv/atelier`
   (a private repository asks for your GitHub user and a personal access token as the password).
3. **3.3** `/srv/atelier.env`. For a **demo**, leave `SEED_DEMO` out (the store starts with the 3 demo products);
   for a real store, `SEED_DEMO=0`.
4. **3.4** `docker build` + `docker run`.
5. **3.5** Caddy with your domain (or the `sslip.io` name).
6. **3.6** Change the admin password at once (`admin` / `password` is public).

Then open `https://your-domain`, and `https://your-domain/admin?debug=1` for Réglages (shop name, courier,
delivery methods…).

### Optional: bring your local demo data

The server starts with an empty shop (plus demo products). To show it with your PC's data (products, orders,
Yalidine tariff, relay points), copy your local database and photos over the fresh ones, before anyone uses it:

```bash
# on your PC, from the project folder
npm run db:backup                                    # → prisma/backups/store-….db
gcloud compute scp prisma/backups/store-YYYY-MM-DD-HH-MM.db atelier:~/store.db --zone=europe-west9-a
tar czf uploads.tgz -C public/uploads .
gcloud compute scp uploads.tgz atelier:~/ --zone=europe-west9-a
```

```bash
# on the VM
docker stop atelier
docker run --rm -v atelier-db:/data -v ~/:/in alpine cp /in/store.db /data/store.db
docker run --rm -v atelier-uploads:/data -v ~/:/in alpine tar xzf /in/uploads.tgz -C /data
docker start atelier && docker logs -f atelier     # migrations run again: nothing to apply, then "Ready"
```

That database carries your local admin password too: change it with §3.6 afterwards.

## 7. Keep it running

- **Updates, backups, tracking cron:** `DEPLOY.md` §4 and §5, unchanged.
- **Disk snapshots** (extra safety, whole VM): Console → Compute Engine → Snapshots → *Create snapshot schedule*
  (daily, keep 7), then attach it to the VM's disk.
- **Cost:** a stopped VM (`gcloud compute instances stop atelier --zone=europe-west9-a`) costs only its disk and
  static IP (a static IP not attached to a running VM is billed more). Delete the VM, disk and IP when the demo is over.
- **Budget alert:** Console → Billing → Budgets & alerts → a monthly budget with an e-mail at 50 / 90 / 100 %.
