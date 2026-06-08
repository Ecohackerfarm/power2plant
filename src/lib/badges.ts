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
    prisma.crop.findUnique({ where: { id: cropAId }, select: { id: true } }),
    prisma.crop.findUnique({ where: { id: cropBId }, select: { id: true } }),
  ])

  const badges: import('@prisma/client').Prisma.UserBadgeCreateManyInput[] = []

  // PLANT badges (one per botanical name involved)
  if (cropA) {
    badges.push({
      userId,
      type: 'PLANT',
      slug: `PLANT:${cropAId}`,
      cropId: cropAId,
    })
  }
  if (cropB) {
    badges.push({
      userId,
      type: 'PLANT',
      slug: `PLANT:${cropBId}`,
      cropId: cropBId,
    })
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
