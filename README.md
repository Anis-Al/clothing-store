# ATELIER — boutique de vêtements auto-hébergée

Next.js 16 + SQLite + images sur disque. Aucun service cloud. Interface en français et en arabe.

## Démarrage local

```bash
npm install
cp .env.example .env        # puis remplir AUTH_SECRET (npx auth secret)
npm run db:migrate          # crée prisma/dev.db et lance le seed
npm run dev                 # http://localhost:3000
```

Admin : identifiant `admin` / mot de passe `password` → `/admin`. Changez-le : `npm run admin:set -- admin "nouveau-mot-de-passe"`.

## Docker

```bash
docker build -t atelier .
docker run -p 3000:3000 -v atelier-db:/app/prisma -v atelier-uploads:/app/public/uploads atelier
```

Au démarrage le conteneur applique les migrations, lance le seed (idempotent) et génère un
`AUTH_SECRET` persistant s'il n'est pas fourni (`-e AUTH_SECRET=...`).

Mise en production (serveur, HTTPS, sauvegardes, mises à jour) : [DEPLOY.md](DEPLOY.md).
Journal de développement et conventions : [CLAUDE.md](CLAUDE.md).
