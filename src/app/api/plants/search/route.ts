import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import prisma from '@/lib/prisma'
import { auth } from '@/lib/auth'

const COMPANION_TYPES = new Set(['COMPANION'])

/** Collapse per-source claims into distinct {type, explanation} for display. */
function claimsToReasons(claims: { mechanism: string; explanation: string }[]): { type: string; explanation: string }[] {
  const seen = new Set<string>()
  const out: { type: string; explanation: string }[] = []
  for (const c of claims) {
    if (seen.has(c.mechanism)) continue
    seen.add(c.mechanism)
    out.push({ type: c.mechanism, explanation: c.explanation })
  }
  return out
}

type CropRow = {
  id: string
  name: string
  botanicalName: string
  commonNames: string[]
}

type ReasonRow = { type: string; explanation: string }

type RelationshipRow = {
  id: string
  type: string
  reasons: ReasonRow[]
  confidence: number
  notes: string | null
  cropA: CropRow
  cropB: CropRow
}

async function findMatchingCropIds(term: string, locale: string): Promise<string[]> {
  const t = term.trim().toLowerCase()
  if (!t) return []
  const exact = t
  const prefix = `${t}%`
  const like = `%${t}%`
  // Rank matches so exact / common-name hits rank above incidental substring
  // matches inside unrelated botanical names (e.g. "corn" ⊂ "Cornus"). Without
  // this, LIMIT truncates before the real crop when the term is a common
  // substring of many Latin names.
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
    ORDER BY (
      CASE
        WHEN lower(c.name) = ${exact}
          OR lower(c."botanicalName") = ${exact}
          OR EXISTS (SELECT 1 FROM unnest(c."commonNames") cn WHERE lower(cn) = ${exact})
          OR EXISTS (SELECT 1 FROM unnest(COALESCE(t."commonNames", ARRAY[]::TEXT[])) cn WHERE lower(cn) = ${exact})
        THEN 0
        WHEN lower(c.name) LIKE ${prefix}
          OR lower(c."botanicalName") LIKE ${prefix}
          OR EXISTS (SELECT 1 FROM unnest(c."commonNames") cn WHERE lower(cn) LIKE ${prefix})
          OR EXISTS (SELECT 1 FROM unnest(COALESCE(t."commonNames", ARRAY[]::TEXT[])) cn WHERE lower(cn) LIKE ${prefix})
        THEN 1
        WHEN EXISTS (SELECT 1 FROM unnest(c."commonNames") cn WHERE lower(cn) LIKE ${like})
          OR EXISTS (SELECT 1 FROM unnest(COALESCE(t."commonNames", ARRAY[]::TEXT[])) cn WHERE lower(cn) LIKE ${like})
        THEN 2
        ELSE 3
      END
    ), lower(c.name)
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
      id: true, type: true, confidence: true, notes: true,
      claims: { select: { mechanism: true, explanation: true } },
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
        reasons: claimsToReasons(rel.claims),
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

  // Preserve the relevance ranking from findMatchingCropIds — findMany does not
  // guarantee input order, and losing it would bury exact/common-name matches.
  const rankOf = new Map(cropIds.map((id, i) => [id, i]))
  crops.sort((a, b) => (rankOf.get(a.id) ?? 0) - (rankOf.get(b.id) ?? 0))

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
