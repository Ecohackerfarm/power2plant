import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { detectRank, extractGenusWord } from '@/lib/crop-rank'

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

type GenusRow = { id: string; botanicalName: string; name: string }
type SpeciesRow = { id: string; botanicalName: string; name: string }

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

  const rank = detectRank(crop.botanicalName)

  // Fetch direct companions
  const directCompanions = await prisma.$queryRaw<CompanionRow[]>`
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

  let companions: (CompanionRow & { inheritedFrom?: { id: string; botanicalName: string } })[] = directCompanions
  let parentGenus: { id: string; botanicalName: string; name: string } | undefined
  let species: SpeciesRow[] | undefined
  let speciesCount: number | undefined

  if (rank === 'species') {
    const genusWord = extractGenusWord(crop.botanicalName)
    const genusRows = await prisma.$queryRaw<GenusRow[]>`
      SELECT id, "botanicalName", name FROM "Crop"
      WHERE "botanicalName" ~ ${`^${genusWord} [A-Z]`}
      LIMIT 1
    `
    if (genusRows[0]) {
      parentGenus = genusRows[0]
      const genusId = genusRows[0].id

      const genusCompanions = await prisma.$queryRaw<CompanionRow[]>`
        SELECT
          c.id, c.name, c."botanicalName", c."commonNames", c."minTempC", c."isNitrogenFixer",
          cr.id AS "relationshipId", cr.type, cr.reason, cr.confidence, cr.notes, cr.direction
        FROM "CropRelationship" cr
        JOIN "Crop" c ON (
          CASE WHEN cr."cropAId" = ${genusId} THEN cr."cropBId" ELSE cr."cropAId" END = c.id
        )
        WHERE
          (cr."cropAId" = ${genusId} OR cr."cropBId" = ${genusId})
          AND cr.type IN ('COMPANION', 'ATTRACTS', 'NURSE', 'TRAP_CROP')
        ORDER BY cr.confidence DESC
      `

      const directIds = new Set(directCompanions.map(c => c.id))
      const inherited = genusCompanions
        .filter(gc => !directIds.has(gc.id))
        .map(gc => ({ ...gc, inheritedFrom: { id: genusRows[0].id, botanicalName: genusRows[0].botanicalName } }))

      companions = [...directCompanions, ...inherited]
    }
  } else if (rank === 'genus') {
    const genusWord = extractGenusWord(crop.botanicalName)
    const speciesRows = await prisma.$queryRaw<SpeciesRow[]>`
      SELECT id, "botanicalName", name FROM "Crop"
      WHERE "botanicalName" ~ ${`^${genusWord} [a-z]`}
      ORDER BY name
      LIMIT 8
    `
    const countRows = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) AS count FROM "Crop"
      WHERE "botanicalName" ~ ${`^${genusWord} [a-z]`}
    `
    species = speciesRows
    speciesCount = Number(countRows[0].count)
  }

  return NextResponse.json({ crop: { ...crop, parentGenus, species, speciesCount }, companions })
}
