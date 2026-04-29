import { PrismaClient } from '@prisma/client'
import { toSlug, resolveCommonName } from './normalize'
import { computeRelationshipConfidence } from './confidence'
import type { Importer, ImportStats, RawCrop, RawRelationship } from './types'

// Importers — registered in run order (TREFLE must be first to seed botanical names)
// These files are created in later tasks; import them now so the orchestrator compiles once they exist
import { trefleImporter } from './sources/trefle'
import { usdaImporter } from './sources/usda'
import { openFarmImporter } from './sources/openfarm'
import { plantBuddiesImporter } from './sources/plantbuddies'
import { pfafImporter } from './sources/pfaf'

const prisma = new PrismaClient()

const ALL_IMPORTERS: Importer[] = [
  trefleImporter,
  usdaImporter,
  openFarmImporter,
  plantBuddiesImporter,
  pfafImporter,
]

async function upsertCrop(importer: Importer, raw: RawCrop, stats: ImportStats): Promise<void> {
  const slug = raw.slug ?? toSlug(raw.botanicalName)

  const existing = await prisma.crop.findUnique({ where: { botanicalName: raw.botanicalName } })

  if (existing) {
    await prisma.crop.update({
      where: { id: existing.id },
      data: {
        name: raw.name || existing.name,
        minTempC: raw.minTempC ?? existing.minTempC,
        imageUrl: raw.imageUrl ?? existing.imageUrl,
        isNitrogenFixer: raw.isNitrogenFixer ?? existing.isNitrogenFixer,
      },
    })
    stats.cropsUpdated++
  } else {
    await prisma.crop.create({
      data: {
        botanicalName: raw.botanicalName,
        name: raw.name,
        slug,
        minTempC: raw.minTempC ?? null,
        imageUrl: raw.imageUrl ?? null,
        isNitrogenFixer: raw.isNitrogenFixer ?? false,
      },
    })
    stats.cropsCreated++
  }

  const crop = await prisma.crop.findUniqueOrThrow({ where: { botanicalName: raw.botanicalName } })
  await prisma.cropSource.upsert({
    where: { cropId_source: { cropId: crop.id, source: importer.source } },
    create: {
      cropId: crop.id,
      source: importer.source,
      externalId: raw.externalId,
      rawData: raw.rawData as object,
    },
    update: {
      rawData: raw.rawData as object,
      fetchedAt: new Date(),
    },
  })
}

async function resolveCropId(name: string): Promise<string | null> {
  const byBotanical = await prisma.crop.findUnique({ where: { botanicalName: name } })
  if (byBotanical) return byBotanical.id

  const bySlug = await prisma.crop.findUnique({ where: { slug: toSlug(name) } })
  if (bySlug) return bySlug.id

  const botanical = resolveCommonName(name)
  if (botanical) {
    const bySynonym = await prisma.crop.findUnique({ where: { botanicalName: botanical } })
    if (bySynonym) return bySynonym.id
  }

  return null
}

async function upsertRelationship(importer: Importer, raw: RawRelationship, stats: ImportStats): Promise<void> {
  const idA = await resolveCropId(raw.cropNameA)
  const idB = await resolveCropId(raw.cropNameB)

  if (!idA) { stats.unresolved.push(raw.cropNameA); return }
  if (!idB) { stats.unresolved.push(raw.cropNameB); return }

  // Enforce canonical ordering so @@unique([cropAId, cropBId]) works bidirectionally
  const [cropAId, cropBId] = idA < idB ? [idA, idB] : [idB, idA]

  const relationship = await prisma.cropRelationship.upsert({
    where: { cropAId_cropBId: { cropAId, cropBId } },
    create: {
      cropAId,
      cropBId,
      type: raw.type,
      direction: raw.direction,
      reason: raw.reason ?? null,
      confidence: 0.5,
    },
    update: {},
    include: { sources: true },
  })

  const sourceExists = relationship.sources.some(s => s.source === importer.source)
  if (!sourceExists) {
    await prisma.relationshipSource.create({
      data: {
        relationshipId: relationship.id,
        source: importer.source,
        confidence: raw.confidence,
        url: raw.url ?? null,
        notes: raw.notes ?? null,
      },
    })
    stats.relationshipsCreated++
  } else {
    stats.relationshipsUpdated++
  }

  // Recompute derived confidence from all sources
  const sources = await prisma.relationshipSource.findMany({
    where: { relationshipId: relationship.id },
  })
  await prisma.cropRelationship.update({
    where: { id: relationship.id },
    data: { confidence: computeRelationshipConfidence(sources.map(s => s.confidence)) },
  })
}

async function runImporter(importer: Importer): Promise<ImportStats> {
  const stats: ImportStats = {
    source: importer.source,
    cropsCreated: 0,
    cropsUpdated: 0,
    relationshipsCreated: 0,
    relationshipsUpdated: 0,
    unresolved: [],
  }

  console.log(`[${importer.source}] Starting...`)

  if (importer.fetchCrops) {
    for await (const raw of importer.fetchCrops()) {
      await upsertCrop(importer, raw, stats)
    }
  }

  if (importer.fetchRelationships) {
    for await (const raw of importer.fetchRelationships()) {
      await upsertRelationship(importer, raw, stats)
    }
  }

  const unique = [...new Set(stats.unresolved)]
  console.log(
    `[${importer.source}] crops +${stats.cropsCreated} ~${stats.cropsUpdated} | relationships +${stats.relationshipsCreated} ~${stats.relationshipsUpdated}`
  )
  if (unique.length > 0) {
    console.warn(`[${importer.source}] Unresolved (${unique.length}): ${unique.join(', ')}`)
  }

  return stats
}

async function main(): Promise<void> {
  const target = process.argv[2]?.toUpperCase()
  const importers = target
    ? ALL_IMPORTERS.filter(i => i.source === target)
    : ALL_IMPORTERS

  if (importers.length === 0) {
    console.error(`Unknown source: ${target}`)
    console.error(`Available: ${ALL_IMPORTERS.map(i => i.source).join(', ')}`)
    process.exit(1)
  }

  for (const importer of importers) {
    await runImporter(importer)
  }

  await prisma.$disconnect()
}

main().catch(async e => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
