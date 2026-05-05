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

function makePair(cropA: string, cropB: string): CropPair | null {
  const a = normalizeName(cropA)
  const b = normalizeName(cropB)
  if (a.includes('Family') || b.includes('Family')) return null
  const [first, second] = [a, b].sort()
  return { cropA: first, cropB: second }
}

const NON_CROP_WORDS = new Set(['Bush', 'Pole', 'Tall', 'Almost', 'Family', 'Everything', 'Crops', 'Brassicas', 'Tall Crops', 'Almost Everything', 'Bean Bush Pole', 'Aromatic Herbs', 'Compete For Similar Growing Conditions', 'Pole Bean'])

function isLikelyCrop(name: string): boolean {
  if (!name || name.length === 0) return false
  if (NON_CROP_WORDS.has(name)) return false
  if (name.includes('Family')) return false
  if (name.includes('(') || name.includes(')')) return false
  if (name === name.toUpperCase() && name.length > 1) return false
  return true
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
    const a = normalizeName(match[1])
    const b = normalizeName(match[2])
    if (!NON_CROP_WORDS.has(a) && !NON_CROP_WORDS.has(b) && !a.includes('Family') && !b.includes('Family')) {
      const pair = makePair(match[1], match[2])
      if (pair) {
        const key = `${pair.cropA}|${pair.cropB}`
        pairs.set(key, pair)
      }
    }
  }

  const tableRowRegex = /<td><a[^>]*>([^<]+)<\/a><\/td>\s*<td>([^<]+)<\/td>\s*<td>([^<]+)<\/td>/g
  while ((match = tableRowRegex.exec(html)) !== null) {
    const crop = normalizeName(match[1].trim().replace(/\s*\([^)]+\)/, ''))
    const companions = match[2].split(/,\s*/)
    const antagonists = match[3].split(/,\s*/)

    for (const comp of companions) {
      let names = comp.split(/[(),]/).map(s => normalizeName(s.trim())).filter(isLikelyCrop)
      names = names.filter(n => !n.includes('&'))
      for (const cleanComp of names) {
        const pair = makePair(crop, cleanComp)
        if (pair) {
          const key = `${pair.cropA}|${pair.cropB}`
          pairs.set(key, pair)
        }
      }
    }

    for (const antag of antagonists) {
      let names = antag.split(/[(),]/).map(s => normalizeName(s.trim())).filter(isLikelyCrop)
      names = names.filter(n => !n.includes('&'))
      for (const cleanAntag of names) {
        const pair = makePair(crop, cleanAntag)
        if (pair) {
          const key = `${pair.cropA}|${pair.cropB}`
          pairs.set(key, pair)
        }
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