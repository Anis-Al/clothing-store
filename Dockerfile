# Single-image deploy: Next.js + SQLite file + local uploads. No external services.
FROM node:24-alpine
RUN apk add --no-cache openssl
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build \
 # schema, migrations and seed live outside the /app/prisma volume, so a newer image still applies its migrations
 && mkdir -p db && cp -r prisma/schema.prisma prisma/migrations prisma/seed.ts db/

ENV NODE_ENV=production \
    DATABASE_URL=file:/app/prisma/store.db \
    AUTH_TRUST_HOST=true \
    PORT=3000

VOLUME ["/app/prisma", "/app/public/uploads"]
EXPOSE 3000
CMD ["sh", "docker-entrypoint.sh"]
