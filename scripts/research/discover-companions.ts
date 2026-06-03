/**
 * Open-ended companion discovery: given plant name(s), asks sonar-deep-research
 * to find ALL scientifically documented companion/avoid relationships for each plant.
 * Appends findings to data/research/extracted.json → run import.ts next.
 *
 * Unlike sonar-research.ts (which researches known pairs), this discovers new pairs.
 *
 * Usage:
 *   npx tsx scripts/research/discover-companions.ts "Solanum lycopersicum"
 *   npx tsx scripts/research/discover-companions.ts "Tomato" "Basil" "Carrot"
 *
 * Env vars:
 *   LLM_API_KEY / OPENROUTER_API_KEY  (required)
 *   LLM_BASE_URL                       (default: https://openrouter.ai/api/v1)
 *   LLM_MODEL                          (default: perplexity/sonar-deep-research)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface SonarCompanionFinding {
  companionPlant: string
  botanicalName: string | null
  sourceUrl: string | null
  type: 'COMPANION' | 'AVOID' | 'NEUTRAL' | 'UNKNOWN'
  reason: 'PEST_CONTROL' | 'POLLINATION' | 'NUTRIENT' | 'SHADE' | 'ALLELOPATHY' | 'OTHER' | null
  direction: 'A_TO_B' | 'B_TO_A' | 'MUTUAL' | 'UNKNOWN'
  confidence: number
  notes: string
  cropFound: boolean
}

interface ExtractedEntry {
  cropA: string
  cropB: string
  type: 'COMPANION' | 'AVOID' | 'NEUTRAL' | 'UNKNOWN'
  reason: string | null
  direction: string
  confidence: number
  notes: string
  title: string
  doi: string | null
  year: number
  citationUrl: string | null
  cropAFound: boolean
  cropBFound: boolean
  _source: 'sonar-discover'
}

const BASE_URL = process.env.LLM_BASE_URL ?? 'https://openrouter.ai/api/v1'
const MODEL = process.env.LLM_MODEL ?? 'perplexity/sonar-deep-research'
const API_KEY = process.env.LLM_API_KEY ?? process.env.OPENROUTER_API_KEY
const RATE_LIMIT_MS = 3000

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function extractDoi(url: string): string | null {
  const m = url.match(/(?:doi\.org|dx\.doi\.org)\/(.+)/)
  return m ? decodeURIComponent(m[1]) : null
}

function stripCodeFences(text: string): string {
  const t = text.trim()
  if (t.startsWith('```json')) return t.slice(7, -3).trim()
  if (t.startsWith('```')) return t.slice(3, -3).trim()
  return t
}

async function resolveCrop(name: string): Promise<{ id: string; botanicalName: string; name: string } | null> {
  const byBotanical = await prisma.crop.findUnique({
    where: { botanicalName: name },
    select: { id: true, botanicalName: true, name: true },
  })
  if (byBotanical) return byBotanical

  const matches = await prisma.crop.findMany({
    where: {
      OR: [
        { name: { equals: name, mode: 'insensitive' } },
        { commonNames: { has: name } },
      ],
    },
    orderBy: [{ isCommonCrop: 'desc' }, { createdAt: 'asc' }],
    select: { id: true, botanicalName: true, name: true },
  })
  return matches[0] ?? null
}

function buildPrompt(botanicalName: string, commonName: string): string {
  const label = botanicalName === commonName ? botanicalName : `${botanicalName} (${commonName})`
  return `Find all scientifically documented companion planting relationships for ${label}. Search peer-reviewed agricultural research, field trials, and experimental studies.

Rules:
- One entry per single plant species only. No lists ("A and B"), no groups ("various Poaceae"), no genera ("Solanum spp."), no non-plants (insects, animals).
- If you cannot identify a specific species, omit the entry entirely.
- One entry per source paper. If the same plant appears in multiple papers, emit one entry per paper.
- Do not duplicate: same plant + same sourceUrl must not appear twice.

Respond ONLY with a JSON array — no markdown, no explanation:
[
  {
    "companionPlant": "<common name>",
    "botanicalName": "<species-level botanical name, e.g. Zea mays — null only if genuinely unknown>",
    "sourceUrl": "<direct URL or DOI URL of the study, e.g. https://doi.org/10.xxxx/xxxx — null if not found>",
    "type": "COMPANION" | "AVOID" | "NEUTRAL",
    "reason": "PEST_CONTROL" | "POLLINATION" | "NUTRIENT" | "SHADE" | "ALLELOPATHY" | "OTHER" | null,
    "direction": "A_TO_B" | "B_TO_A" | "MUTUAL" | "UNKNOWN",
    "confidence": <float 0.0–1.0>,
    "notes": "<one sentence ≤200 chars>",
    "cropFound": <true if the study specifically researches ${botanicalName}>
  }
]

direction: A_TO_B = ${botanicalName} benefits the companion; B_TO_A = companion benefits ${botanicalName}; MUTUAL = both benefit.
confidence: 0.9+ multiple peer-reviewed studies; 0.7 one solid study; 0.5 limited evidence; 0.3 observational; 0.1 no evidence.

Return [] if no scientific companion planting evidence found.`
}

async function discoverForPlant(crop: { botanicalName: string; name: string }): Promise<ExtractedEntry[]> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: buildPrompt(crop.botanicalName, crop.name) }],
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
  }

  const data = await res.json() as {
    choices: Array<{ message: { content: string } }>
  }

  const content = data.choices[0]?.message?.content ?? ''
  let findings: SonarCompanionFinding[]
  try {
    findings = JSON.parse(stripCodeFences(content)) as SonarCompanionFinding[]
  } catch {
    process.stderr.write(`  Raw response (first 500 chars): ${content.slice(0, 500)}\n`)
    throw new Error(`Failed to parse JSON from sonar response`)
  }

  if (!Array.isArray(findings)) throw new Error('Expected JSON array from sonar')

  const year = new Date().getFullYear()
  const entries: ExtractedEntry[] = []

  for (const f of findings) {
    if (!['COMPANION', 'AVOID', 'NEUTRAL', 'UNKNOWN'].includes(f.type)) continue
    if (typeof f.confidence !== 'number') continue
    if (!['A_TO_B', 'B_TO_A', 'MUTUAL', 'UNKNOWN'].includes(f.direction ?? '')) {
      f.direction = 'UNKNOWN'
    }

    // Prefer botanical name for reliable DB resolution; fall back to common name
    const cropBName = f.botanicalName?.trim() || f.companionPlant
    const citationUrl = f.sourceUrl?.trim() || null

    entries.push({
      cropA: crop.botanicalName,
      cropB: cropBName,
      type: f.type,
      reason: f.reason ?? null,
      direction: f.direction,
      confidence: f.confidence,
      notes: f.notes,
      cropAFound: f.cropFound ?? true,
      cropBFound: true,
      _source: 'sonar-discover' as const,
      title: `Sonar discovery: ${crop.botanicalName} companions`,
      doi: citationUrl ? extractDoi(citationUrl) : null,
      year,
      citationUrl,
    })
  }

  return entries
}

async function main(): Promise<void> {
  if (!API_KEY) {
    console.error('LLM_API_KEY not set. Export LLM_API_KEY (and optionally LLM_BASE_URL, LLM_MODEL).')
    process.exit(1)
  }

  const plantArgs = process.argv.slice(2).filter(a => !a.startsWith('--'))
  if (!plantArgs.length) {
    console.error('Usage: npx tsx discover-companions.ts <plant1> [plant2...]')
    process.exit(1)
  }

  console.log(`Using model: ${MODEL} via ${BASE_URL}`)

  const outputDir = join(process.cwd(), 'data/research')
  mkdirSync(outputDir, { recursive: true })
  const outputPath = join(outputDir, 'extracted.json')

  const existing: ExtractedEntry[] = existsSync(outputPath)
    ? JSON.parse(readFileSync(outputPath, 'utf-8'))
    : []

  // Resume: skip plants already processed by this script
  const done = new Set(
    existing
      .filter(e => e._source === 'sonar-discover')
      .map(e => e.cropA)
  )

  const results: ExtractedEntry[] = [...existing]

  for (let i = 0; i < plantArgs.length; i++) {
    const arg = plantArgs[i]
    const crop = await resolveCrop(arg)

    if (!crop) {
      console.warn(`${i + 1}/${plantArgs.length}: "${arg}" → not found in DB, skipping`)
      continue
    }

    if (done.has(crop.botanicalName)) {
      console.log(`${i + 1}/${plantArgs.length}: ${crop.botanicalName} → already done`)
      continue
    }

    try {
      const entries = await discoverForPlant(crop)
      const kept = entries.filter(
        e => e.type !== 'UNKNOWN' && e.confidence >= 0.5 && e.cropAFound && e.cropBFound,
      )
      results.push(...kept)

      const unique = new Set(entries.map(e => e.cropB)).size
      console.log(
        `${i + 1}/${plantArgs.length}: ${crop.botanicalName}` +
        ` → ${unique} companions found, ${kept.length} entries kept (${entries.length} total with citations)`,
      )
    } catch (err) {
      console.warn(
        `${i + 1}/${plantArgs.length}: ${crop.botanicalName} → ERROR: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    writeFileSync(outputPath, JSON.stringify(results, null, 2))

    if (i < plantArgs.length - 1) await sleep(RATE_LIMIT_MS)
  }

  console.log(`\nTotal entries in extracted.json: ${results.length}`)
  console.log('Next: npx tsx scripts/research/import.ts')

  await prisma.$disconnect()
}

main().catch(async err => {
  console.error('Discovery failed:', err)
  await prisma.$disconnect()
  process.exit(1)
})
