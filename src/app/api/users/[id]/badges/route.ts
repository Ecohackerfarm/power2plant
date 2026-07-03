import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const badges = await prisma.userBadge.findMany({
    where: { userId: id },
    orderBy: { awardedAt: 'asc' },
    select: {
      id: true,
      type: true,
      slug: true,
      tier: true,
      cropId: true,
      cropAId: true,
      cropBId: true,
      awardedAt: true,
      crop: { select: { id: true, name: true, botanicalName: true } },
      cropA: { select: { id: true, name: true, botanicalName: true } },
      cropB: { select: { id: true, name: true, botanicalName: true } },
    },
  })

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, image: true },
  })
  if (!user) return NextResponse.json({ error: 'not found' }, { status: 404 })

  return NextResponse.json({ user, badges })
}
