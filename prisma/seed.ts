import fs from "node:fs"
import path from "node:path"
import bcrypt from "bcryptjs"
import { PrismaClient } from "@prisma/client"
import { makeSku, slugify, swatch } from "../lib/utils"
import { UPLOAD_DIR } from "../lib/uploads"

const prisma = new PrismaClient()

// Men's store. Main category → sub-categories (the navbar shows the main ones, sub-categories on hover).
const CATEGORIES: Record<string, string[]> = {
  "Hauts": ["Chemises", "T-shirts", "Polos", "Pulls", "Sweats & hoodies"],
  "Bas": ["Pantalons", "Jeans", "Shorts"],
  "Vestes & manteaux": ["Vestes", "Manteaux"],
  "Tenues": ["Costumes", "Survêtements", "Qamis"],
  "Nuit & sous-vêtements": ["Pyjamas", "Sous-vêtements"],
  "Chaussures & accessoires": ["Chaussures", "Accessoires"],
}

// Flat studio-style placeholder renders (garment silhouette on soft-cloud), one per color.
const SHAPES = {
  shirt: "M150 70 L210 50 Q250 80 290 50 L350 70 L420 150 L370 190 L345 165 L345 440 L155 440 L155 165 L130 190 L80 150 Z",
  pants: "M165 60 L335 60 L360 440 L275 440 L250 170 L225 440 L140 440 Z",
}
function placeholder(file: string, shape: keyof typeof SHAPES, color: string) {
  const fill = swatch(color)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="1000" height="1000"><rect width="500" height="500" fill="#f5f5f5"/><path d="${SHAPES[shape]}" fill="${fill}" stroke="#cacacb" stroke-width="2" stroke-linejoin="round"/></svg>`
  fs.writeFileSync(path.join(UPLOAD_DIR, file), svg)
  return `/uploads/${file}`
}

const PRODUCTS = [
  {
    name: "Chemise Oxford", slug: "chemise-oxford", category: "chemises", shape: "shirt" as const, price: 4500,
    description: "Chemise en coton Oxford, coupe droite, col boutonné. Se porte rentrée ou ouverte sur un t-shirt.",
    colors: ["Blanc", "Bleu ciel"], sizes: ["S", "M", "L", "XL"],
  },
  {
    name: "Chemise en lin", slug: "chemise-en-lin", category: "chemises", shape: "shirt" as const, price: 5900,
    description: "Lin lavé, léger et respirant pour l'été. Coupe ample, manches longues retroussables.",
    colors: ["Beige", "Noir", "Kaki"], sizes: ["S", "M", "L"],
  },
  {
    name: "Pantalon chino", slug: "pantalon-chino", category: "pantalons", shape: "pants" as const, price: 6200,
    description: "Chino en sergé de coton stretch, coupe ajustée, finitions surpiquées.",
    colors: ["Beige", "Marine", "Noir"], sizes: ["38", "40", "42", "44"],
  },
]

async function main() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })

  await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: { username: "admin", passwordHash: await bcrypt.hash("password", 10), role: "ADMIN" },
  })

  // Demo categories + products only go into an empty store: categories are managed in /admin/settings/categories,
  // so a restart must never bring back one the admin deleted.
  if ((await prisma.category.count()) || (await prisma.product.count()))
    return console.log("Catalogue déjà rempli, démo ignorée.")

  // The shop only lists categories that have products; the rest wait in the admin.
  const cats: Record<string, { id: string }> = {}
  for (const [main, subs] of Object.entries(CATEGORIES)) {
    const parent = await prisma.category.create({ data: { name: main, slug: slugify(main) } })
    for (const name of subs)
      cats[slugify(name)] = await prisma.category.create({ data: { name, slug: slugify(name), parentId: parent.id } })
  }

  for (const p of PRODUCTS) {
    const product = await prisma.product.create({
      data: {
        name: p.name, slug: p.slug, description: p.description, categoryId: cats[p.category].id,
        variants: {
          create: p.colors.flatMap((color, ci) =>
            p.sizes.map((size, si) => ({
              color, size, price: p.price, sku: makeSku(p.slug, color, size),
              // a few sold-out combos so the disabled "Ajouter au panier" state is visible
              stockCount: (ci + si) % 4 === 3 ? 0 : 5 + ((ci * 7 + si * 3) % 20),
            })),
          ),
        },
      },
      include: { variants: true },
    })
    for (const color of p.colors) {
      const variant = product.variants.find((v) => v.color === color)!
      const url = placeholder(`seed-${p.slug}-${variant.sku.toLowerCase()}.svg`, p.shape, color)
      await prisma.image.create({ data: { url, productId: product.id, variantId: variant.id } })
    }
  }
  console.log("Seed OK — admin / password")
}

main().finally(() => prisma.$disconnect())
