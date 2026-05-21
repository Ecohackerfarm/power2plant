import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')

type Paper = {
  cropA: string
  cropB: string
  cropABotanical?: string
  cropBBotanical?: string
  paperId: string
  title: string
  abstract: string
  doi: string
  year: number
  source: string
}

type VerificationResult = {
  paperId: string
  cropA: string
  cropB: string
  cropABotanical?: string
  cropBBotanical?: string
  doi: string | null
  title: string
  year: number
  botanicalNamesFound: string[]
  cropAFound: boolean
  cropBFound: boolean
  suspicious: boolean
  reason: string
}

const BASE_URL = process.env.LLM_BASE_URL ?? 'https://openrouter.ai/api/v1'
const MODEL = process.env.LLM_MODEL ?? 'deepseek/deepseek-chat-v3-5'
const API_KEY = process.env.LLM_API_KEY ?? process.env.OPENROUTER_API_KEY
const CONCURRENCY = parseInt(process.env.CONCURRENCY ?? '5', 10)

function stripCodeFences(text: string): string {
  const trimmed = text.trim()
  if (trimmed.startsWith('```json')) return trimmed.slice(7, -3).trim()
  if (trimmed.startsWith('```')) return trimmed.slice(3, -3).trim()
  return trimmed
}

function buildPrompt(cropA: string, cropB: string, title: string, abstract: string, cropABotanical?: string, cropBBotanical?: string): string {
  const aLabel = cropABotanical ? `"${cropA}" (${cropABotanical})` : `"${cropA}"`
  const bLabel = cropBBotanical ? `"${cropB}" (${cropBBotanical})` : `"${cropB}"`
  return `You are verifying whether a scientific paper is actually about companion planting of ${aLabel} and ${bLabel}.

Title: ${title}
Abstract: ${abstract}

Tasks:
1. List ALL botanical (Latin) names mentioned in the abstract.
2. For each of ${aLabel} and ${bLabel}, determine if the paper is clearly studying that specific plant (match by common name, botanical name, or unambiguous synonym).
3. If the paper studies a different species than expected, note the mismatch.

Respond ONLY with valid JSON:
{
  "botanicalNamesFound": ["string", ...],
  "cropAFound": true|false,
  "cropBFound": true|false,
  "suspicious": true|false,
  "reason": "one sentence — only if suspicious, else empty string"
}`
}

async function verifyPaper(paper: Paper): Promise<VerificationResult> {
  const fallback: VerificationResult = {
    paperId: paper.paperId,
    cropA: paper.cropA,
    cropB: paper.cropB,
    cropABotanical: paper.cropABotanical,
    cropBBotanical: paper.cropBBotanical,
    doi: paper.doi || null,
    title: paper.title,
    year: paper.year,
    botanicalNamesFound: [],
    cropAFound: false,
    cropBFound: false,
    suspicious: true,
    reason: 'LLM call failed',
  }

  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        messages: [{ role: 'user', content: buildPrompt(paper.cropA, paper.cropB, paper.title, paper.abstract, paper.cropABotanical, paper.cropBBotanical) }],
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      console.warn(`HTTP ${res.status} for ${paper.paperId}: ${text.slice(0, 100)}`)
      return fallback
    }

    const data = await res.json() as { choices: Array<{ message: { content: string } }> }
    const raw = data.choices[0]?.message?.content ?? ''
    const parsed = JSON.parse(stripCodeFences(raw)) as {
      botanicalNamesFound: string[]
      cropAFound: boolean
      cropBFound: boolean
      suspicious: boolean
      reason: string
    }

    return {
      paperId: paper.paperId,
      cropA: paper.cropA,
      cropB: paper.cropB,
      cropABotanical: paper.cropABotanical,
      cropBBotanical: paper.cropBBotanical,
      doi: paper.doi || null,
      title: paper.title,
      year: paper.year,
      botanicalNamesFound: parsed.botanicalNamesFound ?? [],
      cropAFound: parsed.cropAFound ?? false,
      cropBFound: parsed.cropBFound ?? false,
      suspicious: parsed.suspicious ?? false,
      reason: parsed.reason ?? '',
    }
  } catch (err) {
    console.warn(`Failed ${paper.paperId}:`, err instanceof Error ? err.message : String(err))
    return fallback
  }
}

async function runPool<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let idx = 0

  async function worker(): Promise<void> {
    while (idx < tasks.length) {
      const i = idx++
      results[i] = await tasks[i]()
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker))
  return results
}

async function main(): Promise<void> {
  if (!API_KEY) {
    console.error('LLM_API_KEY not set.')
    process.exit(1)
  }

  const inputFile = process.argv[2] ?? 'papers.json'
  const inputPath = join(ROOT, 'data/research', inputFile)
  const papers: Paper[] = JSON.parse(readFileSync(inputPath, 'utf-8'))

  console.log(`Verifying ${papers.length} papers (concurrency=${CONCURRENCY}, model=${MODEL})`)

  let done = 0
  const tasks = papers.map(paper => async () => {
    const result = await verifyPaper(paper)
    done++
    const flag = result.suspicious ? ' ⚠' : ''
    console.log(`[${done}/${papers.length}] ${paper.cropA} + ${paper.cropB} | A:${result.cropAFound} B:${result.cropBFound}${flag} — ${paper.title.slice(0, 60)}`)
    return result
  })

  const results = await runPool(tasks, CONCURRENCY)

  const suspicious = results.filter(r => r.suspicious)
  const missingA = results.filter(r => !r.cropAFound)
  const missingB = results.filter(r => !r.cropBFound)

  console.log(`\nSummary:`)
  console.log(`  Total:     ${results.length}`)
  console.log(`  Suspicious: ${suspicious.length}`)
  console.log(`  Missing cropA: ${missingA.length}`)
  console.log(`  Missing cropB: ${missingB.length}`)

  if (suspicious.length > 0) {
    console.log(`\nSuspicious papers:`)
    for (const r of suspicious) {
      const url = r.doi ? `https://doi.org/${r.doi}` : 'no-doi'
      console.log(`  ${r.cropA} + ${r.cropB}: ${r.title.slice(0, 70)}`)
      console.log(`    ${url}`)
      console.log(`    Botanical names found: ${r.botanicalNamesFound.join(', ') || 'none'}`)
      console.log(`    Reason: ${r.reason}`)
    }
  }

  const outputPath = join(ROOT, 'data/research/botanical-verification.json')
  writeFileSync(outputPath, JSON.stringify(results, null, 2))
  console.log(`\nFull results → ${outputPath}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
