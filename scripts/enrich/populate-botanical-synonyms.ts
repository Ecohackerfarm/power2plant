/**
 * Populate BotanicalSynonym from USDA CropSource data.
 *
 * USDA rawData has "Synonym Symbol" and "Accepted Symbol" fields.
 * When a crop's Symbol != Accepted Symbol, the crop's Scientific Name is
 * a synonym and the accepted crop is the canonical one. This script creates
 * a BotanicalSynonym row on the accepted crop pointing at the synonym name.
 *
 * Also mines the "Scientific Name" field to catch cases where the stored
 * botanicalName differs from the USDA name (import normalisation artifacts).
 *
 * Usage:
 *   pnpm enrich:populate-botanical-synonyms
 *   pnpm enrich:populate-botanical-synonyms --dry-run
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface UsdaRawData {
  Symbol?: string
  'Synonym Symbol'?: string
  'Accepted Symbol'?: string
  'Scientific Name'?: string
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const cropFlagIdx = process.argv.indexOf('--crop')
  const cropFilter = cropFlagIdx !== -1 ? process.argv[cropFlagIdx + 1] : undefined

  if (cropFilter) console.log(`[--crop] Filtering to crops matching: "${cropFilter}"`)

  const sources = await prisma.cropSource.findMany({
    where: { source: 'USDA' },
    select: { cropId: true, rawData: true, crop: { select: { botanicalName: true } } },
  })

  const filteredSources = cropFilter
    ? sources.filter(s => s.crop.botanicalName.toLowerCase().includes(cropFilter.toLowerCase()))
    : sources

  // Build symbol → cropId map from all USDA sources
  const symbolToCropId = new Map<string, string>()
  for (const s of filteredSources) {
    const d = s.rawData as UsdaRawData
    if (d.Symbol) symbolToCropId.set(d.Symbol, s.cropId)
  }

  let created = 0
  let skipped = 0

  for (const s of filteredSources) {
    const d = s.rawData as UsdaRawData
    const symbol         = d.Symbol ?? ''
    const acceptedSymbol = d['Accepted Symbol'] ?? ''
    const scientificName = d['Scientific Name']

    if (!scientificName) continue

    // This entry IS a synonym: point at the accepted crop
    if (acceptedSymbol && acceptedSymbol !== symbol) {
      const acceptedCropId = symbolToCropId.get(acceptedSymbol)
      if (!acceptedCropId) continue

      if (dryRun) {
        console.log(`  synonym: "${scientificName}" → accepted symbol ${acceptedSymbol} (cropId ${acceptedCropId})`)
      } else {
        await prisma.botanicalSynonym.upsert({
          where:  { cropId_name: { cropId: acceptedCropId, name: scientificName } },
          create: { cropId: acceptedCropId, name: scientificName, source: 'usda' },
          update: {},
        })
      }
      created++
      continue
    }

    // Same symbol accepted — check if USDA Scientific Name differs from stored botanicalName
    const crop = await prisma.crop.findUnique({
      where:  { id: s.cropId },
      select: { botanicalName: true },
    })
    if (!crop) continue
    if (scientificName === crop.botanicalName) { skipped++; continue }

    if (dryRun) {
      console.log(`  alt name: crop ${s.cropId}: "${scientificName}" vs stored "${crop.botanicalName}"`)
    } else {
      await prisma.botanicalSynonym.upsert({
        where:  { cropId_name: { cropId: s.cropId, name: scientificName } },
        create: { cropId: s.cropId, name: scientificName, source: 'usda' },
        update: {},
      })
    }
    created++
  }

  await prisma.$disconnect()
  if (dryRun) {
    console.log(`\n[dry-run] Would create ${created} synonym rows (${skipped} no difference).`)
  } else {
    console.log(`Done. Created/verified ${created} BotanicalSynonym rows, ${skipped} no difference.`)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
