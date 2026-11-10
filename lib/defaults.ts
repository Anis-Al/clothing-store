// relative imports: prisma/seed.ts loads this under tsx, outside Next's "@/" alias
import { parseCsv } from "./csv"
import { WILAYAS, wilayaValue } from "./wilayas"

// Yalidine's delivery data, loaded on demand from Réglages › Transporteur when the shop's courier is Yalidine (or a
// sister network) — never seeded, other couriers have their own tariffs and points: data/yalidine-fees.csv (tariff per
// destination: home / stop-desk) and data/yalidine-desks.csv (200 agencies with their stop-desk id), as given.

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "")
// the courier's spelling → our stored "16 - Alger" value (names compared without accents, case or punctuation)
const ALIASES: Record<string, string> = { elmenia: "58" }
export function wilayaFor(name: string) {
  const n = norm(name)
  const w = WILAYAS.find((x) => x[0] === ALIASES[n] || norm(x[1]) === n)
  return w ? wilayaValue(w) : undefined
}

// The 2019 wilayas (49–58) are missing from a 48-row tariff: they take their former parent's.
const PARENT: Record<string, string> = { "49": "01", "50": "01", "51": "07", "52": "08", "53": "11", "54": "11", "55": "30", "56": "33", "57": "39", "58": "47" }

export type WilayaFee = { wilaya: string; home: number; desk: number }
// Columns: Destination, Zone, Délai, Tarif à domicile, Tarif stop-desk, Tarif retour. One row per wilaya, all 58.
export function parseFees(csv: string): WilayaFee[] {
  const byCode: Record<string, [number, number]> = {}
  for (const r of parseCsv(csv).slice(1)) {
    const w = wilayaFor(r[0] ?? "")
    if (w) byCode[w.slice(0, 2)] = [Number(r[3]) || 0, Number(r[4]) || 0]
  }
  return WILAYAS.map((w) => {
    const [home, desk] = byCode[w[0]] ?? byCode[PARENT[w[0]]] ?? [0, 0]
    return { wilaya: wilayaValue(w), home, desk }
  })
}

export type DeskRow = { deskId: string; wilaya: string; commune: string; name: string; address: string }
// Columns: Stop desk ID, Wilaya, Commune, Nom, Adresse, GPS. A few addresses hold an unquoted comma, so the address
// is everything between Nom and the (always empty) last column.
export function parseDesks(csv: string): DeskRow[] {
  const out: DeskRow[] = []
  for (const r of parseCsv(csv).slice(1)) {
    const wilaya = wilayaFor(r[1] ?? "")
    const deskId = (r[0] ?? "").trim()
    if (!wilaya || !deskId || !r[3]) continue
    out.push({ deskId, wilaya, commune: r[2].trim(), name: r[3].trim().slice(0, 60), address: r.slice(4, -1).map((s) => s.trim()).filter(Boolean).join(", ").slice(0, 200) })
  }
  return out
}
