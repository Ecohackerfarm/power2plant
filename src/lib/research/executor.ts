import prisma from '@/lib/prisma'
import { RelationshipType } from '@prisma/client'
import {
  buildPrompt,
  stripCodeFences,
  extractDoi,
  aggregateByPair,
  mapDirection,
  validateReasons,
  computeRelationshipConfidence,
  type ReasonEntry,
  type ExtractedEntry,
} from './helpers'

const BASE_URL = process.env.LLM_BASE_URL ?? 'https://openrouter.ai/api/v1'
const MODEL = process.env.LLM_MODEL ?? 'perplexity/sonar-deep-research'

interface SonarFinding {
  type: 'COMPANION' | 'AVOID' | 'NEUTRAL' | 'UNKNOWN'
  reasons: Array<{ type: string; explanation: string }>
  direction: 'A_TO_B' | 'B_TO_A' | 'MUTUAL' | 'UNKNOWN'
  confidence: number
  notes: string
  cropAFound: boolean
  cropBFound: boolean
  sourceUrl: string | null
  genusWide?: boolean
  actualSpeciesA?: string | null
  actualSpeciesB?: string | null
}

interface LLMUsage {
  promptTokens: number
  completionTokens: number
  costUsd: number
  requestJson: object
  responseJson: object
}

/** Checks OpenRouter balance. Returns remaining USD or null if unavailable. */
export async function checkOpenRouterBalance(): Promise<number | null> {
  const apiKey = process.env.LLM_API_KEY ?? process.env.OPENROUTER_API_KEY
  if (!apiKey) return null
  try {
    const res = await fetch(`${BASE_URL}/auth/key`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) return null
    const data = await res.json() as { data?: { limit_remaining?: number } }
    return data.data?.limit_remaining ?? null
  } catch {
    return null
  }
}

/** Calls the LLM for a single crop pair. Returns entries + usage stats. */
async function callLLM(cropA: string, cropB: string): Promise<{ entries: ExtractedEntry[]; usage: LLMUsage }> {
  const apiKey = process.env.LLM_API_KEY ?? process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('LLM_API_KEY not configured')

  const requestBody = {
    model: MODEL,
    messages: [{ role: 'user', content: buildPrompt(cropA, cropB) }],
  }

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(requestBody),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`LLM HTTP ${res.status}: ${text.slice(0, 200)}`)
  }

  const data = await res.json() as {
    choices: Array<{ message: { content: string } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }

  const content = data.choices[0]?.message?.content ?? ''
  const finding = JSON.parse(stripCodeFences(content)) as SonarFinding

  if (!['COMPANION', 'AVOID', 'NEUTRAL', 'UNKNOWN'].includes(finding.type)) {
    throw new Error(`Invalid type: ${finding.type}`)
  }
  if (typeof finding.confidence !== 'number' || finding.confidence < 0 || finding.confidence > 1) {
    throw new Error(`Invalid confidence: ${finding.confidence}`)
  }
  if (!['A_TO_B', 'B_TO_A', 'MUTUAL', 'UNKNOWN'].includes(finding.direction)) {
    finding.direction = 'UNKNOWN'
  }

  const reasons: ReasonEntry[] = validateReasons(finding.reasons)

  const citationUrl = finding.sourceUrl?.trim() || null
  const year = new Date().getFullYear()
  const genusWide = finding.genusWide === true
  const effectiveCropA = genusWide && finding.actualSpeciesA?.trim() ? finding.actualSpeciesA.trim() : cropA
  const effectiveCropB = genusWide && finding.actualSpeciesB?.trim() ? finding.actualSpeciesB.trim() : cropB

  const entries: ExtractedEntry[] = [{
    cropA: effectiveCropA,
    cropB: effectiveCropB,
    type: finding.type,
    reasons,
    direction: finding.direction,
    confidence: finding.confidence,
    notes: finding.notes,
    cropAFound: effectiveCropA !== cropA ? true : (finding.cropAFound ?? true),
    cropBFound: effectiveCropB !== cropB ? true : (finding.cropBFound ?? true),
    _source: 'sonar' as const,
    title: `Sonar synthesis: ${effectiveCropA} + ${effectiveCropB}`,
    doi: citationUrl ? extractDoi(citationUrl) : null,
    year,
    citationUrl,
    genusWide,
  }]

  return {
    entries,
    usage: {
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
      costUsd: 0,
      requestJson: requestBody,
      responseJson: data,
    },
  }
}

