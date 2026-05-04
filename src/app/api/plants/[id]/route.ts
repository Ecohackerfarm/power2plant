import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

type CropRow = {
  id: string
  name: string
  botanicalName: string
  commonNames: string[]
  minTempC: number | null
  isNitrogenFixer: boolean
}

type CompanionRow = CropRow & {
  relationshipId: string
  type: string
  reason: string | null
  confidence: number
  notes: string | null
  direction: string
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const crops = await prisma.$queryRaw<CropRow[]>`
    SELECT id, name, "botanicalName", "commonNames", "minTempC", "isNitrogenFixer"
    FROM "Crop" WHERE id = ${id}
  `
  const crop = crops[0]
  if (!crop) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const companions = await prisma.$queryRaw<CompanionRow[]>`
    SELECT
      c.id, c.name, c."botanicalName", c."commonNames", c."minTempC", c."isNitrogenFixer",
      cr.id AS "relationshipId", cr.type, cr.reason, cr.confidence, cr.notes, cr.direction
    FROM "CropRelationship" cr
    JOIN "Crop" c ON (
      CASE WHEN cr."cropAId" = ${id} THEN cr."cropBId" ELSE cr."cropAId" END = c.id
    )
    WHERE
      (cr."cropAId" = ${id} OR cr."cropBId" = ${id})
      AND cr.type IN ('COMPANION', 'ATTRACTS', 'NURSE', 'TRAP_CROP')
    ORDER BY cr.confidence DESC
  `

  return NextResponse.json({ crop, companions })
}
