import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

type Paper = {
  cropA: string
  cropB: string
  paperId: string
  title: string
  abstract: string
  doi: string
  year: number
  source: string
}

type Extraction = {
  type: 'COMPANION' | 'AVOID' | 'UNKNOWN'
  reason: 'PEST_CONTROL' | 'POLLINATION' | 'NUTRIENT' | 'SHADE' | 'ALLELOPATHY' | 'OTHER' | null
  confidence: number
  notes: string
}

type Extracted = Paper & Extraction

const BASE_URL = process.env.LLM_BASE_URL ?? 'https://openrouter.ai/api/v1'
const MODEL = process.env.LLM_MODEL ?? 'anthropic/claude-haiku-4-5'
const API_KEY = process.env.LLM_API_KEY ?? process.env.OPENROUTER_API_KEY

function buildPrompt(cropA: string, cropB: string, title: string, abstract: string): string {
  return `Given this agricultural research paper abstract about companion planting of ${cropA} and ${cropB}:

Title: ${title}
Abstract: ${abstract}

Extract:
1. type: Does this paper show they are COMPANION (beneficial together), AVOID (harmful together), or UNKNOWN (unclear)?
2. reason: Primary mechanism if known (PEST_CONTROL, POLLINATION, NUTRIENT, SHADE, ALLELOPATHY, OTHER, or null)
3. confidence: 0.0-1.0, how strongly does the abstract support this conclusion?
4. notes: One sentence (max 200 chars) summarizing the finding.

Respond ONLY with valid JSON: {"type": ..., "reason": ..., "confidence": ..., "notes": ...}`
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim()
  if (trimmed.startsWith('```json')) return trimmed.slice(7, -3).trim()
  if (trimmed.startsWith('```')) return trimmed.slice(3, -3).trim()
  return trimmed
}

async function extractFromPaper(paper: Paper): Promise<Extraction | null> {
  const prompt = buildPrompt(paper.cropA, paper.cropB, paper.title, paper.abstract)

  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
    }

    const data = await res.json() as { choices: Array<{ message: { content: string } }> }
    const text = data.choices[0]?.message?.content ?? ''
    const parsed = JSON.parse(stripCodeFences(text)) as Extraction

    if (!['COMPANION', 'AVOID', 'UNKNOWN'].includes(parsed.type)) {
      console.warn(`Invalid type for ${paper.paperId}: ${parsed.type}`)
      return null
    }
    if (parsed.confidence < 0 || parsed.confidence > 1) {
      console.warn(`Invalid confidence for ${paper.paperId}: ${parsed.confidence}`)
      return null
    }

    return parsed
  } catch (err) {
    console.warn(`Failed to extract from ${paper.paperId}:`, err instanceof Error ? err.message : String(err))
    return null
  }
}

async function main(): Promise<void> {
  if (!API_KEY) {
    console.error('LLM_API_KEY not set. Export LLM_API_KEY (and optionally LLM_BASE_URL, LLM_MODEL).')
    process.exit(1)
  }

  console.log(`Using model: ${MODEL} via ${BASE_URL}`)

  const papersPath = join(process.cwd(), 'data/research/papers.json')
  const papers: Paper[] = JSON.parse(readFileSync(papersPath, 'utf-8'))
  const results: Extracted[] = []

  for (let i = 0; i < papers.length; i++) {
    const paper = papers[i]
    const extraction = await extractFromPaper(paper)

    if (extraction && extraction.type !== 'UNKNOWN' && extraction.confidence >= 0.5) {
      results.push({ ...paper, ...extraction })
      console.log(`Paper ${i + 1}/${papers.length}: ${paper.cropA} + ${paper.cropB} → ${extraction.type} (${extraction.confidence})`)
    } else if (extraction) {
      console.log(`Paper ${i + 1}/${papers.length}: ${paper.cropA} + ${paper.cropB} → skipped (${extraction.type}, confidence ${extraction.confidence})`)
    } else {
      console.log(`Paper ${i + 1}/${papers.length}: ${paper.cropA} + ${paper.cropB} → skipped (error)`)
    }

    await new Promise(resolve => setTimeout(resolve, 200))
  }

  const outputPath = join(process.cwd(), 'data/research/extracted.json')
  writeFileSync(outputPath, JSON.stringify(results, null, 2))
  console.log(`Wrote ${results.length} extracted relationships to ${outputPath}`)
}

main().catch(err => {
  console.error('Extraction failed:', err)
  process.exit(1)
})
