import prisma from '@/lib/prisma'

const INCREMENTAL_TIERS = [1, 10, 30, 50, 100, 250, 500]

/**
 * Awards all due badges to a user after they fund research for a pair.
 * Idempotent — duplicate slugs are ignored via unique constraint.
 */
export async function awardResearchBadges(
  userId: string,
  cropAId: string,
  cropBId: string,
): Promise<void> {
  const [totalCount, cropA, cropB] = await Promise.all([
    prisma.researchFunder.count({ where: { userId, source: 'PERSONAL' } }),
    prisma.crop.findUnique({ where: { id: cropAId }, select: { id: true, botanicalName: true } }),
    prisma.crop.findUnique({ where: { id: cropBId }, select: { id: true, botanicalName: true } }),
  ])

  const badges: import('@prisma/client').Prisma.UserBadgeCreateManyInput[] = []

  // PLANT badges — one per botanical name so two cultivars of the same species share a badge
  if (cropA) {
    const slug = `PLANT:${cropA.botanicalName ?? cropAId}`
    badges.push({ userId, type: 'PLANT', slug, cropId: cropAId })
  }
  if (cropB) {
    const slug = `PLANT:${cropB.botanicalName ?? cropBId}`
    badges.push({ userId, type: 'PLANT', slug, cropId: cropBId })
  }

  // PAIR badge
  badges.push({
    userId,
    type: 'PAIR',
    slug: `PAIR:${cropAId}:${cropBId}`,
    cropAId,
    cropBId,
  })

  // INCREMENTAL badges: award all tiers reached on or below current count
  for (const tier of INCREMENTAL_TIERS) {
    if (totalCount >= tier) {
      badges.push({
        userId,
        type: 'INCREMENTAL',
        slug: `INCREMENTAL:${tier}`,
        tier,
      })
    }
  }

  if (badges.length === 0) return

  await prisma.userBadge.createMany({ data: badges, skipDuplicates: true })
}
