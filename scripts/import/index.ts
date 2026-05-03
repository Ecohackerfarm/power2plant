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

async function uniqueSlug(baseSlug: string): Promise<string> {
  const existing = await prisma.crop.findUnique({ where: { slug: baseSlug } })
  if (!existing) return baseSlug
  // Collision — append numeric suffix until unique
  for (let i = 2; i < 1000; i++) {
    const candidate = `${baseSlug}-${i}`
    const clash = await prisma.crop.findUnique({ where: { slug: candidate } })
    if (!clash) return candidate
  }
  throw new Error(`Cannot generate unique slug for base: ${baseSlug}`)
}

async function upsertCrop(importer: Importer, raw: RawCrop, stats: ImportStats): Promise<void> {
  const baseSlug = raw.slug ?? toSlug(raw.botanicalName)

  // Check if the record already exists — if so, skip slug resolution (update path won't touch slug)
  const existing = await prisma.crop.findUnique({ where: { botanicalName: raw.botanicalName } })
  const slug = existing ? existing.slug : await uniqueSlug(baseSlug)

  const crop = await prisma.crop.upsert({
    where: { botanicalName: raw.botanicalName },
    create: {
      botanicalName: raw.botanicalName,
      name: raw.name ?? raw.botanicalName,
      slug,
      minTempC: raw.minTempC ?? null,
      imageUrl: raw.imageUrl ?? null,
      isNitrogenFixer: raw.isNitrogenFixer ?? false,
    },
    update: {
      // Only overwrite name when the source provides a real common name.
      // PFAF yields name === botanicalName; skipping prevents it from clobbering
      // good common names set by earlier importers (USDA, OpenFarm).
      ...(raw.name && raw.name !== raw.botanicalName ? { name: raw.name } : {}),
      minTempC: raw.minTempC ?? undefined,
      imageUrl: raw.imageUrl ?? undefined,
      isNitrogenFixer: raw.isNitrogenFixer ?? undefined,
    },
  })

  // Track which was created vs updated (upsert doesn't tell us directly)
  // Use a heuristic: if createdAt ≈ updatedAt it was just created
  const wasCreated = crop.createdAt.getTime() === crop.updatedAt.getTime()
  if (wasCreated) stats.cropsCreated++
  else stats.cropsUpdated++

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
    // First source wins for type/direction/reason — subsequent sources only add provenance
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
      try {
        await upsertCrop(importer, raw, stats)
      } catch (err) {
        console.error(`[${importer.source}] Error upserting crop "${raw.botanicalName}":`, err)
      }
    }
  }

  if (importer.fetchRelationships) {
    for await (const raw of importer.fetchRelationships()) {
      try {
        await upsertRelationship(importer, raw, stats)
      } catch (err) {
        console.error(`[${importer.source}] Error upserting relationship "${raw.cropNameA}" <-> "${raw.cropNameB}":`, err)
      }
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
