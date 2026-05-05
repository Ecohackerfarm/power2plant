import { PrismaClient, RelationshipType, ConfidenceLevel } from '@prisma/client'

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

async function main(): Promise<void> {
  const data = await import('../../data/research/extracted.json')
  const relationships: ExtractedRelationship[] = data.default || data

  let imported = 0
  let skippedUnresolved = 0
  let skippedExisting = 0

  for (const entry of relationships) {
    const idA = await resolveCropId(entry.cropA)
    const idB = await resolveCropId(entry.cropB)

    if (!idA || !idB) {
      console.log(`SKIP unresolved: ${entry.cropA} + ${entry.cropB}`)
      skippedUnresolved++
      continue
    }

    const [cropAId, cropBId] = idA < idB ? [idA, idB] : [idB, idA]

    const relationship = await prisma.cropRelationship.upsert({
      where: { cropAId_cropBId: { cropAId, cropBId } },
      create: {
        cropAId,
        cropBId,
        type: entry.type as RelationshipType,
        direction: 'MUTUAL',
        reason: entry.reason as any,
        confidence: entry.confidence,
        notes: entry.notes,
      },
      update: {},
      include: { sources: true },
    })

    const sourceExists = relationship.sources.some(s => s.source === 'RESEARCH')
    if (!sourceExists) {
      await prisma.relationshipSource.create({
        data: {
          relationshipId: relationship.id,
          source: 'RESEARCH',
          confidence: 'PEER_REVIEWED',
          url: entry.doi ? `https://doi.org/${entry.doi}` : null,
          notes: `${entry.title} (${entry.year})`,
        },
      })
      imported++
    } else {
      skippedExisting++
    }
  }

  console.log(`Imported: ${imported} relationships`)
  console.log(`Skipped (unresolved crop): ${skippedUnresolved}`)
  console.log(`Skipped (existing): ${skippedExisting}`)

  await prisma.$disconnect()
}

main().catch(async e => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})