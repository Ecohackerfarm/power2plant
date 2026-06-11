import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { isTrustedResearcher, getSessionUser } from '@/lib/admin-auth'
import { RelationshipType, Direction } from '@prisma/client'
import { validateReasons } from '@/lib/research/helpers'
import { randomUUID } from 'crypto'

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

    // Auto-import into CropRelationship if we have both crops and a non-UNKNOWN type
    if (task.cropAId && task.cropBId && relationshipType !== 'UNKNOWN' && confidence >= 0.3) {
      const [cropAId, cropBId] = task.cropAId < task.cropBId
        ? [task.cropAId, task.cropBId]
        : [task.cropBId, task.cropAId]

      const rel = await tx.cropRelationship.upsert({
        where: { cropAId_cropBId: { cropAId, cropBId } },
        create: {
          cropAId,
          cropBId,
          type: relationshipType as RelationshipType,
          direction: (effectiveDirection === 'UNKNOWN' ? 'MUTUAL' : effectiveDirection) as Direction,
          confidence,
          notes: notes ?? summary ?? null,
        },
        update: { confidence, notes: notes ?? summary ?? null },
      })

      // Write relationship-level reasons
      if (validatedReasons.length > 0) {
        await tx.relationshipReason.createMany({
          data: validatedReasons.map(r => ({
            id: randomUUID(),
            type: r.type,
            explanation: r.explanation,
            cropRelationshipId: rel.id,
          })),
          skipDuplicates: true,
        })
      }

      // Create source per submitted source URL, then write source-level reasons
      for (const src of sources ?? []) {
        if (!src.url && !src.notes) continue
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
        if (srcReasons.length > 0) {
          await tx.relationshipReason.createMany({
            data: srcReasons.map(r => ({
              id: randomUUID(),
              type: r.type,
              explanation: r.explanation,
              sourceId: createdSrc.id,
            })),
            skipDuplicates: true,
          })
        }
      }

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
