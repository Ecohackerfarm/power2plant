/**
 * One-off: recompute CropRelationship.confidence for every relationship that has
 * at least one RESEARCH source. The research/import.ts previously stored an
 * agreement fraction instead of max(source evidence level), leaving PEER_REVIEWED
 * relationships labelled "Traditional" in the UI.
 *
 * Run with: npx tsx scripts/research/fix-confidence.ts
 */
import { PrismaClient } from '@prisma/client'
import { computeRelationshipConfidence } from '../import/confidence'

const prisma = new PrismaClient()

async function main() {
  const affectedIds = await prisma.relationshipSource.findMany({
    where: { source: 'RESEARCH' },
    select: { relationshipId: true },
    distinct: ['relationshipId'],
  })

  console.log(`Found ${affectedIds.length} relationships with RESEARCH sources`)

  let fixed = 0
  let unchanged = 0

  for (const { relationshipId } of affectedIds) {
    const sources = await prisma.relationshipSource.findMany({
      where: { relationshipId },
      select: { confidence: true },
    })
    const correct = computeRelationshipConfidence(sources.map(s => s.confidence))

    const rel = await prisma.cropRelationship.findUnique({
      where: { id: relationshipId },
      select: { confidence: true },
    })
    if (!rel) continue

    if (Math.abs(rel.confidence - correct) > 0.001) {
      await prisma.cropRelationship.update({
        where: { id: relationshipId },
        data: { confidence: correct },
      })
      fixed++
    } else {
      unchanged++
    }
  }

  console.log(`Fixed: ${fixed}, already correct: ${unchanged}`)
  await prisma.$disconnect()
}

main().catch(async e => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
