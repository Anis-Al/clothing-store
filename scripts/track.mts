// Scheduled parcel tracking:  npm run track:sync   (cron on the server, e.g. every 2 hours: DEPLOY.md)
// Asks the courier (through dzship) about every open order sent to it and not checked in the last
// TRACK_MIN_AGE_MIN minutes (default 60), then moves the orders forward exactly like "Actualiser le suivi".
// Prints one line per run, so the cron log shows what happened.
import { db } from "@/lib/db"
import { syncAll } from "@/lib/tracking"

const s = await db.settings.findUnique({ where: { id: 1 } })
const minAge = Number(process.env.TRACK_MIN_AGE_MIN ?? 60)
const r = s ? await syncAll(s, { minAgeMs: minAge * 60_000 }) : { ready: false, checked: 0, moved: 0, failed: 0 }
const when = new Date().toISOString()
console.log(r.ready
  ? `${when} track:sync checked ${r.checked}, moved ${r.moved}, failed ${r.failed}${r.error ? ` (first error ${r.error})` : ""}`
  : `${when} track:sync skipped: no courier set up in Réglages`)
await db.$disconnect()
if (r.failed && r.failed === r.checked) process.exitCode = 1 // every call failed: let cron mail / log it
