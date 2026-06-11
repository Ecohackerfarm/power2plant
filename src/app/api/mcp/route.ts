/**
 * MCP HTTP transport for the power2plant research queue.
 *
 * Implements the MCP 2024-11-05 streamable-HTTP transport (JSON-RPC 2.0 over POST).
 * Auth: Bearer <user_api_token> — validated against UserApiToken table.
 *
 * Tools exposed:
 *   list_research_tasks   — list OPEN + own CLAIMED tasks
 *   claim_task            — claim an OPEN task
 *   submit_task           — submit findings and trigger auto-import
 *
 * Discovery: add this server in your MCP client config:
 *   { "url": "https://power2plant.app/api/mcp", "headers": { "Authorization": "Bearer <token>" } }
 */

import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

async function resolveUser(req: Request) {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null
  if (!token) return null

  const record = await prisma.userApiToken.findUnique({
    where: { token },
    select: {
      id: true,
      userId: true,
      user: { select: { id: true, name: true, trustedResearcher: true } },
    },
  })
  if (!record) return null

  // Update lastUsedAt without blocking response
  prisma.userApiToken.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } }).catch(() => {})
  return record.user
}

// ---------------------------------------------------------------------------
// JSON-RPC helpers
// ---------------------------------------------------------------------------

type JsonRpcRequest = { jsonrpc: '2.0'; id: string | number | null; method: string; params?: unknown }
type JsonRpcError = { code: number; message: string; data?: unknown }

function ok(id: string | number | null, result: unknown) {
  return { jsonrpc: '2.0', id, result }
}

function err(id: string | number | null, error: JsonRpcError) {
  return { jsonrpc: '2.0', id, error }
}

const E = {
  PARSE:    { code: -32700, message: 'Parse error' },
  METHOD:   { code: -32601, message: 'Method not found' },
  PARAMS:   { code: -32602, message: 'Invalid params' },
  AUTH:     { code: -32001, message: 'Unauthorized' },
  FORBIDDEN:{ code: -32002, message: 'Forbidden — user is not a trusted researcher' },
  NOT_FOUND:{ code: -32003, message: 'Not found' },
  CONFLICT: { code: -32004, message: 'Conflict' },
  UNPROC:   { code: -32005, message: 'Unprocessable' },
  INTERNAL: { code: -32603, message: 'Internal error' },
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

async function listResearchTasks(userId: string) {
  return prisma.externalResearchTask.findMany({
    where: { OR: [{ status: 'OPEN' }, { claimedById: userId, status: 'CLAIMED' }] },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, type: true, status: true, prompt: true, context: true,
      deadline: true, createdAt: true,
      cropA: { select: { id: true, name: true, botanicalName: true } },
      cropB: { select: { id: true, name: true, botanicalName: true } },
    },
  })
}

async function claimTask(userId: string, id: string) {
  const task = await prisma.externalResearchTask.findUnique({ where: { id } })
  if (!task) return { error: 'NOT_FOUND' as const }
  if (task.status !== 'OPEN') return { error: 'CONFLICT' as const }

  const updated = await prisma.externalResearchTask.update({
    where: { id, status: 'OPEN' },
    data: { status: 'CLAIMED', claimedById: userId, claimedAt: new Date() },
    select: {
      id: true, type: true, status: true, prompt: true, context: true,
      deadline: true, createdAt: true,
      cropA: { select: { id: true, name: true, botanicalName: true } },
      cropB: { select: { id: true, name: true, botanicalName: true } },
    },
  }).catch(() => null)

  if (!updated) return { error: 'CONFLICT' as const }
  return { task: updated }
}

// ---------------------------------------------------------------------------
// MCP protocol: initialize + tools/list + tools/call
// ---------------------------------------------------------------------------

