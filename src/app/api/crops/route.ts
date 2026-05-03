import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { rankCrops, type CropRow } from '@/lib/crop-rank'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  // Bulk fetch by IDs — used to rehydrate wishlist after page refresh.
  // Uses $queryRaw (same as search) so it works regardless of client generation state.
  const idsParam = searchParams.get('ids')
  if (idsParam !== null) {
    const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean)
    if (ids.length === 0) return NextResponse.json({ crops: [] })
    const idList = Prisma.join(ids.map(id => Prisma.sql`${id}`))
    const crops = await prisma.$queryRaw<CropRow[]>`
      SELECT id, name, "botanicalName", "minTempC", "isCommonCrop", "commonNames"
      FROM "Crop"
      WHERE id IN (${idList})
    `
    return NextResponse.json({ crops })
  }

  const q = searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) {
    return NextResponse.json({ error: 'q must be at least 2 characters' }, { status: 400 })
  }

  const likeQ = `%${q}%`

  const raw = await prisma.$queryRaw<CropRow[]>`
    SELECT id, name, "botanicalName", "minTempC", "isCommonCrop", "commonNames"
    FROM "Crop"
    WHERE
      name ILIKE ${likeQ}
      OR "botanicalName" ILIKE ${likeQ}
      OR EXISTS (SELECT 1 FROM unnest("commonNames") cn WHERE cn ILIKE ${likeQ})
    LIMIT 40
  `

  const crops = rankCrops(raw, q).slice(0, 20)
  return NextResponse.json({ crops })
}