async function resolveCropId(name: string): Promise<string | null> {
  const byBotanical = await prisma.crop.findUnique({ where: { botanicalName: name } })
  if (byBotanical) return byBotanical.id
  const matches = await prisma.crop.findMany({
    where: { OR: [{ name: { equals: name, mode: 'insensitive' } }, { commonNames: { has: name } }] },
    orderBy: [{ isCommonCrop: 'desc' }, { createdAt: 'asc' }],
    select: { id: true, botanicalName: true, isCommonCrop: true },
  })
  return matches[0]?.id ?? null
}

async function findGenusCropId(botanicalName: string): Promise<string | null> {
  const genusWord = botanicalName.split(' ')[0].replace(/[$()*+.[\]?\\^{}|]/g, '\\$&')
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Crop" WHERE "botanicalName" ~ ${`^${genusWord} [A-Z]`} LIMIT 1
  `
  return rows[0]?.id ?? null
}

async function writeRelationshipReasons(
  relationshipId: string,
  sourceId: string | null,
  reasons: ReasonEntry[],
): Promise<void> {
  if (reasons.length === 0) return
  await prisma.relationshipReason.createMany({
    data: reasons.map(r => ({
      type: r.type,
      explanation: r.explanation,
      cropRelationshipId: sourceId === null ? relationshipId : null,
      sourceId: sourceId !== null ? sourceId : null,
    })),
    skipDuplicates: false,
  })
}

/** Imports ExtractedEntry[] into the DB. */
export async function importEntries(entries: ExtractedEntry[]): Promise<void> {
  const verified = entries.filter(e => (e.cropAFound ?? true) && (e.cropBFound ?? true) && e.type !== 'UNKNOWN' && e.confidence >= 0.5)
  const pairs = aggregateByPair(verified)

  for (const pair of pairs) {
    try {
      const idA = await resolveCropId(pair.cropA)
      const idB = await resolveCropId(pair.cropB)
      if (!idA || !idB) continue

      const [cropAId, cropBId] = idA < idB ? [idA, idB] : [idB, idA]

      const relationship = await prisma.cropRelationship.upsert({
        where: { cropAId_cropBId: { cropAId, cropBId } },
        create: { cropAId, cropBId, type: pair.type as RelationshipType, direction: 'MUTUAL', confidence: 0.25, notes: pair.notes },
        update: {},
        include: { sources: true },
      })

      // Write relationship-level reasons (delete old ones from automated research, re-insert)
      await prisma.relationshipReason.deleteMany({ where: { cropRelationshipId: relationship.id } })
      await writeRelationshipReasons(relationship.id, null, pair.reasons)

      const seenUrls = new Set(relationship.sources.map(s => s.url).filter(Boolean) as string[])
      const seenNoteKeys = new Set(relationship.sources.map(s => s.notes).filter(Boolean) as string[])

      for (const paper of pair.papers) {
        const paperUrl = paper.doi ? `https://doi.org/${paper.doi}` : (paper.citationUrl ?? null)
        const noteKey = `${paper.title} (${paper.year})`
        if (paperUrl !== null) {
          if (seenUrls.has(paperUrl)) continue
          seenUrls.add(paperUrl)
        } else {
          if (seenNoteKeys.has(noteKey)) continue
          seenNoteKeys.add(noteKey)
        }
        const paperCropAId = await resolveCropId(paper.extractedCropA)
        const src = await prisma.relationshipSource.create({
          data: {
            relationshipId: relationship.id,
            source: 'RESEARCH',
            confidence: paperUrl ? 'PEER_REVIEWED' : 'ANECDOTAL',
            position: paper.position,
            sourceDirection: mapDirection(paper.direction, paperCropAId ?? idA, cropAId) as any,
            url: paperUrl,
            notes: noteKey,
          },
        })
        await writeRelationshipReasons(relationship.id, src.id, paper.reasons)
      }

      const allSources = await prisma.relationshipSource.findMany({ where: { relationshipId: relationship.id }, select: { confidence: true } })
      await prisma.cropRelationship.update({ where: { id: relationship.id }, data: { confidence: computeRelationshipConfidence(allSources.map(s => s.confidence)) } })

      // Genus dual-write
      if (pair.genusWide) {
        try {
          const genusAId = await findGenusCropId(pair.cropA)
          const genusBId = await findGenusCropId(pair.cropB)
          if (genusAId && genusBId && (genusAId !== idA || genusBId !== idB)) {
            const [gCropAId, gCropBId] = genusAId < genusBId ? [genusAId, genusBId] : [genusBId, genusAId]
            const genusRel = await prisma.cropRelationship.upsert({
              where: { cropAId_cropBId: { cropAId: gCropAId, cropBId: gCropBId } },
              create: { cropAId: gCropAId, cropBId: gCropBId, type: pair.type as RelationshipType, direction: 'MUTUAL', confidence: 0.25, notes: pair.notes },
              update: {},
              include: { sources: true },
            })
            await prisma.relationshipReason.deleteMany({ where: { cropRelationshipId: genusRel.id } })
            await writeRelationshipReasons(genusRel.id, null, pair.reasons)

            const seenGenusUrls = new Set(genusRel.sources.map(s => s.url).filter(Boolean) as string[])
            const seenGenusNoteKeys = new Set(genusRel.sources.map(s => s.notes).filter(Boolean) as string[])
            for (const paper of pair.papers) {
              const paperUrl = paper.doi ? `https://doi.org/${paper.doi}` : (paper.citationUrl ?? null)
              const noteKey = `Derived from ${pair.cropA}: ${paper.title} (${paper.year})`
              if (paperUrl !== null) {
                if (seenGenusUrls.has(paperUrl)) continue
                seenGenusUrls.add(paperUrl)
              } else {
                if (seenGenusNoteKeys.has(noteKey)) continue
                seenGenusNoteKeys.add(noteKey)
              }
              const src = await prisma.relationshipSource.create({
                data: { relationshipId: genusRel.id, source: 'RESEARCH', confidence: paperUrl ? 'PEER_REVIEWED' : 'ANECDOTAL', position: paper.position, url: paperUrl, notes: noteKey },
              })
              await writeRelationshipReasons(genusRel.id, src.id, paper.reasons)
            }
            const genusSources = await prisma.relationshipSource.findMany({ where: { relationshipId: genusRel.id }, select: { confidence: true } })
            await prisma.cropRelationship.update({ where: { id: genusRel.id }, data: { confidence: computeRelationshipConfidence(genusSources.map(s => s.confidence)) } })
          }
        } catch {
          // genus derivation is best-effort
        }
      }
    } catch (err) {
      console.error(`Error importing pair ${pair.cropA} + ${pair.cropB}:`, err)
    }
  }
}