const TOOL_DEFS = [
  {
    name: 'list_research_tasks',
    description: 'List OPEN research tasks and your own CLAIMED tasks.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'claim_task',
    description: 'Claim an OPEN research task so you can work on it exclusively.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Task ID to claim' },
      },
      required: ['id'],
    },
  },
  {
    name: 'submit_task',
    description: 'Submit your research findings. The result will be auto-imported and a review task created.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Task ID (must be in CLAIMED state by you)' },
        result: {
          type: 'object',
          description: 'Research findings',
          properties: {
            summary: { type: 'string' },
            relationshipType: { type: 'string', enum: ['COMPANION', 'AVOID', 'NEUTRAL', 'UNKNOWN'] },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            reasons: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['PEST_CONTROL', 'POLLINATION', 'NUTRIENT', 'SHADE', 'ALLELOPATHY', 'OTHER'] },
                  explanation: { type: 'string' },
                },
                required: ['type', 'explanation'],
              },
            },
            direction: { type: 'string', enum: ['MUTUAL', 'ONE_WAY', 'UNKNOWN'] },
            sources: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  url: { type: 'string' },
                  notes: { type: 'string' },
                  reasons: { type: 'array', items: { type: 'object' } },
                },
              },
            },
            model: { type: 'string' },
            notes: { type: 'string' },
          },
          required: ['summary', 'relationshipType', 'confidence', 'model'],
        },
      },
      required: ['id', 'result'],
    },
  },
]

