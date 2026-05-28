import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaClient, RelationshipType, RelationshipReason } from '@prisma/client'
import { computeRelationshipConfidence } from '../import/confidence'

const prisma = new PrismaClient()

type RawDirection = 'A_TO_B' | 'B_TO_A' | 'MUTUAL' | 'UNKNOWN'

interface ExtractedRelationship {
  cropA: string
  cropB: string
  type: 'COMPANION' | 'AVOID'
  reason: string | null
  direction?: RawDirection
  confidence: number
  notes: string
  doi: string | null
  title: string
  year: number
  cropAFound?: boolean
  cropBFound?: boolean
}

interface AggregatedPair {
  cropA: string
  cropB: string
  type: 'COMPANION' | 'AVOID'
  reason: string | null
  notes: string
  papers: Array<{
    doi: string | null
    title: string
    year: number
    position: 'COMPANION' | 'AVOID'
    reason: string | null
    direction?: RawDirection
    extractedCropA: string  // original cropA from extraction, for direction mapping
  }>
}

// Maps raw A_TO_B/B_TO_A direction to the Direction enum, accounting for crop order.
// If stored relationship has crops swapped vs. extraction order, flip A_TO_B ↔ B_TO_A.
function mapDirection(
  raw: RawDirection | undefined,
  extractedCropAId: string,
  storedCropAId: string,
): 'MUTUAL' | 'ONE_WAY' | null {
  if (!raw || raw === 'UNKNOWN') return null
  if (raw === 'MUTUAL') return 'MUTUAL'
  const flipped = extractedCropAId !== storedCropAId
  const effectiveDir = flipped ? (raw === 'A_TO_B' ? 'B_TO_A' : 'A_TO_B') : raw
  return effectiveDir === 'A_TO_B' || effectiveDir === 'B_TO_A' ? 'ONE_WAY' : null
}

// Prefer botanicalName exact match, then name/commonNames with deterministic ordering
// (isCommonCrop first, then oldest record). Logs a warning when multiple name matches exist.
async function resolveCropId(name: string): Promise<string | null> {
  // 1. Exact botanicalName
  const byBotanical = await prisma.crop.findUnique({ where: { botanicalName: name } })
  if (byBotanical) return byBotanical.id

  // 2. name / commonNames — fetch all matches so we can warn on ambiguity
  const matches = await prisma.crop.findMany({
    where: {
      OR: [
        { name: { equals: name, mode: 'insensitive' } },
        { commonNames: { has: name } },
      ],
    },
    orderBy: [{ isCommonCrop: 'desc' }, { createdAt: 'asc' }],
    select: { id: true, botanicalName: true, isCommonCrop: true },
  })

  if (matches.length === 0) return null
  if (matches.length > 1) {
    console.warn(
      `AMBIGUOUS name "${name}" matches ${matches.length} crops: ` +
      matches.map(m => m.botanicalName).join(', ') +
      ` — using ${matches[0].botanicalName}`
    )
  }
  return matches[0].id
}

function aggregateByPair(relationships: ExtractedRelationship[]): AggregatedPair[] {
  const pairMap = new Map<string, { companion: number; avoid: number; entries: ExtractedRelationship[] }>()

  for (const entry of relationships) {
    const key = [entry.cropA, entry.cropB].sort().join('|')
    if (!pairMap.has(key)) pairMap.set(key, { companion: 0, avoid: 0, entries: [] })
    const agg = pairMap.get(key)!
    agg.entries.push(entry)
    if (entry.type === 'COMPANION') agg.companion += entry.confidence
    else agg.avoid += entry.confidence
  }

  const results: AggregatedPair[] = []
  for (const [, agg] of pairMap) {
    const winningType: 'COMPANION' | 'AVOID' = agg.companion >= agg.avoid ? 'COMPANION' : 'AVOID'
    const winningEntries = agg.entries.filter(e => e.type === winningType)
    const best = winningEntries.reduce((a, b) => a.confidence >= b.confidence ? a : b)
    results.push({
      cropA: agg.entries[0].cropA,
      cropB: agg.entries[0].cropB,
      type: winningType,
      reason: best.reason,
      notes: best.notes,
      papers: agg.entries.map(e => ({ doi: e.doi, title: e.title, year: e.year, position: e.type, reason: e.reason, direction: e.direction, extractedCropA: e.cropA })),
    })
  }
  return results
}