/** Sends a plain-text admin alert email via SMTP (best-effort, never throws). */
async function sendAdminAlert(subject: string, body: string): Promise<void> {
  const host = process.env.SMTP_HOST
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  const from = process.env.SMTP_FROM
  if (!host || !user || !pass || !from) return

  try {
    const nodemailer = await import('nodemailer')
    const transporter = nodemailer.default.createTransport({
      host,
      port: parseInt(process.env.SMTP_PORT ?? '587'),
      auth: { user, pass },
    })
    const config = await prisma.appConfig.findUnique({ where: { id: 'singleton' } })
    const recipients = config?.feedbackDigestEmails ?? []
    if (recipients.length === 0) return
    await transporter.sendMail({ from, to: recipients, subject, text: body })
  } catch (err) {
    console.error('Admin alert email failed:', err)
  }
}

/**
 * Full pipeline for one queue item: check balance → call LLM → import → write log → mark DONE/FAILED.
 * Expects the item to already be IN_PROGRESS.
 */
export async function processQueueItem(queueId: string): Promise<void> {
  const item = await prisma.researchQueue.findUniqueOrThrow({
    where: { id: queueId },
    include: { cropA: true, cropB: true },
  })

  const threshold = parseFloat(process.env.RESEARCH_LOW_BALANCE_USD ?? '5')
  const balance = await checkOpenRouterBalance()
  if (balance !== null && balance < threshold) {
    await sendAdminAlert(
      'Power2Plant: OpenRouter balance low',
      `OpenRouter balance is $${balance.toFixed(2)}, below the $${threshold} threshold.\n\nResearch job for "${item.cropA.botanicalName} + ${item.cropB.botanicalName}" was paused.`,
    )
    if (balance <= 0) {
      await prisma.researchQueue.update({
        where: { id: queueId },
        data: { status: 'FAILED', completedAt: new Date() },
      })
      throw new Error('OpenRouter balance exhausted')
    }
  }

  try {
    const { entries, usage } = await callLLM(item.cropA.botanicalName, item.cropB.botanicalName)
    await importEntries(entries)

    await prisma.researchLog.create({
      data: {
        researchQueueId: queueId,
        model: MODEL,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        costUsd: usage.costUsd,
        requestJson: usage.requestJson,
        responseJson: usage.responseJson,
      },
    })

    await prisma.researchQueue.update({
      where: { id: queueId },
      data: { status: 'DONE', completedAt: new Date() },
    })
  } catch (err) {
    await prisma.researchQueue.update({
      where: { id: queueId },
      data: { status: 'FAILED', completedAt: new Date() },
    })
    throw err
  }
}
