import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; companionId: string }> },
) {
  const { id, companionId } = await params
  const [cropAId, cropBId] = id < companionId ? [id, companionId] : [companionId, id]

  const rows = await prisma.$queryRaw<Array<{
    relId: string; type: string; reason: string | null; reasons: string[]; confidence: number
    notes: string | null; direction: string
    cropAId: string; cropAName: string; cropABotanical: string; cropACommonNames: string[]
    cropANitrogen: boolean
    cropBId: string; cropBName: string; cropBBotanical: string; cropBCommonNames: string[]
    cropBNitrogen: boolean
  }>>`
    SELECT
      cr.id AS "relId", cr.type, cr.reason, cr.reasons, cr.confidence, cr.notes, cr.direction,
      ca.id AS "cropAId", ca.name AS "cropAName", ca."botanicalName" AS "cropABotanical",
      ca."commonNames" AS "cropACommonNames", ca."isNitrogenFixer" AS "cropANitrogen",
      cb.id AS "cropBId", cb.name AS "cropBName", cb."botanicalName" AS "cropBBotanical",
      cb."commonNames" AS "cropBCommonNames", cb."isNitrogenFixer" AS "cropBNitrogen"
    FROM "CropRelationship" cr
    JOIN "Crop" ca ON cr."cropAId" = ca.id
    JOIN "Crop" cb ON cr."cropBId" = cb.id
    WHERE cr."cropAId" = ${cropAId} AND cr."cropBId" = ${cropBId}
  `
  const rel = rows[0]
  if (!rel) return NextResponse.json({ error: 'relationship not found' }, { status: 404 })

  const sources = await prisma.relationshipSource.findMany({
    where: { relationshipId: rel.relId },
    select: { source: true, confidence: true, url: true, notes: true, fetchedAt: true },
    orderBy: { confidence: 'desc' },
  })

  return NextResponse.json({ relationship: rel, sources })
}
