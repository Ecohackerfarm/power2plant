import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { isTrustedResearcher, getSessionUser } from '@/lib/admin-auth'
import { RelationshipType, Direction, RelationshipReasonType } from '@prisma/client'
import { validateReasons } from '@/lib/research/helpers'
import { processReview, recomputeRelationship, type ReviewSubmission } from '@/lib/research/review'

/** Collapse a submitted (possibly legacy) relationship type to a polarity. */
function toPolarity(t: string): RelationshipType {
  if (t === 'AVOID') return 'AVOID'
  if (t === 'NEUTRAL') return 'NEUTRAL'
  return 'COMPANION' // COMPANION/ATTRACTS/REPELS/NURSE/TRAP_CROP are all beneficial
}

interface SubmitResult {
  summary: string
  relationshipType: string
  confidence: number
  reasons: Array<{ type: string; explanation: string }>
  direction: string
  sources: Array<{ url?: string; notes?: string; reasons?: Array<{ type: string; explanation: string }> }>
  model: string
  notes?: string
}

const VALID_RELATIONSHIP_TYPES = new Set(['COMPANION', 'AVOID', 'NEUTRAL', 'UNKNOWN', 'ATTRACTS', 'REPELS', 'NURSE', 'TRAP_CROP'])
const VALID_DIRECTIONS = new Set(['MUTUAL', 'ONE_WAY', 'UNKNOWN'])

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isTrustedResearcher())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const task = await prisma.externalResearchTask.findUnique({ where: { id } })
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (task.claimedById !== user.id) {
    return NextResponse.json({ error: 'You have not claimed this task' }, { status: 403 })
  }
  if (task.status !== 'CLAIMED') {
    return NextResponse.json({ error: 'Task is not in CLAIMED state' }, { status: 409 })
  }

  // REVIEW tasks settle a prior submission (apply verdicts + recompute) rather
  // than importing new data. Four-eyes was enforced at claim time.
  if (task.type === 'REVIEW') {
    let reviewBody: ReviewSubmission
    try {
      reviewBody = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    if (reviewBody.decision !== 'APPROVE' && reviewBody.decision !== 'REJECT') {
      return NextResponse.json({ error: 'decision must be APPROVE or REJECT' }, { status: 422 })
    }
    await prisma.$transaction((tx) => processReview(tx, task, reviewBody, user.id))
    return NextResponse.json({ ok: true })
  }

  let body: SubmitResult
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { summary, relationshipType, confidence, reasons, direction, sources, model, notes } = body

  if (!model || typeof model !== 'string') {
    return NextResponse.json({ error: 'model is required' }, { status: 422 })
  }

  const allowedModel = await prisma.researchModel.findFirst({ where: { id: model, allowed: true } })
  if (!allowedModel) {
    return NextResponse.json({ error: `Model "${model}" is not on the allowlist` }, { status: 422 })
  }

  if (!VALID_RELATIONSHIP_TYPES.has(relationshipType)) {
    return NextResponse.json({ error: 'Invalid relationshipType' }, { status: 422 })
  }
  if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
    return NextResponse.json({ error: 'confidence must be a number 0–1' }, { status: 422 })
  }

  const validatedReasons = validateReasons(reasons)
  const effectiveDirection = VALID_DIRECTIONS.has(direction) ? direction : 'UNKNOWN'

  await prisma.$transaction(async (tx) => {
    // Update task
    await tx.externalResearchTask.update({
      where: { id },
      data: {
        status: 'SUBMITTED',
        result: body as object,
        submittedAt: new Date(),
        agentModel: model,
      },
    })

    // Auto-import into CropRelationship — requires both crops, a non-UNKNOWN
    // polarity, minimum confidence, AND at least one source with provenance
    // (a relationship with no source has nothing for a reviewer to verify).
    const validSources = (sources ?? []).filter(s => s.url || s.notes)
    if (
      task.cropAId && task.cropBId &&
      relationshipType !== 'UNKNOWN' && confidence >= 0.3 &&
      validSources.length > 0
    ) {
      const polarity = toPolarity(relationshipType)
      const claimDirection = (effectiveDirection === 'UNKNOWN' ? 'UNKNOWN' : effectiveDirection) as Direction
      const [cropAId, cropBId] = task.cropAId < task.cropBId
        ? [task.cropAId, task.cropBId]
        : [task.cropBId, task.cropAId]

      const rel = await tx.cropRelationship.upsert({
        where: { cropAId_cropBId: { cropAId, cropBId } },
        create: {
          cropAId,
          cropBId,
          type: polarity,
          direction: (effectiveDirection === 'UNKNOWN' ? 'MUTUAL' : effectiveDirection) as Direction,
          confidence,
          notes: notes ?? summary ?? null,
        },
        update: { confidence, notes: notes ?? summary ?? null },
      })

      // Each source yields >=1 claim carrying the asserted polarity + direction.
      // Source-level reasons preferred; else the submission-level reasons; else
      // a single OTHER-mechanism claim so the source still counts.
      for (const src of validSources) {
        const createdSrc = await tx.relationshipSource.create({
          data: {
            relationshipId: rel.id,
            source: 'COMMUNITY',
            sourceType: src.url ? 'SCIENTIFIC_PAPER' : 'PERSONAL_OBSERVATION',
            confidence: confidence >= 0.7 ? 'PEER_REVIEWED' : confidence >= 0.5 ? 'OBSERVED' : 'ANECDOTAL',
            url: src.url ?? null,
            notes: src.notes ?? null,
            userId: user.id,
            agentModel: model,
          },
        })

        const srcReasons = validateReasons(src.reasons)
        const claimReasons = srcReasons.length
          ? srcReasons
          : validatedReasons.length
            ? validatedReasons
            : [{ type: 'OTHER' as RelationshipReasonType, explanation: summary ?? '' }]
        await tx.relationshipClaim.createMany({
          data: claimReasons.map(r => ({
            mechanism: r.type,
            explanation: r.explanation,
            relationshipType: polarity,
            direction: claimDirection,
            relationshipId: rel.id,
            sourceId: createdSrc.id,
          })),
        })
      }

      // Recompute aggregates (type vote, direction, confidence, conflict, mechanisms)
      await recomputeRelationship(tx, rel.id)

      // Link imported relationship and trigger review task
      const reviewTask = await tx.externalResearchTask.create({
        data: {
          type: 'REVIEW',
          cropAId: task.cropAId,
          cropBId: task.cropBId,
          prompt: `Review the research submitted for ${task.cropAId} + ${task.cropBId}. Validate the relationship type, confidence score, reasons, and source citations. Model used: ${model} (score: ${allowedModel.score}/100).`,
          context: {
            originalTaskId: task.id,
            result: body as unknown as import('@prisma/client').Prisma.InputJsonValue,
            modelScore: allowedModel.score,
          } as import('@prisma/client').Prisma.InputJsonValue,
          status: 'OPEN',
        },
      })

      await tx.externalResearchTask.update({
        where: { id },
        data: {
          status: 'REVIEW_PENDING',
          importedRelationshipId: rel.id,
          reviewTaskId: reviewTask.id,
        },
      })
    }
  })

  return NextResponse.json({ ok: true })
}
