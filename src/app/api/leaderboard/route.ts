import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

type Period = 'all' | 'yearly' | 'monthly' | 'weekly' | 'daily'

function periodStart(period: Period): Date | null {
  if (period === 'all') return null
  const now = new Date()
  switch (period) {
    case 'yearly':  return new Date(now.getFullYear(), 0, 1)
    case 'monthly': return new Date(now.getFullYear(), now.getMonth(), 1)
    case 'weekly': {
      const d = new Date(now)
      d.setDate(d.getDate() - d.getDay())
      d.setHours(0, 0, 0, 0)
      return d
    }
    case 'daily': {
      const d = new Date(now)
      d.setHours(0, 0, 0, 0)
      return d
    }
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const period = (searchParams.get('period') ?? 'all') as Period
  const VALID: Period[] = ['all', 'yearly', 'monthly', 'weekly', 'daily']
  if (!VALID.includes(period)) {
    return NextResponse.json({ error: 'invalid period' }, { status: 400 })
  }

  const since = periodStart(period)
  const dateFilter = since ? { createdAt: { gte: since } } : {}

  // Personal funders count
  const personalRows = await prisma.researchFunder.groupBy({
    by: ['userId'],
    where: { source: 'PERSONAL', userId: { not: null }, ...dateFilter },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 50,
  })

  // Community pot count (researches funded via pot in period)
  const communityCount = await prisma.researchFunder.count({
    where: { source: 'POT', ...dateFilter },
  })

  // Only show period if >1 unique user
  const uniqueUserCount = personalRows.filter((r) => r.userId).length
  if (period !== 'all' && uniqueUserCount <= 1 && communityCount <= 1) {
    return NextResponse.json({ hidden: true, period })
  }

  // Fetch user details
  const userIds = personalRows.map((r) => r.userId!).filter(Boolean)
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, image: true },
  })
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]))

  // Highest incremental badge per user
  const badgeRows = await prisma.userBadge.findMany({
    where: { userId: { in: userIds }, type: 'INCREMENTAL' },
    orderBy: { tier: 'desc' },
  })
  const topBadge: Record<string, number> = {}
  for (const b of badgeRows) {
    if (b.tier !== null && !(b.userId in topBadge)) {
      topBadge[b.userId] = b.tier
    }
  }

  const entries = personalRows.map((r) => ({
    userId: r.userId,
    name: userMap[r.userId!]?.name ?? 'Unknown',
    image: userMap[r.userId!]?.image ?? null,
    researchCount: r._count.id,
    topIncrementalTier: topBadge[r.userId!] ?? null,
  }))

  // Community entry
  const community = { userId: null, name: 'Community', image: null, researchCount: communityCount, topIncrementalTier: null }

  return NextResponse.json({ period, entries, community })
}
