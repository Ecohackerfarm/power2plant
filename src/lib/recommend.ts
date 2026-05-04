export type CropInput = {
  id: string
  name: string
  botanicalName: string
  minTempC: number | null
  commonNames: string[]
}

function toTitleCase(str: string): string {
  return str.replace(/\b\w/g, c => c.toUpperCase())
}

export function getDisplayName(crop: Pick<CropInput, 'name' | 'botanicalName' | 'commonNames'>): string {
  const raw = crop.name !== crop.botanicalName ? crop.name : (crop.commonNames[0] ?? crop.name)
  return toTitleCase(raw)
}

export type RelationshipInput = {
  cropAId: string
  cropBId: string
  type: 'COMPANION' | 'AVOID' | 'ATTRACTS' | 'REPELS' | 'NURSE' | 'TRAP_CROP'
  confidence: number
  reason?: string | null
  notes?: string | null
}

export type BedHint = {
  cropAId: string
  cropBId: string
  pairLabel: string       // "Tomato & Basil"
  details: string         // "nurse plant · pest control"  (no confidence)
  confidenceLevel: string // "traditional"
}

export type BedResult = {
  index: number
  crops: CropInput[]
  hints: BedHint[]
}

export type RecommendResult = {
  beds: BedResult[]
  overflow: CropInput[]
  conflicts: Array<{ a: CropInput; b: CropInput }>
  duplicatedCropIds: string[]
}

const REASON_LABELS: Record<string, string> = {
  PEST_CONTROL: 'pest control',
  POLLINATION: 'pollination',
  NUTRIENT: 'nutrient sharing',
  SHADE: 'shade benefit',
  ALLELOPATHY: 'natural repellent',
}

// Only non-COMPANION types get a label — COMPANION is implied by sharing a bed
const TYPE_LABELS: Partial<Record<string, string>> = {
  ATTRACTS: 'attracts beneficials',
  REPELS: 'repels pests',
  NURSE: 'nurse plant',
  TRAP_CROP: 'trap crop',
}

// Thresholds are midpoints between CONFIDENCE_WEIGHTS (0.25/0.5/0.75/1.0) so each
// source level maps to exactly one label: ANECDOTAL→anecdotal, TRADITIONAL→traditional,
// OBSERVED→observed, PEER_REVIEWED→peer-reviewed.
const CONFIDENCE_THRESHOLDS: [number, string][] = [
  [0.875, 'peer-reviewed'],
  [0.625, 'observed'],
  [0.375, 'traditional'],
  [0, 'anecdotal'],
]

export function confidenceLabel(confidence: number): string {
  return CONFIDENCE_THRESHOLDS.find(([thresh]) => confidence >= thresh)?.[1] ?? 'anecdotal'
}

function buildHint(rel: RelationshipInput): { details: string; confidenceLevel: string } {
  const parts: string[] = []
  const typeLabel = TYPE_LABELS[rel.type]
  if (typeLabel) parts.push(typeLabel)
  const reasonLabel = rel.reason ? REASON_LABELS[rel.reason] : null
  if (reasonLabel) parts.push(reasonLabel)
  return { details: parts.join(' · '), confidenceLevel: confidenceLabel(rel.confidence) }
}

const POSITIVE_TYPES = new Set(['COMPANION', 'ATTRACTS', 'NURSE', 'TRAP_CROP'])
const NEGATIVE_TYPES = new Set(['AVOID', 'REPELS'])

function pairKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`
}

export function recommend(
  crops: CropInput[],
  relationships: RelationshipInput[],
  bedCount: number,
  bedCapacity: number,
  userMinTempC: number,
  existingBeds?: string[][],
): RecommendResult {
  // 1. Filter by hardiness: remove crops the zone is too cold for
  const eligible = crops.filter(
    c => c.minTempC === null || c.minTempC <= userMinTempC,
  )

  // 2. Build weight map: canonical pair key → net affinity
  const weights = new Map<string, number>()
  for (const r of relationships) {
    const key = pairKey(r.cropAId, r.cropBId)
    const delta = POSITIVE_TYPES.has(r.type)
      ? r.confidence
      : NEGATIVE_TYPES.has(r.type)
        ? -r.confidence
        : 0
    weights.set(key, (weights.get(key) ?? 0) + delta)
  }

  // Relationship lookup by canonical pair key (for hint generation)
  const relMap = new Map<string, RelationshipInput>()
  for (const r of relationships) {
    relMap.set(pairKey(r.cropAId, r.cropBId), r)
  }

  function getWeight(idA: string, idB: string): number {
    return weights.get(pairKey(idA, idB)) ?? 0
  }

  // 3. Sort by total outgoing affinity (most social first)
  const sorted = [...eligible].sort((a, b) => {
    const scoreA = eligible.reduce(
      (sum, c) => (c.id !== a.id ? sum + getWeight(a.id, c.id) : sum),
      0,
    )
    const scoreB = eligible.reduce(
      (sum, c) => (c.id !== b.id ? sum + getWeight(b.id, c.id) : sum),
      0,
    )
    return scoreB - scoreA
  })

  // 4. Greedy placement with three-tier priority:
  //    (a) positive-affinity bed — companion benefit exists, cluster together
  //    (b) spread bed — no benefit, prefer emptiest bed to avoid unnecessary crowding
  //    (c) conflict fallback — only when every bed has a conflict (e.g. single-bed layout)
  const lockedIds = new Set<string>()
  const beds: CropInput[][] = Array.from({ length: bedCount }, (_, i) => {
    if (!existingBeds || !existingBeds[i]) return []
    const bedCrops = existingBeds[i].flatMap(id => {
      const found = crops.find(c => c.id === id)
      if (found) lockedIds.add(found.id)
      return found ? [found] : []
    })
    return bedCrops
  })
  const overflow: CropInput[] = []

  for (const crop of sorted) {
    if (beds.some(bed => bed.some(c => c.id === crop.id))) continue
    let affinityBed = -1; let affinityScore = -Infinity
    let spreadBed = -1;   let spreadScore = -Infinity   // -bed.length (prefer empty)
    let conflictBed = -1; let conflictScore = -Infinity

    for (let i = 0; i < beds.length; i++) {
      if (beds[i].length >= bedCapacity) continue
      const score = beds[i].reduce((sum, c) => sum + getWeight(crop.id, c.id), 0)
      const hasConflict = beds[i].some(c => getWeight(crop.id, c.id) < 0)
      if (!hasConflict) {
        if (score > 0) {
          if (score > affinityScore || affinityBed === -1) { affinityScore = score; affinityBed = i }
        } else {
          const s = -beds[i].length
          if (s > spreadScore || spreadBed === -1) { spreadScore = s; spreadBed = i }
        }
      } else {
        if (score > conflictScore || conflictBed === -1) { conflictScore = score; conflictBed = i }
      }
    }

    const chosen = affinityBed !== -1 ? affinityBed : spreadBed !== -1 ? spreadBed : conflictBed
    if (chosen === -1) overflow.push(crop)
    else beds[chosen].push(crop)
  }

  // 5. Duplication pass — copy a crop into every additional bed where it adds
  //    net positive affinity without introducing a conflict
  const placedSet = new Set(beds.flat().map(c => c.id))
  const duplicatedIds = new Set<string>()
  for (const crop of sorted) {
    if (!placedSet.has(crop.id)) continue
    if (lockedIds.has(crop.id)) continue
    for (let i = 0; i < beds.length; i++) {
      if (beds[i].some(c => c.id === crop.id)) continue
      if (beds[i].length >= bedCapacity) continue
      if (beds[i].some(c => getWeight(crop.id, c.id) < 0)) continue
      const score = beds[i].reduce((sum, c) => sum + getWeight(crop.id, c.id), 0)
      if (score > 0) {
        beds[i].push(crop)
        duplicatedIds.add(crop.id)
      }
    }
  }

  // 6. Collect conflicts (safety net — only fires when forced by capacity)
  const conflicts: Array<{ a: CropInput; b: CropInput }> = []
  for (const bed of beds) {
    for (let i = 0; i < bed.length; i++) {
      for (let j = i + 1; j < bed.length; j++) {
        if (getWeight(bed[i].id, bed[j].id) < 0) {
          conflicts.push({ a: bed[i], b: bed[j] })
        }
      }
    }
  }

  // 7. Generate per-bed hints from positive companion pairs
  const bedResults: BedResult[] = beds.map((bedCrops, index) => {
    const hints: BedHint[] = []
    for (let i = 0; i < bedCrops.length; i++) {
      for (let j = i + 1; j < bedCrops.length; j++) {
        const a = bedCrops[i]
        const b = bedCrops[j]
        if (getWeight(a.id, b.id) > 0) {
          const rel = relMap.get(pairKey(a.id, b.id))
          if (rel) {
            const { details, confidenceLevel } = buildHint(rel)
            hints.push({
              cropAId: a.id < b.id ? a.id : b.id,
              cropBId: a.id < b.id ? b.id : a.id,
              pairLabel: `${getDisplayName(a)} & ${getDisplayName(b)}`,
              details,
              confidenceLevel,
            })
          }
        }
      }
    }
    return { index, crops: bedCrops, hints }
  })

  return { beds: bedResults, overflow, conflicts, duplicatedCropIds: [...duplicatedIds] }
}

export function minTempCToZoneName(minTempC: number): string {
  if (minTempC < -45.6) return 'Zone 1'
  if (minTempC < -40.0) return 'Zone 2'
  if (minTempC < -34.4) return 'Zone 3'
  if (minTempC < -28.9) return 'Zone 4'
  if (minTempC < -23.3) return 'Zone 5'
  if (minTempC < -17.8) return 'Zone 6'
  if (minTempC < -12.2) return 'Zone 7'
  if (minTempC < -6.7) return 'Zone 8'
  if (minTempC < -1.1) return 'Zone 9'
  if (minTempC < 4.4) return 'Zone 10'
  if (minTempC < 10.0) return 'Zone 11'
  if (minTempC < 15.6) return 'Zone 12'
  return 'Zone 13'
}
