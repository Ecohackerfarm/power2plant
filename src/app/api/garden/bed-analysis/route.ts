import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { auth } from '@/lib/auth'

async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}

type RelRow = {
  id: string
  type: string
  confidence: number
  reason: string | null
  cropAId: string
  cropBId: string
  cropAName: string
  cropBName: string
}

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const garden = await prisma.userGarden.findUnique({
    where: { userId: session.user.id },
    include: {
      beds: {
        include: { plantings: { select: { cropId: true } } },
      },
    },
  })

  if (!garden) return NextResponse.json({ beds: [] })

  const bedsWithPairs = garden.beds.filter(b => b.plantings.length >= 2)

  const results = await Promise.all(bedsWithPairs.map(async bed => {
    const ids = bed.plantings.map(p => p.cropId)
    const idList = Prisma.join(ids.map(id => Prisma.sql`${id}`))

    const rels = await prisma.$queryRaw<RelRow[]>`
      SELECT
        cr.id, cr.type, cr.confidence, cr.reason,
        cr."cropAId", cr."cropBId",
        ca.name AS "cropAName", cb.name AS "cropBName"
      FROM "CropRelationship" cr
      JOIN "Crop" ca ON ca.id = cr."cropAId"
      JOIN "Crop" cb ON cb.id = cr."cropBId"
      WHERE cr."cropAId" IN (${idList}) AND cr."cropBId" IN (${idList})
    `

    const companionTypes = new Set(['COMPANION', 'ATTRACTS', 'NURSE', 'TRAP_CROP'])
    const knownPairIds = new Set(rels.map(r => [r.cropAId, r.cropBId].sort().join(':')))

    const companions = rels.filter(r => companionTypes.has(r.type))
    const antagonists = rels.filter(r => r.type === 'AVOID')

    // Count unknown pairs (no relationship data)
    let unknownCount = 0
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const pairKey = [ids[i], ids[j]].sort().join(':')
        if (!knownPairIds.has(pairKey)) unknownCount++
      }
    }

    return {
      bedId: bed.id,
      companions: companions.map(r => ({ id: r.id, cropAId: r.cropAId, cropBId: r.cropBId, cropAName: r.cropAName, cropBName: r.cropBName, confidence: r.confidence })),
      antagonists: antagonists.map(r => ({ id: r.id, cropAId: r.cropAId, cropBId: r.cropBId, cropAName: r.cropAName, cropBName: r.cropBName })),
      unknownCount,
    }
  }))

  return NextResponse.json({ beds: results })
}
