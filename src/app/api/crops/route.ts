import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { detectRank, type CropRow } from '@/lib/crop-rank'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const locale = searchParams.get('locale') ?? 'en'

  // Bulk fetch by IDs — used to rehydrate wishlist after page refresh.
  const idsParam = searchParams.get('ids')
  if (idsParam !== null) {
    const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean)
    if (ids.length === 0) return NextResponse.json({ crops: [] })
    const idList = Prisma.join(ids.map(id => Prisma.sql`${id}`))
    const raw = await prisma.$queryRaw<CropRow[]>`
      SELECT c.id, c.name, c."botanicalName", c."minTempC", c."isCommonCrop",
             COALESCE(t."commonNames", c."commonNames") AS "commonNames"
      FROM "Crop" c
      LEFT JOIN "CropTranslation" t ON t."cropId" = c.id AND t.locale = ${locale}
      WHERE c.id IN (${idList})
    `
    const crops = raw.map(c => ({ ...c, rank: detectRank(c.botanicalName) }))
    return NextResponse.json({ crops })
  }

  const q = searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) {
    return NextResponse.json({ error: 'q must be at least 2 characters' }, { status: 400 })
  }

  const ql = q.toLowerCase()
  const likeQ = `%${ql}%`
  const likeQStart = `${ql}%`
  const likeQWord = `% ${ql}%`

  const raw = await prisma.$queryRaw<CropRow[]>`
    SELECT c.id, c.name, c."botanicalName", c."minTempC", c."isCommonCrop",
           COALESCE(t."commonNames", c."commonNames") AS "commonNames"
    FROM "Crop" c
    LEFT JOIN "CropTranslation" t ON t."cropId" = c.id AND t.locale = ${locale}
    WHERE
      lower(c.name) LIKE ${likeQ}
      OR lower(c."botanicalName") LIKE ${likeQ}
      OR EXISTS (SELECT 1 FROM unnest(c."commonNames") cn WHERE lower(cn) LIKE ${likeQ})
      OR EXISTS (SELECT 1 FROM unnest(COALESCE(t."commonNames", ARRAY[]::TEXT[])) cn WHERE lower(cn) LIKE ${likeQ})
    ORDER BY
      CASE
        WHEN lower(c.name) = ${ql}
             OR EXISTS (SELECT 1 FROM unnest(COALESCE(t."commonNames", c."commonNames")) cn WHERE lower(cn) = ${ql})
          THEN 0
        WHEN lower(c.name) LIKE ${likeQStart}
          THEN 1
        WHEN lower(c.name) LIKE ${likeQWord}
             OR EXISTS (SELECT 1 FROM unnest(COALESCE(t."commonNames", c."commonNames")) cn WHERE lower(cn) LIKE ${likeQStart})
          THEN 2
        WHEN c."isCommonCrop"
          THEN 3
        ELSE 4
      END,
      c.name
    LIMIT 20
  `

  const crops = raw.slice(0, 20).map(c => ({ ...c, rank: detectRank(c.botanicalName) }))
  return NextResponse.json({ crops })
}
