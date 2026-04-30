import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim() ?? ''

  if (q.length < 2) {
    return NextResponse.json({ error: 'q must be at least 2 characters' }, { status: 400 })
  }

  const crops = await prisma.crop.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { botanicalName: { contains: q, mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, botanicalName: true, minTempC: true },
    take: 20,
    orderBy: { name: 'asc' },
  })

  return NextResponse.json({ crops })
}
