import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { rankCrops, detectRank, type CropRow } from '@/lib/crop-rank'

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

  const likeQ = `%${q}%`

  const raw = await prisma.$queryRaw<CropRow[]>`
    SELECT c.id, c.name, c."botanicalName", c."minTempC", c."isCommonCrop",
           COALESCE(t."commonNames", c."commonNames") AS "commonNames"
    FROM "Crop" c
    LEFT JOIN "CropTranslation" t ON t."cropId" = c.id AND t.locale = ${locale}
    WHERE
      c.name ILIKE ${likeQ}
      OR c."botanicalName" ILIKE ${likeQ}
      OR EXISTS (SELECT 1 FROM unnest(c."commonNames") cn WHERE cn ILIKE ${likeQ})
      OR EXISTS (SELECT 1 FROM unnest(COALESCE(t."commonNames", ARRAY[]::TEXT[])) cn WHERE cn ILIKE ${likeQ})
    LIMIT 40
  `

  const crops = rankCrops(raw, q).slice(0, 20).map(c => ({ ...c, rank: detectRank(c.botanicalName) }))
  return NextResponse.json({ crops })
}
