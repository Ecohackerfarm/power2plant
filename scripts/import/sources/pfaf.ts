import { PrismaClient } from '@prisma/client'
import { load } from 'cheerio'
import type { Importer, RawCrop, RawRelationship } from '../types'
import { ConfidenceLevel, Direction, RelationshipType, SourceType } from '@prisma/client'
import { resolveCommonName } from '../normalize'

const RATE_LIMIT_MS = 2000  // 2s between requests — PFAF is a small charity site
const BASE_URL = 'https://pfaf.org/user/Plant.aspx'

// RHS hardiness H-rating → approximate minimum survivable °C
const RHS_TO_MIN_C: Record<number, number> = {
  1: 15,   // H1a/H1b/H1c — heated greenhouse
  2: 1,    // H2 — cool greenhouse
  3: -5,   // H3 — half-hardy
  4: -10,  // H4 — hardy
  5: -15,  // H5 — very hardy
  6: -20,  // H6 — very hardy
  7: -25,  // H7 — extremely hardy
}

async function fetchPage(botanicalName: string): Promise<string | null> {
  const url = `${BASE_URL}?LatinName=${encodeURIComponent(botanicalName)}`
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'power2plant/0.1 (non-commercial research; https://github.com/power2plant)',
      },
    })
    if (res.status === 404) return null
    if (!res.ok) {
      console.warn(`[PFAF] HTTP ${res.status} for ${botanicalName}`)
      return null
    }
    return res.text()
  } catch (err) {
    console.warn(`[PFAF] Fetch error for ${botanicalName}:`, err)
    return null
  }
}

function parseMinTempC(html: string): number | null {
  const $ = load(html)
  // Look for RHS hardiness rating like "H4" in the plant info table
  const text = $('body').text()
  const match = text.match(/\bH([1-7])[a-c]?\b/)
  if (!match) return null
  const level = parseInt(match[1], 10)
  return RHS_TO_MIN_C[level] ?? null
}

function parseCompanions(html: string): { companions: string[]; avoid: string[] } {
  const $ = load(html)

  const split = (text: string): string[] =>
    text
      .split(/[,;]/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && s.toLowerCase() !== 'none')

  // PFAF companion data is in table rows with specific labels
  let companionText = ''
  let avoidText = ''

  // Scans all table rows for "companion"/"avoid" labels.
  // Fragile against PFAF page layout changes — refine selector against live pages before production use.
  $('tr').each((_, row) => {
    const cells = $(row).find('td')
    if (cells.length >= 2) {
      const label = $(cells[0]).text().toLowerCase().trim()
      const value = $(cells[1]).text().trim()
      if (label.includes('companion')) companionText = value
      if (label.includes('avoid')) avoidText = value
    }
  })

  return {
    companions: split(companionText),
    avoid: split(avoidText),
  }
}

// NOTE: fetchCrops and fetchRelationships each independently fetch the same
// PFAF pages. When the orchestrator calls both in sequence every plant is
// fetched twice. This is a known inefficiency that is acceptable for MVP;
// a future optimisation would cache pages to disk between the two passes.

export const pfafImporter: Importer = {
  source: SourceType.PFAF,

  async *fetchCrops(): AsyncIterable<RawCrop> {
    const prisma = new PrismaClient()
    let crops: { botanicalName: string }[]
    try {
      crops = await prisma.crop.findMany({ select: { botanicalName: true } })
    } finally {
      await prisma.$disconnect()
    }

    for (const { botanicalName } of crops) {
      const html = await fetchPage(botanicalName)
      if (!html) {
        await new Promise(r => setTimeout(r, RATE_LIMIT_MS))
        continue
      }

      const minTempC = parseMinTempC(html)
      if (minTempC !== null) {
        yield {
          botanicalName,
          name: botanicalName,
          minTempC,
          rawData: { source: 'pfaf', scraped: true },
        }
      }

      await new Promise(r => setTimeout(r, RATE_LIMIT_MS))
    }
  },

  async *fetchRelationships(): AsyncIterable<RawRelationship> {
    const prisma = new PrismaClient()
    let crops: { botanicalName: string }[]
    try {
      crops = await prisma.crop.findMany({ select: { botanicalName: true } })
    } finally {
      await prisma.$disconnect()
    }

    for (const { botanicalName } of crops) {
      const html = await fetchPage(botanicalName)
      if (!html) {
        await new Promise(r => setTimeout(r, RATE_LIMIT_MS))
        continue
      }

      const { companions, avoid } = parseCompanions(html)
      const url = `${BASE_URL}?LatinName=${encodeURIComponent(botanicalName)}`

      for (const name of companions) {
        const resolved = resolveCommonName(name) ?? name
        yield {
          cropNameA: botanicalName,
          cropNameB: resolved,
          type: RelationshipType.COMPANION,
          direction: Direction.MUTUAL,
          confidence: ConfidenceLevel.TRADITIONAL,
          url,
        }
      }

      for (const name of avoid) {
        const resolved = resolveCommonName(name) ?? name
        yield {
          cropNameA: botanicalName,
          cropNameB: resolved,
          type: RelationshipType.AVOID,
          direction: Direction.MUTUAL,
          confidence: ConfidenceLevel.TRADITIONAL,
          url,
        }
      }

      await new Promise(r => setTimeout(r, RATE_LIMIT_MS))
    }
  },
}
