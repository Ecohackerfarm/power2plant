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

async function fetchWithRetry(url: string, maxRetries = 5): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT }
    })
    if (response.ok) {
      return response
    }
    if (response.status === 429) {
      const waitTime = (attempt + 1) * 2000
      console.log(`Rate limited, waiting ${waitTime}ms...`)
      await sleep(waitTime)
      continue
    }
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }
  throw new Error('Max retries exceeded')
}

async function searchSemanticScholar(cropA: string, cropB: string): Promise<SemanticScholarPaper[]> {
  const query = encodeURIComponent(`${cropA} ${cropB} companion planting`)
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${query}&fields=title,abstract,year,externalIds&limit=5`
  
  const response = await fetchWithRetry(url)
  const data = await response.json()
  return data.data || []
}

async function searchCrossRef(cropA: string, cropB: string): Promise<CrossRefWork[]> {
  const query = encodeURIComponent(`${cropA} ${cropB} companion planting`)
  const url = `https://api.crossref.org/works?query=${query}&rows=3`
  
  const response = await fetchWithRetry(url)
  const data = await response.json()
  return data.message?.items || []
}

function getYearFromCrossRef(work: CrossRefWork): number | undefined {
  const dateParts = work['published-print']?.['date-parts']?.[0] || 
                   work['published-online']?.['date-parts']?.[0]
  return dateParts?.[0]
}

async function findPapersForPair(pair: CropPair): Promise<Paper[]> {
  const papers: Paper[] = []
  
  // Search Semantic Scholar
  const ssPapers = await searchSemanticScholar(pair.cropA, pair.cropB)
  
  for (const paper of ssPapers) {
    if (!paper.abstract || !paper.year || paper.year < 1970) {
      continue
    }
    
    papers.push({
      cropA: pair.cropA,
      cropB: pair.cropB,
      paperId: paper.paperId,
      title: paper.title,
      abstract: paper.abstract,
      doi: paper.externalIds?.DOI || '',
      year: paper.year,
      source: 'semanticscholar'
    })
  }
  
  // For papers missing abstract, try CrossRef fallback
  const papersNeedingAbstract = ssPapers.filter(p => !p.abstract || !p.year || p.year < 1970)
  
  if (papersNeedingAbstract.length > 0) {
    const crWorks = await searchCrossRef(pair.cropA, pair.cropB)
    
    for (const work of crWorks) {
      const year = getYearFromCrossRef(work)
      if (!work.abstract || !year || year < 1970) {
        continue
      }
      
      // Check if we already have this paper
      const doi = work.DOI || ''
      if (papers.some(p => p.doi === doi)) {
        continue
      }
      
      papers.push({
        cropA: pair.cropA,
        cropB: pair.cropB,
        paperId: doi || `crossref-${Date.now()}`,
        title: work.title?.[0] || '',
        abstract: work.abstract,
        doi: doi,
        year: year,
        source: 'crossref'
      })
    }
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