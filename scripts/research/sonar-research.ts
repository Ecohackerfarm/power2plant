/**
 * Default research script. Uses perplexity/sonar-deep-research via OpenRouter.
 * For each pair, queries sonar once → synthesized finding + citations.
 * Outputs extracted.json in the same format as extract.ts (legacy path).
 *
 * Env vars:
 *   LLM_API_KEY / OPENROUTER_API_KEY  (required)
 *   LLM_BASE_URL                       (default: https://openrouter.ai/api/v1)
 *   LLM_MODEL                          (default: perplexity/sonar-deep-research)
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

interface CropPair {
  cropA: string
  cropB: string
}

interface SonarFinding {
  type: 'COMPANION' | 'AVOID' | 'NEUTRAL' | 'UNKNOWN'
  reason: 'PEST_CONTROL' | 'POLLINATION' | 'NUTRIENT' | 'SHADE' | 'ALLELOPATHY' | 'OTHER' | null
  direction: 'A_TO_B' | 'B_TO_A' | 'MUTUAL' | 'UNKNOWN'
  confidence: number
  notes: string
  cropAFound: boolean
  cropBFound: boolean
  sourceUrl: string | null
}

export interface ExtractedEntry {
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
  _source: 'sonar'
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

function buildPrompt(cropA: string, cropB: string): string {
  return `Research the scientific evidence for companion planting interactions between ${cropA} and ${cropB}. Find peer-reviewed agricultural studies, field trials, and experimental research.

Respond ONLY with a JSON object — no markdown, no explanation:
{
  "type": "COMPANION" | "AVOID" | "NEUTRAL" | "UNKNOWN",
  "reason": "PEST_CONTROL" | "POLLINATION" | "NUTRIENT" | "SHADE" | "ALLELOPATHY" | "OTHER" | null,
  "direction": "A_TO_B" | "B_TO_A" | "MUTUAL" | "UNKNOWN",
  "confidence": <float 0.0–1.0>,
  "notes": "<one sentence ≤200 chars summarising the scientific finding>",
  "cropAFound": <true if studies specifically research ${cropA}>,
  "cropBFound": <true if studies specifically research ${cropB}>,
  "sourceUrl": "<direct URL or DOI URL of the best supporting study, e.g. https://doi.org/10.xxxx/xxxx — null if not found>"
}

direction: A_TO_B = ${cropA} benefits ${cropB}; B_TO_A = ${cropB} benefits ${cropA}; MUTUAL = both benefit.
confidence: 0.9+ multiple peer-reviewed studies confirming; 0.7 one solid study; 0.5 limited evidence; 0.3 observational only; 0.1 no evidence found.`
}

async function researchPair(pair: CropPair): Promise<ExtractedEntry[]> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: buildPrompt(pair.cropA, pair.cropB) }],
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

  const citationUrl = finding.sourceUrl?.trim() || null
  const year = new Date().getFullYear()

  return [{
    cropA: pair.cropA,
    cropB: pair.cropB,
    type: finding.type,
    reason: finding.reason,
    direction: finding.direction,
    confidence: finding.confidence,
    notes: finding.notes,
    cropAFound: finding.cropAFound ?? true,
    cropBFound: finding.cropBFound ?? true,
    _source: 'sonar' as const,
    title: `Sonar synthesis: ${pair.cropA} + ${pair.cropB}`,
    doi: citationUrl ? extractDoi(citationUrl) : null,
    year,
    citationUrl,
  }]
}

async function main(): Promise<void> {
  if (!API_KEY) {
    console.error('LLM_API_KEY not set. Export LLM_API_KEY (and optionally LLM_BASE_URL, LLM_MODEL).')
    process.exit(1)
  }

  console.log(`Using model: ${MODEL} via ${BASE_URL}`)

  const inputPath = join(process.cwd(), 'data/research/discovered-pairs.json')
  const outputPath = join(process.cwd(), 'data/research/extracted.json')

  const pairs: CropPair[] = JSON.parse(readFileSync(inputPath, 'utf-8'))

  // Resume: skip pairs already processed by this script
  const existing: ExtractedEntry[] = existsSync(outputPath)
    ? JSON.parse(readFileSync(outputPath, 'utf-8'))
    : []

  const done = new Set(
    existing
      .filter(e => (e as ExtractedEntry)._source === 'sonar')
      .map(e => `${e.cropA}|${e.cropB}`)
  )

  const results: ExtractedEntry[] = [...existing]

  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i]
    const key = `${pair.cropA}|${pair.cropB}`

    if (done.has(key)) {
      console.log(`${i + 1}/${pairs.length}: ${pair.cropA} + ${pair.cropB} → already done`)
      continue
    }

    try {
      const entries = await researchPair(pair)
      const kept = entries.filter(
        e => e.type !== 'UNKNOWN' && e.confidence >= 0.5 && e.cropAFound && e.cropBFound,
      )
      results.push(...kept)
      const summary = entries[0]
      console.log(
        `${i + 1}/${pairs.length}: ${pair.cropA} + ${pair.cropB}` +
        ` → ${summary?.type ?? 'UNKNOWN'} conf=${summary?.confidence ?? 0} citations=${entries[0]?.citationUrl ? entries.length : 0} kept=${kept.length}`,
      )
    } catch (err) {
      console.warn(
        `${i + 1}/${pairs.length}: ${pair.cropA} + ${pair.cropB} → ERROR: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    // Incremental save so a crash doesn't lose progress
    writeFileSync(outputPath, JSON.stringify(results, null, 2))

    if (i < pairs.length - 1) await sleep(RATE_LIMIT_MS)
  }

  console.log(`\nTotal entries in extracted.json: ${results.length}`)
}

main().catch(err => {
  console.error('Research failed:', err)
  process.exit(1)
})
