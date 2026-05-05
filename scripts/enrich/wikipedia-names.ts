import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const USER_AGENT = 'power2plant/0.1 (https://github.com/Ecohackerfarm/power2plant)'
const RATE_LIMIT_MS = 1100

interface WikipediaSummary {
  title: string
  type: string
  titles?: {
    normalized?: string
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchWikipediaSummary(botanicalName: string): Promise<WikipediaSummary | null> {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(botanicalName)}`
  try {
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
    if (!response.ok) return null
    return await response.json() as WikipediaSummary
  } catch {
    return null
  }
}

function extractCommonNames(summary: WikipediaSummary, botanicalName: string): string[] {
  const names: string[] = []
  const normalized = summary.titles?.normalized?.toLowerCase()
  const title = summary.title.toLowerCase()
  const botanicalLower = botanicalName.toLowerCase()

  // Skip disambiguation pages
  if (summary.type === 'disambiguation') return names

  // Add title if it differs from botanical name (case-insensitive)
  if (title !== botanicalLower && !normalized) {
    names.push(summary.title)
  }

  // Add normalized title if available and different
  if (normalized && normalized !== botanicalLower && normalized !== title) {
    names.push(summary.titles!.normalized!)
  }

  return names.slice(0, 3)
}

function mergeNames(existing: string[], newNames: string[]): string[] {
  const lowerExisting = new Set(existing.map(n => n.toLowerCase()))
  const merged = [...existing]
  for (const name of newNames) {
    if (!lowerExisting.has(name.toLowerCase())) {
      merged.push(name)
      lowerExisting.add(name.toLowerCase())
    }
  }
  return merged
}

async function main(): Promise<void> {
  const crops = await prisma.crop.findMany()

  const filtered = crops.filter(c => !c.commonNames || c.commonNames.length < 2)
  console.log(`Found ${filtered.length} crops to process`)

  for (let i = 0; i < filtered.length; i++) {
    const crop = filtered[i]
    if (!crop.botanicalName) continue

    const summary = await fetchWikipediaSummary(crop.botanicalName)
    if (!summary) {
      console.log(`Crop ${i + 1}/${filtered.length}: ${crop.botanicalName} -> no Wikipedia page`)
      await sleep(RATE_LIMIT_MS)
      continue
    }

    const newNames = extractCommonNames(summary, crop.botanicalName)
    if (newNames.length === 0) {
      console.log(`Crop ${i + 1}/${filtered.length}: ${crop.botanicalName} -> skipped (disambiguation or no names)`)
      await sleep(RATE_LIMIT_MS)
      continue
    }

    const merged = mergeNames(crop.commonNames, newNames)
    await prisma.crop.update({
      where: { id: crop.id },
      data: { commonNames: merged }
    })

    console.log(`Crop ${i + 1}/${filtered.length}: ${crop.botanicalName} -> added ${newNames.length} names`)
    await sleep(RATE_LIMIT_MS)
  }

  await prisma.$disconnect()
  console.log('Done!')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})