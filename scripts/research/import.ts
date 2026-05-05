import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaClient, RelationshipType } from '@prisma/client'

const prisma = new PrismaClient()

interface ExtractedRelationship {
  cropA: string
  cropB: string
  type: 'COMPANION' | 'AVOID'
  reason: string | null
  confidence: number
  notes: string
  doi: string | null
  title: string
  year: number
}

interface AggregatedPair {
  cropA: string
  cropB: string
  type: 'COMPANION' | 'AVOID'
  confidence: number
  reason: string | null
  notes: string
  papers: Array<{ doi: string | null; title: string; year: number }>
}

async function resolveCropId(name: string): Promise<string | null> {
  const crop = await prisma.crop.findFirst({
    where: {
      OR: [
        { name: { equals: name, mode: 'insensitive' } },
        { commonNames: { has: name } },
      ],
    },
  })
  return crop?.id ?? null
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
    // Pick the highest-confidence entry for metadata (notes/reason)
    const best = winningEntries.reduce((a, b) => a.confidence >= b.confidence ? a : b)
    const totalScore = winningType === 'COMPANION' ? agg.companion : agg.avoid
    const totalAll = agg.companion + agg.avoid
    results.push({
      cropA: agg.entries[0].cropA,
      cropB: agg.entries[0].cropB,
      type: winningType,
      // Normalize: winning confidence as fraction of all evidence
      confidence: Math.min(totalScore / totalAll, 1),
      reason: best.reason,
      notes: best.notes,
      papers: agg.entries.map(e => ({ doi: e.doi, title: e.title, year: e.year })),
    })
  }
  return results
}

async function main(): Promise<void> {
  const extractedPath = join(process.cwd(), 'data/research/extracted.json')
  const raw: ExtractedRelationship[] = JSON.parse(readFileSync(extractedPath, 'utf-8'))

  console.log(`Loaded ${raw.length} extracted relationships`)
  const pairs = aggregateByPair(raw)
  console.log(`Aggregated into ${pairs.length} unique crop pairs`)

  let imported = 0
  let skippedUnresolved = 0
  let skippedExisting = 0

  for (const pair of pairs) {
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
        reason: pair.reason as any,
        confidence: pair.confidence,
        notes: pair.notes,
      },
      update: {
        type: pair.type as RelationshipType,
        confidence: pair.confidence,
        notes: pair.notes,
      },
      include: { sources: true },
    })

    // Create one source per paper (deduplicated by DOI or title)
    let addedSources = 0
    for (const paper of pair.papers) {
      const paperKey = paper.doi ?? paper.title
      const exists = relationship.sources.some(s => s.notes?.includes(paperKey) || s.url === (paper.doi ? `https://doi.org/${paper.doi}` : null))
      if (!exists) {
        await prisma.relationshipSource.create({
          data: {
            relationshipId: relationship.id,
            source: 'RESEARCH',
            confidence: 'PEER_REVIEWED',
            url: paper.doi ? `https://doi.org/${paper.doi}` : null,
            notes: `${paper.title} (${paper.year})`,
          },
        })
        addedSources++
      }
    }

    if (addedSources > 0) {
      imported++
      console.log(`IMPORT: ${pair.cropA} + ${pair.cropB} → ${pair.type} (${pair.confidence.toFixed(2)}, ${pair.papers.length} papers, ${addedSources} new sources)`)
    } else {
      skippedExisting++
    }
  }

  console.log(`\nImported/updated: ${imported} relationships`)
  console.log(`Skipped (unresolved crop): ${skippedUnresolved}`)
  console.log(`Skipped (existing): ${skippedExisting}`)

  await prisma.$disconnect()
}

main().catch(async e => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
