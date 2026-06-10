import { RelationshipReason, ConfidenceLevel } from '@prisma/client'

export type RawDirection = 'A_TO_B' | 'B_TO_A' | 'MUTUAL' | 'UNKNOWN'

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
  genusWide?: boolean
}

export interface AggregatedPair {
  cropA: string
  cropB: string
  type: 'COMPANION' | 'AVOID' | 'NEUTRAL'
  reason: string | null
  notes: string
  genusWide: boolean
  papers: Array<{
    doi: string | null
    citationUrl?: string | null
    title: string
    year: number
    position: 'COMPANION' | 'AVOID' | 'NEUTRAL'
    reason: string | null
    direction?: RawDirection
    extractedCropA: string
  }>
}

export function extractDoi(url: string): string | null {
  const m = url.match(/(?:doi\.org|dx\.doi\.org)\/(.+)/)
  return m ? decodeURIComponent(m[1]) : null
}

export function stripCodeFences(text: string): string {
  const t = text.trim()
  if (t.startsWith('```json')) return t.slice(7, -3).trim()
  if (t.startsWith('```')) return t.slice(3, -3).trim()
  return t
}

export function buildPrompt(cropA: string, cropB: string): string {
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
  "sourceUrl": "<direct URL or DOI URL of the best supporting study, e.g. https://doi.org/10.xxxx/xxxx — null if not found>",
  "genusWide": <true if the best evidence is for a related species within the same genus AND the mechanism (chemical volatiles, root exudates, allelopathy) is likely shared across the whole genus — false otherwise>,
  "actualSpeciesA": "<if genusWide true: exact botanical name of the ${cropA}-side species actually studied — null otherwise>",
  "actualSpeciesB": "<if genusWide true: exact botanical name of the ${cropB}-side species actually studied — null otherwise>"
}

direction: A_TO_B = ${cropA} benefits ${cropB}; B_TO_A = ${cropB} benefits ${cropA}; MUTUAL = both benefit.
confidence: 0.9+ multiple peer-reviewed studies confirming; 0.7 one solid study; 0.5 limited evidence; 0.3 observational only; 0.1 no evidence found.
genusWide example: asked for Allium cepa, best evidence is for Allium fistulosum via sulfur volatiles → genusWide: true, actualSpeciesA: "Allium fistulosum".`
}

export function mapDirection(
  raw: RawDirection | undefined,
  extractedCropAId: string,
  storedCropAId: string,
): 'MUTUAL' | 'ONE_WAY' | null {
  if (!raw || raw === 'UNKNOWN') return null
  if (raw === 'MUTUAL') return 'MUTUAL'
  const flipped = extractedCropAId !== storedCropAId
  const effectiveDir = flipped ? (raw === 'A_TO_B' ? 'B_TO_A' : 'A_TO_B') : raw
  return effectiveDir === 'A_TO_B' || effectiveDir === 'B_TO_A' ? 'ONE_WAY' : null
}

const VALID_REASONS = new Set<string>(Object.values(RelationshipReason))

export function validateReason(value: string | null | undefined): RelationshipReason | null {
  if (value == null) return null
  if (VALID_REASONS.has(value)) return value as RelationshipReason
  return null
}

export function aggregateByPair(relationships: ExtractedEntry[]): AggregatedPair[] {
  const pairMap = new Map<string, { companion: number; avoid: number; neutral: number; entries: ExtractedEntry[] }>()
  for (const entry of relationships) {
    if (entry.type === 'UNKNOWN') continue
    const key = [entry.cropA, entry.cropB].sort().join('|')
    if (!pairMap.has(key)) pairMap.set(key, { companion: 0, avoid: 0, neutral: 0, entries: [] })
    const agg = pairMap.get(key)!
    agg.entries.push(entry)
    if (entry.type === 'COMPANION') agg.companion += entry.confidence
    else if (entry.type === 'AVOID') agg.avoid += entry.confidence
    else if (entry.type === 'NEUTRAL') agg.neutral += entry.confidence
  }
  const results: AggregatedPair[] = []
  for (const [, agg] of pairMap) {
    const max = Math.max(agg.companion, agg.avoid, agg.neutral)
    const winningType: 'COMPANION' | 'AVOID' | 'NEUTRAL' =
      agg.companion === max ? 'COMPANION' : agg.avoid === max ? 'AVOID' : 'NEUTRAL'
    const winningEntries = agg.entries.filter(e => e.type === winningType)
    const best = winningEntries.reduce((a, b) => a.confidence >= b.confidence ? a : b)
    results.push({
      cropA: agg.entries[0].cropA,
      cropB: agg.entries[0].cropB,
      type: winningType,
      reason: best.reason,
      notes: best.notes,
      genusWide: agg.entries.some(e => e.genusWide),
      papers: agg.entries.map(e => ({
        doi: e.doi,
        citationUrl: e.citationUrl,
        title: e.title,
        year: e.year,
        position: e.type as 'COMPANION' | 'AVOID' | 'NEUTRAL',
        reason: e.reason,
        direction: e.direction as RawDirection,
        extractedCropA: e.cropA,
      })),
    })
  }
  return results
}

export const CONFIDENCE_WEIGHTS: Record<ConfidenceLevel, number> = {
  ANECDOTAL: 0.25,
  TRADITIONAL: 0.5,
  OBSERVED: 0.75,
  PEER_REVIEWED: 1.0,
}

export function computeRelationshipConfidence(levels: ConfidenceLevel[]): number {
  if (levels.length === 0) return 0.25
  return Math.max(...levels.map(l => CONFIDENCE_WEIGHTS[l]))
}
