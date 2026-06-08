import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import prisma from '@/lib/prisma'
import { auth } from '@/lib/auth'

const COMPANION_TYPES = new Set(['COMPANION', 'ATTRACTS', 'NURSE', 'TRAP_CROP'])

type CropRow = {
  id: string
  name: string
  botanicalName: string
  commonNames: string[]
}

type RelationshipRow = {
  id: string
  type: string
  reason: string | null
  confidence: number
  notes: string | null
  cropA: CropRow
  cropB: CropRow
}

async function findMatchingCropIds(term: string, locale: string): Promise<string[]> {
  if (!term.trim()) return []
  const like = `%${term.toLowerCase()}%`
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT c.id FROM "Crop" c
    LEFT JOIN "CropTranslation" t ON t."cropId" = c.id AND t.locale = ${locale}
    WHERE
      lower(c.name) LIKE ${like}
      OR lower(c."botanicalName") LIKE ${like}
      OR lower(c."canonicalName") LIKE ${like}
      OR EXISTS (SELECT 1 FROM unnest(c."commonNames") cn WHERE lower(cn) LIKE ${like})
      OR EXISTS (SELECT 1 FROM unnest(COALESCE(t."commonNames", ARRAY[]::TEXT[])) cn WHERE lower(cn) LIKE ${like})
      OR EXISTS (SELECT 1 FROM "BotanicalSynonym" bs WHERE bs."cropId" = c.id AND lower(bs.name) LIKE ${like})
    LIMIT 100
  `
  return rows.map(r => r.id)
}


export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') ?? ''
  const locale = searchParams.get('locale') ?? 'en'

  if (!q.trim()) {
    return NextResponse.json({ plants: [], noDataPlants: [] })
  }

  const session = await auth.api.getSession({ headers: await headers() })

  const cropIds = await findMatchingCropIds(q, locale)
  if (cropIds.length === 0) {
    return NextResponse.json({ plants: [], noDataPlants: [] })
  }

  const cropSelect = {
    id: true,
    name: true,
    botanicalName: true,
    commonNames: true,
    translations: { where: { locale }, select: { cropId: true, commonNames: true } },
  }

  // Fetch all matched crops
  const crops = await prisma.crop.findMany({
    where: { id: { in: cropIds } },
    select: cropSelect,
  })

  function localisedCrop(c: typeof crops[number]): CropRow {
    const { translations, ...rest } = c
    const translated = translations?.[0]?.commonNames
    return translated?.length ? { ...rest, commonNames: translated } : rest
  }

  // Fetch all relationships touching any matched crop
  const relationships = await prisma.cropRelationship.findMany({
    where: {
      OR: [{ cropAId: { in: cropIds } }, { cropBId: { in: cropIds } }],
    },
    select: {
      id: true, type: true, reason: true, confidence: true, notes: true,
      cropA: { select: cropSelect },
      cropB: { select: cropSelect },
    },
  })

  // Group relationships by the matched crop
  const byPlant = new Map<string, { companions: RelationshipRow[]; antagonists: RelationshipRow[] }>()

  for (const rel of relationships) {
    const isAMatch = cropIds.includes(rel.cropA.id)
    const isBMatch = cropIds.includes(rel.cropB.id)

    // Add to each matched crop that appears in this relationship
    const matchedIds = [
      ...(isAMatch ? [rel.cropA.id] : []),
      ...(isBMatch ? [rel.cropB.id] : []),
    ]

    for (const matchId of matchedIds) {
      if (!byPlant.has(matchId)) byPlant.set(matchId, { companions: [], antagonists: [] })
      const entry = byPlant.get(matchId)!
      const serialised: RelationshipRow = {
        id: rel.id,
        type: rel.type,
        reason: rel.reason,
        confidence: rel.confidence,
        notes: rel.notes,
        cropA: localisedCrop(rel.cropA),
        cropB: localisedCrop(rel.cropB),
      }
      if (COMPANION_TYPES.has(rel.type)) {
        entry.companions.push(serialised)
      } else if (rel.type === 'AVOID') {
        entry.antagonists.push(serialised)
      }
    }
  }

  // Fetch existing research requests for no-data plants
  const noDataIds = cropIds.filter(id => !byPlant.has(id))
  const existingRequests = noDataIds.length > 0
    ? await prisma.researchRequest.findMany({
        where: { cropAId: { in: noDataIds }, cropBId: null },
        select: {
          id: true, cropAId: true, voteCount: true,
          votes: session ? { where: { userId: session.user.id }, select: { id: true } } : false,
        },
      })
    : []

  const requestByCropId = new Map(existingRequests.map(r => [r.cropAId, r]))

  // Build results
  const plants = crops
    .filter(c => byPlant.has(c.id))
    .map(c => {
      const { companions, antagonists } = byPlant.get(c.id)!
      return {
        ...localisedCrop(c),
        companions,
        antagonists,
      }
    })

  const noDataPlants = crops
    .filter(c => !byPlant.has(c.id))
    .map(c => {
      const req = requestByCropId.get(c.id)
      return {
        ...localisedCrop(c),
        researchRequestId: req?.id ?? null,
        voteCount: req?.voteCount ?? 0,
        hasVoted: session ? ((req?.votes as { id: string }[] | undefined)?.length ?? 0) > 0 : false,
      }
    })

  return NextResponse.json({ plants, noDataPlants })
}
