/**
 * Populate Crop.canonicalName by stripping author citations from botanicalName.
 *
 * "Allium L."                              → "Allium"
 * "Zea mays L."                            → "Zea mays"
 * "Abies balsamea (L.) Mill."              → "Abies balsamea"
 * "Glycine max (L.) Merr."                 → "Glycine max"
 * "Allium cepa var. aggregatum G.Don"      → "Allium cepa var. aggregatum"
 *
 * Only writes when the stripped name differs from botanicalName.
 * Idempotent — safe to re-run.
 *
 * Usage:
 *   pnpm enrich:populate-canonical-names
 *   pnpm enrich:populate-canonical-names --dry-run
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function stripAuthor(botanicalName: string): string | null {
  // Remove parenthetical author citations: "(L.)", "(DC.)", "(Royle ex D.Don)", etc.
  let s = botanicalName.replace(/\s*\([^)]+\)/g, '')
  // Strip trailing author tokens: "L.", "DC.", "Mill.", "G.Don", "ex Carrière", etc.
  // An author token starts with a capital letter or "ex " followed by capital.
  s = s.replace(/(\s+(?:ex\s+)?[A-Z][a-zA-Z'.-]*\.?)+\s*$/, '').trim()
  if (!s || s === botanicalName.trim()) return null
  return s
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const crops = await prisma.crop.findMany({
    select: { id: true, botanicalName: true, canonicalName: true },
  })

  let updated = 0
  let skipped = 0

  for (const crop of crops) {
    const canonical = stripAuthor(crop.botanicalName)
    if (!canonical) { skipped++; continue }
    if (crop.canonicalName === canonical) { skipped++; continue }

    if (dryRun) {
      console.log(`  ${crop.botanicalName}  →  ${canonical}`)
    } else {
      await prisma.crop.update({
        where: { id: crop.id },
        data:  { canonicalName: canonical },
      })
    }
    updated++
  }

  await prisma.$disconnect()
  if (dryRun) {
    console.log(`\n[dry-run] Would update ${updated} crops (${skipped} unchanged).`)
  } else {
    console.log(`Done. Updated ${updated} crops, ${skipped} already correct or no author suffix.`)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
