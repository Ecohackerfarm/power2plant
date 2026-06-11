import { Prisma, RejectReason, RelationshipType, Direction, ConfidenceLevel } from '@prisma/client'
import { CONFIDENCE_WEIGHTS, computeRelationshipConfidence } from './helpers'

type Tx = Prisma.TransactionClient

export interface ReviewCheckInput {
  sourceId?: string
  claimId?: string
  correct: boolean
  reason?: RejectReason
  notes?: string
  // optional corrections for amend-style reasons
  correctedType?: RelationshipType
  correctedDirection?: Direction
}

export interface ReviewSubmission {
  decision: 'APPROVE' | 'REJECT'
  reviewNote?: string
  checks?: ReviewCheckInput[]
}

const DOWNGRADE_FLOOR: ConfidenceLevel = 'OBSERVED'
const CONF_ORDER: ConfidenceLevel[] = ['ANECDOTAL', 'TRADITIONAL', 'OBSERVED', 'PEER_REVIEWED']

/**
 * Apply a single review verdict: record an audit row (ReviewCheck), then mutate
 * data per the reason. Source/claim deletes are safe — ReviewCheck FKs SET NULL,
 * so the audit row survives.
 */
export async function applyCheck(tx: Tx, check: ReviewCheckInput, checkedBy: string): Promise<void> {
  await tx.reviewCheck.create({
    data: {
      sourceId: check.sourceId ?? null,
      claimId: check.claimId ?? null,
      correct: check.correct,
      reason: check.reason ?? null,
      notes: check.notes ?? null,
      checkedBy,
    },
  })
  if (check.correct || !check.reason) return

  switch (check.reason) {
    // source-level — no valid evidence: remove the source (cascades its claims)
    case 'SOURCE_NOT_FOUND':
    case 'OFF_TOPIC':
    case 'DUPLICATE':
      if (check.sourceId) await tx.relationshipSource.delete({ where: { id: check.sourceId } })
      break
    // source-level — valid but overrated: cap confidence at OBSERVED (never raise)
    case 'NOT_PEER_REVIEWED':
      if (check.sourceId) {
        const src = await tx.relationshipSource.findUnique({ where: { id: check.sourceId }, select: { confidence: true } })
        if (src && CONF_ORDER.indexOf(src.confidence) > CONF_ORDER.indexOf(DOWNGRADE_FLOOR)) {
          await tx.relationshipSource.update({ where: { id: check.sourceId }, data: { confidence: DOWNGRADE_FLOOR } })
        }
      }
      break
    // source-level — couldn't verify: keep, audit only
    case 'INACCESSIBLE':
      break
    // claim-level — wrong polarity: amend if a correction is given, else reject
    case 'WRONG_TYPE':
    case 'CONTRADICTS':
      if (check.claimId) {
        await tx.relationshipClaim.update({
          where: { id: check.claimId },
          data: check.correctedType
            ? { relationshipType: check.correctedType }
            : { rejectedAt: new Date() },
        })
      }
      break
    // claim-level — wrong direction: amend if given, else reject
    case 'WRONG_DIRECTION':
      if (check.claimId) {
        await tx.relationshipClaim.update({
          where: { id: check.claimId },
          data: check.correctedDirection
            ? { direction: check.correctedDirection }
            : { rejectedAt: new Date() },
        })
      }
      break
    // claim-level — claim not supported by the source: reject it
    case 'CLAIM_UNSUPPORTED':
      if (check.claimId) {
        await tx.relationshipClaim.update({ where: { id: check.claimId }, data: { rejectedAt: new Date() } })
      }
      break
  }
}

/**
 * Recompute a relationship's aggregates from its live (non-rejected) claims and
 * sources. Hard-deletes when no sources remain; soft-deletes (deletedAt) when
 * sources remain but no live claim does.
 */
export async function recomputeRelationship(tx: Tx, relationshipId: string): Promise<void> {
  const totalSources = await tx.relationshipSource.count({ where: { relationshipId } })
  if (totalSources === 0) {
    await tx.cropRelationship.delete({ where: { id: relationshipId } })
    return
  }

  const claims = await tx.relationshipClaim.findMany({
    where: { relationshipId, rejectedAt: null, source: { rejectedAt: null } },
    select: { mechanism: true, relationshipType: true, direction: true, source: { select: { confidence: true } } },
  })

  if (claims.length === 0) {
    await tx.cropRelationship.update({ where: { id: relationshipId }, data: { deletedAt: new Date() } })
    return
  }

  // polarity = confidence-weighted vote of claim types; tie/none => UNCERTAIN
  const tally: Record<string, number> = {}
  for (const c of claims) {
    tally[c.relationshipType] = (tally[c.relationshipType] ?? 0) + (CONFIDENCE_WEIGHTS[c.source.confidence] ?? 0.25)
  }
  const companion = tally['COMPANION'] ?? 0
  const avoid = tally['AVOID'] ?? 0
  const neutral = tally['NEUTRAL'] ?? 0
  const max = Math.max(companion, avoid, neutral)
  const scores: Array<[RelationshipType, number]> = [['COMPANION', companion], ['AVOID', avoid], ['NEUTRAL', neutral]]
  const winners = scores.filter(([, v]) => v === max && max > 0)
  const type: RelationshipType = winners.length === 1 ? winners[0][0] : 'UNCERTAIN'
  const conflict = companion > 0 && avoid > 0

  const dirs = new Set(claims.map(c => c.direction))
  const direction: Direction = dirs.has('MUTUAL') ? 'MUTUAL' : dirs.has('ONE_WAY') ? 'ONE_WAY' : 'UNKNOWN'

  const mechanisms = [...new Set(claims.map(c => c.mechanism))]

  const liveSources = await tx.relationshipSource.findMany({
    where: { relationshipId, rejectedAt: null },
    select: { confidence: true },
  })
  const confidence = computeRelationshipConfidence(liveSources.map(s => s.confidence))

  await tx.cropRelationship.update({
    where: { id: relationshipId },
    data: { type, direction, confidence, conflict, mechanisms, deletedAt: null },
  })
}

/**
 * Process a REVIEW task submission: apply all per-source/per-claim verdicts,
 * recompute the imported relationship, then settle the review + original task.
 */
export async function processReview(
  tx: Tx,
  reviewTask: { id: string; context: Prisma.JsonValue | null },
  submission: ReviewSubmission,
  checkedBy: string,
): Promise<void> {
  const ctx = (reviewTask.context ?? {}) as { originalTaskId?: string }
  const original = ctx.originalTaskId
    ? await tx.externalResearchTask.findUnique({
        where: { id: ctx.originalTaskId },
        select: { id: true, importedRelationshipId: true },
      })
    : null

  for (const check of submission.checks ?? []) {
    await applyCheck(tx, check, checkedBy)
  }

  if (original?.importedRelationshipId) {
    await recomputeRelationship(tx, original.importedRelationshipId)
  }

  const settled = submission.decision === 'APPROVE' ? 'REVIEWED' : 'REJECTED'
  await tx.externalResearchTask.update({
    where: { id: reviewTask.id },
    data: { status: settled, reviewNote: submission.reviewNote ?? null, reviewedAt: new Date() },
  })
  if (original) {
    await tx.externalResearchTask.update({ where: { id: original.id }, data: { status: settled } })
  }
}
