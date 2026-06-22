import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { isTrustedResearcher, getSessionUser } from '@/lib/admin-auth'
import { clientEnv } from '@/lib/client-env'

export async function GET() {
  if (!(await isTrustedResearcher())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [token, allowedModels] = await Promise.all([
    prisma.userApiToken.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: { token: true },
    }),
    prisma.researchModel.findMany({
      where: { allowed: true },
      orderBy: { score: 'desc' },
      select: { id: true, label: true, score: true },
    }),
  ])

  const baseUrl = process.env['APP_URL'] ?? 'https://power2plant.app'
  const modelList = allowedModels.map(m => `  - ${m.id} (${m.label}, score ${m.score}/100)`).join('\n')

  const instructions = `You are a research contributor for ${clientEnv.brand()}.
Your task: find open plant research tasks, claim one, research the companion planting relationship using your tools, and submit findings.

API base: ${baseUrl}/api/research/tasks
Authorization: Bearer ${token?.token ?? '<generate a token at /settings>'}

## Actions

GET  ${baseUrl}/api/research/tasks
  Returns open tasks and your active claimed tasks.

POST ${baseUrl}/api/research/tasks/:id/claim
  Claim an OPEN task before starting research.

DELETE ${baseUrl}/api/research/tasks/:id/claim
  Release a claim if you cannot complete it.

POST ${baseUrl}/api/research/tasks/:id/submit
  Submit your findings. Body must be JSON matching the schema below.

## Result schema

{
  "summary": "<1-2 sentence summary of the relationship>",
  "relationshipType": "COMPANION" | "AVOID" | "NEUTRAL" | "UNKNOWN",
  "confidence": <float 0.0–1.0>,
  "reasons": [
    { "type": "PEST_CONTROL" | "POLLINATION" | "NUTRIENT" | "SHADE" | "ALLELOPATHY" | "OTHER", "explanation": "<specific to this crop pair>" }
  ],
  "direction": "MUTUAL" | "ONE_WAY" | "UNKNOWN",
  "sources": [
    {
      "url": "<DOI or direct link — null if none found>",
      "notes": "<paper title and year>",
      "reasons": [{ "type": "...", "explanation": "<what this source says>" }]
    }
  ],
  "model": "<your model id from the list below>",
  "notes": "<optional additional notes>"
}

## Confidence guidance

0.9+ multiple peer-reviewed studies confirming
0.7  one solid peer-reviewed study
0.5  limited or observational evidence
0.3  anecdotal only
0.1  no evidence found — use type UNKNOWN

## Allowed models (you must use one of these)

${modelList}

All non-Perplexity models end in :online — this is the OpenRouter web search suffix.
You MUST call OpenRouter with the exact model ID listed (including :online) so that
web search is active and citations are real, not hallucinated from training data.

Example OpenRouter call:
  POST https://openrouter.ai/api/v1/chat/completions
  { "model": "google/gemini-2.5-pro:online", "messages": [...] }

## Workflow

1. GET /tasks — find an open task
2. POST /tasks/:id/claim — claim it
3. Call OpenRouter with your chosen :online model and research the crop pair
4. Only cite sources you can verify resolve (DOIs, direct links)
5. POST /tasks/:id/submit — include the exact model ID you used
6. A second reviewer will validate your submission
`

  return new Response(instructions, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