async function handleMethod(
  method: string,
  params: unknown,
  rpcId: string | number | null,
  userId: string,
): Promise<ReturnType<typeof ok | typeof err>> {
  if (method === 'initialize') {
    return ok(rpcId, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'power2plant-research', version: '1.0.0' },
    })
  }

  if (method === 'tools/list') {
    return ok(rpcId, { tools: TOOL_DEFS })
  }

  if (method === 'tools/call') {
    const p = params as { name?: string; arguments?: unknown }
    const name = p?.name
    const args = (p?.arguments ?? {}) as Record<string, unknown>

    if (name === 'list_research_tasks') {
      const tasks = await listResearchTasks(userId)
      return ok(rpcId, { content: [{ type: 'text', text: JSON.stringify(tasks, null, 2) }] })
    }

    if (name === 'claim_task') {
      if (!args.id || typeof args.id !== 'string') {
        return err(rpcId, { ...E.PARAMS, data: 'id is required' })
      }
      const result = await claimTask(userId, args.id)
      if ('error' in result) {
        if (result.error === 'NOT_FOUND') return err(rpcId, E.NOT_FOUND)
        return err(rpcId, E.CONFLICT)
      }
      return ok(rpcId, { content: [{ type: 'text', text: JSON.stringify(result.task, null, 2) }] })
    }

    if (name === 'submit_task') {
      if (!args.id || typeof args.id !== 'string') {
        return err(rpcId, { ...E.PARAMS, data: 'id is required' })
      }
      if (!args.result || typeof args.result !== 'object') {
        return err(rpcId, { ...E.PARAMS, data: 'result is required' })
      }

      // Delegate to the submit route logic by calling it via fetch (internal)
      const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
      // We can't pass session cookies here, so we re-implement the core logic inline.
      const result = args.result as Record<string, unknown>
      const model = result.model as string
      if (!model) return err(rpcId, { ...E.PARAMS, data: 'result.model is required' })

      const allowed = await prisma.researchModel.findFirst({ where: { id: model, allowed: true } })
      if (!allowed) return err(rpcId, { ...E.UNPROC, data: `Model "${model}" is not on the allowlist` })

      const task = await prisma.externalResearchTask.findUnique({ where: { id: args.id } })
      if (!task) return err(rpcId, E.NOT_FOUND)
      if (task.claimedById !== userId) return err(rpcId, { ...E.FORBIDDEN, message: 'You have not claimed this task' })
      if (task.status !== 'CLAIMED') return err(rpcId, { ...E.CONFLICT, message: 'Task is not CLAIMED' })

      const { validateReasons } = await import('@/lib/research/helpers')
      const { RelationshipType, Direction, RelationshipReasonType } = await import('@prisma/client')

      const confidence = typeof result.confidence === 'number' ? result.confidence : 0
      const relationshipType = typeof result.relationshipType === 'string' ? result.relationshipType : 'UNKNOWN'
      const direction = typeof result.direction === 'string' ? result.direction : 'UNKNOWN'
      const validatedReasons = validateReasons(result.reasons)
      const summary = typeof result.summary === 'string' ? result.summary : ''
      const notes = typeof result.notes === 'string' ? result.notes : null

      await prisma.$transaction(async (tx) => {
        await tx.externalResearchTask.update({
          where: { id: args.id as string },
          data: { status: 'SUBMITTED', result: result as object, submittedAt: new Date(), agentModel: model },
        })

        const validSources = (Array.isArray(result.sources) ? result.sources as Array<{ url?: string; notes?: string; reasons?: unknown }> : []).filter(s => s.url || s.notes)
        if (task.cropAId && task.cropBId && relationshipType !== 'UNKNOWN' && confidence >= 0.3 && validSources.length > 0) {
          const polarity = (relationshipType === 'AVOID' ? 'AVOID' : relationshipType === 'NEUTRAL' ? 'NEUTRAL' : 'COMPANION') as typeof RelationshipType[keyof typeof RelationshipType]
          const claimDirection = (direction === 'UNKNOWN' ? 'UNKNOWN' : direction) as typeof Direction[keyof typeof Direction]
          const [cropAId, cropBId] = task.cropAId < task.cropBId
            ? [task.cropAId, task.cropBId]
            : [task.cropBId, task.cropAId]

          const rel = await tx.cropRelationship.upsert({
            where: { cropAId_cropBId: { cropAId, cropBId } },
            create: {
              cropAId, cropBId,
              type: polarity,
              direction: (direction === 'UNKNOWN' ? 'MUTUAL' : direction) as typeof Direction[keyof typeof Direction],
              confidence,
              notes: notes ?? summary ?? null,
            },
            update: { confidence, notes: notes ?? summary ?? null },
          })

          for (const src of validSources) {
            const createdSrc = await tx.relationshipSource.create({
              data: {
                relationshipId: rel.id,
                source: 'COMMUNITY',
                sourceType: src.url ? 'SCIENTIFIC_PAPER' : 'PERSONAL_OBSERVATION',
                confidence: confidence >= 0.7 ? 'PEER_REVIEWED' : confidence >= 0.5 ? 'OBSERVED' : 'ANECDOTAL',
                url: src.url ?? null,
                notes: src.notes ?? null,
                userId,
                agentModel: model,
              },
            })
            const srcReasons = validateReasons(src.reasons)
            const claimReasons = srcReasons.length
              ? srcReasons
              : validatedReasons.length
                ? validatedReasons
                : [{ type: 'OTHER' as typeof RelationshipReasonType[keyof typeof RelationshipReasonType], explanation: summary }]
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

          const reviewTask = await tx.externalResearchTask.create({
            data: {
              type: 'REVIEW',
              cropAId: task.cropAId,
              cropBId: task.cropBId,
              prompt: `Review research for crops ${task.cropAId} + ${task.cropBId}. Validate relationship type, confidence, reasons, and source citations. Model used: ${model} (score: ${allowed.score}/100).`,
              context: { originalTaskId: task.id, result, modelScore: allowed.score } as import('@prisma/client').Prisma.InputJsonValue,
              status: 'OPEN',
            },
          })

          await tx.externalResearchTask.update({
            where: { id: args.id as string },
            data: { status: 'REVIEW_PENDING', importedRelationshipId: rel.id, reviewTaskId: reviewTask.id },
          })
        }
      })

      void base // suppress unused warning
      return ok(rpcId, { content: [{ type: 'text', text: 'Submission accepted. Review task created.' }] })
    }

    return err(rpcId, { ...E.METHOD, data: `Unknown tool: ${name}` })
  }

  if (method === 'notifications/initialized') {
    return ok(rpcId, {})
  }

  return err(rpcId, E.METHOD)
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  const user = await resolveUser(req)
  if (!user) {
    return NextResponse.json(err(null, E.AUTH), { status: 401 })
  }
  if (!user.trustedResearcher) {
    return NextResponse.json(err(null, E.FORBIDDEN), { status: 403 })
  }

  let body: JsonRpcRequest | JsonRpcRequest[]
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(err(null, E.PARSE), { status: 400 })
  }

  if (Array.isArray(body)) {
    const results = await Promise.all(
      body.map(r => handleMethod(r.method, r.params, r.id ?? null, user.id))
    )
    return NextResponse.json(results)
  }

  const result = await handleMethod(body.method, body.params, body.id ?? null, user.id)
  return NextResponse.json(result)
}

// MCP discovery endpoint
export async function GET() {
  return NextResponse.json({
    name: 'power2plant-research',
    description: 'Research task queue for power2plant trusted contributors',
    version: '1.0.0',
    transport: 'http',
    endpoint: '/api/mcp',
    authentication: { type: 'bearer', hint: 'Get your token at /settings' },
  })
}
