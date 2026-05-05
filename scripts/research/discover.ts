import { writeFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'

const USER_AGENT = 'power2plant-research-bot/1.0'
const RATE_LIMIT_MS = 500

interface CropPair {
  cropA: string
  cropB: string
}

function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function makePair(cropA: string, cropB: string): CropPair {
  const a = normalizeName(cropA)
  const b = normalizeName(cropB)
  const [first, second] = [a, b].sort()
  return { cropA: first, cropB: second }
}

async function fetchWithDelay(url: string): Promise<string> {
  await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS))
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.text()
}

async function extractPairsFromIndex(html: string): Promise<CropPair[]> {
  const pairs = new Map<string, CropPair>()

  const pairRegex = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*[+&]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g
  let match: RegExpExecArray | null
  while ((match = pairRegex.exec(html)) !== null) {
    const pair = makePair(match[1], match[2])
    const key = `${pair.cropA}|${pair.cropB}`
    pairs.set(key, pair)
  }

  const tableRowRegex = /<td><a[^>]*>([^<]+)<\/a><\/td>\s*<td>([^<]+)<\/td>\s*<td>([^<]+)<\/td>/g
  while ((match = tableRowRegex.exec(html)) !== null) {
    const crop = match[1].trim()
    const companions = match[2].split(/,\s*/)
    const antagonists = match[3].split(/,\s*/)

    for (const comp of companions) {
      const cleanComp = comp.replace(/\s*\([^)]+\)/, '').trim()
      if (cleanComp && cleanComp !== '—' && cleanComp !== '') {
        const pair = makePair(crop, cleanComp)
        const key = `${pair.cropA}|${pair.cropB}`
        pairs.set(key, pair)
      }
    }

    for (const antag of antagonists) {
      const cleanAntag = antag.replace(/\s*\([^)]+\)/, '').trim()
      if (cleanAntag && cleanAntag !== '—' && cleanAntag !== '') {
        const pair = makePair(crop, cleanAntag)
        const key = `${pair.cropA}|${pair.cropB}`
        pairs.set(key, pair)
      }
    }
  }

  return Array.from(pairs.values())
}

async function main(): Promise<void> {
  const indexUrl = 'https://plantanywhere.net/companion-planting'
  process.stderr.write('Fetching index page...\n')

  const html = await fetchWithDelay(indexUrl)
  const pairs = await extractPairsFromIndex(html)

  process.stderr.write(`Discovered ${pairs.length} pairs\n`)

  const outputDir = resolve(process.cwd(), 'data/research')
  mkdirSync(outputDir, { recursive: true })

  const outputPath = resolve(outputDir, 'discovered-pairs.json')
  writeFileSync(outputPath, JSON.stringify(pairs, null, 2))
  process.stderr.write(`Wrote ${pairs.length} pairs to ${outputPath}\n`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})