import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

interface CropPair {
  cropA: string
  cropB: string
}

interface Paper {
  cropA: string
  cropB: string
  paperId: string
  title: string
  abstract: string
  doi: string
  year: number
  source: 'semanticscholar' | 'crossref'
}

interface SemanticScholarPaper {
  paperId: string
  title: string
  abstract?: string
  year?: number
  externalIds?: {
    DOI?: string
  }
}

interface CrossRefWork {
  DOI?: string
  title?: string
  abstract?: string
  'published-print'?: {
    'date-parts': number[][]
  }
  'published-online'?: {
    'date-parts': number[][]
  }
}

const USER_AGENT = 'power2plant-research-bot/1.0'
const RATE_LIMIT_MS = 500

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`)
  return response.json()
}

async function searchSemanticScholar(cropA: string, cropB: string): Promise<SemanticScholarPaper[]> {
  const query = encodeURIComponent(`${cropA} ${cropB} companion planting`)
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${query}&fields=title,abstract,year,externalIds&limit=5`
  try {
    const data = await fetchJson(url) as { data?: SemanticScholarPaper[] }
    return data.data ?? []
  } catch (err) {
    process.stderr.write(`  Semantic Scholar error: ${err instanceof Error ? err.message : String(err)}\n`)
    return []
  }
}

async function searchCrossRef(cropA: string, cropB: string): Promise<CrossRefWork[]> {
  const query = encodeURIComponent(`${cropA} ${cropB} companion planting`)
  const url = `https://api.crossref.org/works?query=${query}&rows=5&filter=has-abstract:true&select=DOI,title,abstract,published-print,published-online`
  try {
    const data = await fetchJson(url) as { message?: { items?: CrossRefWork[] } }
    return data.message?.items ?? []
  } catch (err) {
    process.stderr.write(`  CrossRef error: ${err instanceof Error ? err.message : String(err)}\n`)
    return []
  }
}

function getYearFromCrossRef(work: CrossRefWork): number | undefined {
  const dateParts = work['published-print']?.['date-parts']?.[0] ||
    work['published-online']?.['date-parts']?.[0]
  return dateParts?.[0]
}

async function findPapersForPair(pair: CropPair): Promise<Paper[]> {
  const papers: Paper[] = []
  const seen = new Set<string>()

  // CrossRef first — no key required, more permissive rate limits
  const crWorks = await searchCrossRef(pair.cropA, pair.cropB)
  for (const work of crWorks) {
    const year = getYearFromCrossRef(work)
    if (!work.abstract || !year || year < 1970) continue
    const doi = work.DOI ?? ''
    if (seen.has(doi)) continue
    seen.add(doi)
    papers.push({
      cropA: pair.cropA, cropB: pair.cropB,
      paperId: doi || `crossref-${Date.now()}`,
      title: work.title?.[0] ?? '',
      abstract: work.abstract,
      doi, year, source: 'crossref',
    })
  }

  await sleep(RATE_LIMIT_MS)

  // Semantic Scholar for additional coverage
  const ssPapers = await searchSemanticScholar(pair.cropA, pair.cropB)
  for (const paper of ssPapers) {
    if (!paper.abstract || !paper.year || paper.year < 1970) continue
    const doi = paper.externalIds?.DOI ?? ''
    if (doi && seen.has(doi)) continue
    seen.add(doi || paper.paperId)
    papers.push({
      cropA: pair.cropA, cropB: pair.cropB,
      paperId: paper.paperId,
      title: paper.title,
      abstract: paper.abstract,
      doi, year: paper.year, source: 'semanticscholar',
    })
  }

  return papers
}

async function main(): Promise<void> {
  const inputPath = join(process.cwd(), 'data/research/discovered-pairs.json')
  const outputPath = join(process.cwd(), 'data/research/papers.json')
  
  const pairs: CropPair[] = JSON.parse(readFileSync(inputPath, 'utf-8'))
  const allPapers: Paper[] = []
  
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i]
    const papers = await findPapersForPair(pair)
    allPapers.push(...papers)
    
    console.log(`Pair ${i + 1}/${pairs.length}: ${pair.cropA} + ${pair.cropB} → ${papers.length} papers found`)
    
    // Rate limit
    if (i < pairs.length - 1) {
      await sleep(RATE_LIMIT_MS)
    }
  }
  
  writeFileSync(outputPath, JSON.stringify(allPapers, null, 2))
  console.log(`\nTotal papers saved: ${allPapers.length}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})