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

  const rawSources = await prisma.relationshipSource.findMany({
    where: { relationshipId: rel.relId },
    select: { source: true, sourceType: true, confidence: true, url: true, notes: true, fetchedAt: true, userId: true },
    orderBy: { confidence: 'desc' },
  })

  const community: (typeof rawSources)[number][] = []
  const other: (typeof rawSources)[number][] = []
  for (const s of rawSources) {
    if (s.source === 'COMMUNITY') community.push(s)
    else other.push(s)
  }

  const groupedCommunity: Array<{
    source: string
    confidence: string
    notes: string | null
    fetchedAt: string
    urls: Array<{ url: string; sourceType: string | null; confidence: string }>
  }> = []

  const groups = new Map<string, typeof community>()
  for (const s of community) {
    const date = s.fetchedAt.toISOString().slice(0, 10)
    const key = `${s.userId ?? 'anon'}|${date}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(s)
  }

  for (const rows of groups.values()) {
    const testimony = rows.find(r => !r.url) ?? rows[0]
    const urls = rows.filter(r => r.url).map(r => ({
      url: r.url!,
      sourceType: r.sourceType,
      confidence: r.confidence,
    }))
    groupedCommunity.push({
      source: 'COMMUNITY',
      confidence: testimony.confidence,
      notes: testimony.notes,
      fetchedAt: testimony.fetchedAt.toISOString(),
      urls,
    })
  }

  const sources = [
    ...other.map(s => ({
      source: s.source,
      confidence: s.confidence,
      url: s.url,
      notes: s.notes,
      fetchedAt: s.fetchedAt.toISOString(),
      sourceType: s.sourceType,
    })),
    ...groupedCommunity,
  ]

  return NextResponse.json({ relationship: rel, sources })
}