// Valid RelationshipReason enum values from Prisma schema
const VALID_REASONS = new Set<string>(Object.values(RelationshipReason))

function validateReason(value: string | null | undefined): RelationshipReason | null {
  if (value == null) return null
  if (VALID_REASONS.has(value)) return value as RelationshipReason
  console.warn(`INVALID reason "${value}" — storing null`)
  return null
}

async function main(): Promise<void> {
  const extractedPath = join(process.cwd(), 'data/research/extracted.json')
  const raw: ExtractedRelationship[] = JSON.parse(readFileSync(extractedPath, 'utf-8'))

  console.log(`Loaded ${raw.length} extracted relationships`)
  const verified = raw.filter(r => (r.cropAFound ?? true) && (r.cropBFound ?? true))
  if (verified.length < raw.length) {
    console.log(`Filtered out ${raw.length - verified.length} entries where abstract did not confirm both crops`)
  }
  const pairs = aggregateByPair(verified)
  console.log(`Aggregated into ${pairs.length} unique crop pairs`)

  let imported = 0
  let skippedUnresolved = 0
  let skippedExisting = 0
  let skippedError = 0

  for (const pair of pairs) {
    try {
      const idA = await resolveCropId(pair.cropA)
      const idB = await resolveCropId(pair.cropB)

      if (!idA || !idB) {
        console.log(`SKIP unresolved: ${pair.cropA} + ${pair.cropB}`)
        skippedUnresolved++
        continue
      }

      const [cropAId, cropBId] = idA < idB ? [idA, idB] : [idB, idA]

      const relationship = await prisma.cropRelationship.upsert({
        where: { cropAId_cropBId: { cropAId, cropBId } },
        create: {
          cropAId,
          cropBId,
          type: pair.type as RelationshipType,
          direction: 'MUTUAL',
          reason: validateReason(pair.reason),
          // confidence is set after sources are added via recompute below
          confidence: 0.25,
          notes: pair.notes,
        },
        // Don't overwrite type/confidence set by other importers — sources are the authority
        update: {},
        include: { sources: true },
      })

      // Create one source per paper (deduplicated by DOI or title)
      let addedSources = 0
      for (const paper of pair.papers) {
        const paperUrl = paper.doi ? `https://doi.org/${paper.doi}` : null
        const exists = relationship.sources.some(s =>
          (paperUrl !== null && s.url === paperUrl) ||
          (s.notes?.includes(paper.title) ?? false)
        )
        if (!exists) {
          // Resolve the per-paper extraction-order cropA to an ID so mapDirection
          // can correctly flip A_TO_B ↔ B_TO_A when the stored pair order differs.
          const paperCropAId = await resolveCropId(paper.extractedCropA)
          await prisma.relationshipSource.create({
            data: {
              relationshipId: relationship.id,
              source: 'RESEARCH',
              confidence: 'PEER_REVIEWED',
              position: paper.position,
              reason: validateReason(paper.reason),
              sourceDirection: mapDirection(paper.direction, paperCropAId ?? idA, cropAId) as any,
              url: paperUrl,
              notes: `${paper.title} (${paper.year})`,
            },
          })
          addedSources++
        }
      }

      // Recompute confidence as max(source evidence levels) across all sources,
      // including any pre-existing ones from other importers.
      const allSources = await prisma.relationshipSource.findMany({
        where: { relationshipId: relationship.id },
        select: { confidence: true },
      })
      const recomputedConfidence = computeRelationshipConfidence(allSources.map(s => s.confidence))
      await prisma.cropRelationship.update({
        where: { id: relationship.id },
        data: { confidence: recomputedConfidence },
      })

      if (addedSources > 0) {
        imported++
        console.log(
          `IMPORT: ${pair.cropA} + ${pair.cropB} → ${pair.type}` +
          ` (conf ${recomputedConfidence.toFixed(2)}, ${pair.papers.length} papers, ${addedSources} new sources)`
        )
      } else {
        skippedExisting++
      }
    } catch (err) {
      console.error(`ERROR importing pair ${pair.cropA} + ${pair.cropB}:`, err)
      skippedError++
    }
  }

  console.log(`\nImported/updated: ${imported} relationships`)
  console.log(`Skipped (unresolved crop): ${skippedUnresolved}`)
  console.log(`Skipped (existing): ${skippedExisting}`)
  if (skippedError > 0) console.warn(`Skipped (error): ${skippedError}`)

  await prisma.$disconnect()
}

main().catch(async e => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
