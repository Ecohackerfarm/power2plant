import type { PrismaClient } from '@prisma/client'

export const CONFIDENCE_VALUES = {
  ANECDOTAL: 0.25,
  TRADITIONAL: 0.5,
  OBSERVED: 0.75,
  PEER_REVIEWED: 1.0,
} as const

const PENALTY_WEIGHT = 2
export const MIN_SUBMISSIONS = 5
const SCORE_FLOOR = 0.1

type ConfidenceKey = keyof typeof CONFIDENCE_VALUES

export interface SubmissionRecord {
  /** Confidence value the user self-reported (testimony row). */
  claimedValue: number
  /** Max confidence value derived from URL sources (ANECDOTAL if no URLs). */
  derivedValue: number
}

/** Pure scoring logic — no DB access, directly testable. */
export function scoreFromHistory(history: SubmissionRecord[]): number {
  if (history.length < MIN_SUBMISSIONS) return 1.0

  let overConfidentCount = 0
  let accurateCount = 0

  for (const { claimedValue, derivedValue } of history) {
    if (claimedValue > derivedValue) {
      overConfidentCount++
    } else {
      accurateCount++
    }
  }

  const raw = accurateCount / (accurateCount + overConfidentCount * PENALTY_WEIGHT)
  return Math.max(raw, SCORE_FLOOR)
}

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

/**
 * Recompute trust score for a user based on their submission history and persist it.
 * Returns the new score (1.0 if fewer than MIN_SUBMISSIONS recorded).
 */
export async function computeAndSaveTrustScore(
  userId: string,
  db: Tx | PrismaClient,
): Promise<number> {
  const client = db as PrismaClient

  const testimonies = await client.relationshipSource.findMany({
    where: { userId, source: 'COMMUNITY', sourceType: 'PERSONAL_OBSERVATION' },
    select: { confidence: true, relationshipId: true, fetchedAt: true },
    orderBy: { fetchedAt: 'asc' },
  })

  if (testimonies.length < MIN_SUBMISSIONS) {
    return 1.0
  }

  const history: SubmissionRecord[] = []

  for (const testimony of testimonies) {
    const dayStart = new Date(testimony.fetchedAt)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(dayStart)
    dayEnd.setDate(dayEnd.getDate() + 1)

    const urlSources = await client.relationshipSource.findMany({
      where: {
        userId,
        source: 'MANUAL',
        relationshipId: testimony.relationshipId,
        fetchedAt: { gte: dayStart, lt: dayEnd },
      },
      select: { confidence: true },
    })

    const claimedValue = CONFIDENCE_VALUES[testimony.confidence as ConfidenceKey]
    const derivedValue = urlSources.length > 0
      ? Math.max(...urlSources.map(s => CONFIDENCE_VALUES[s.confidence as ConfidenceKey]))
      : CONFIDENCE_VALUES.ANECDOTAL

    history.push({ claimedValue, derivedValue })
  }

  const trustScore = scoreFromHistory(history)

  await client.user.update({
    where: { id: userId },
    data: { trustScore },
  })

  return trustScore
}
