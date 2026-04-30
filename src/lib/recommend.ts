export type CropInput = {
  id: string
  name: string
  botanicalName: string
  minTempC: number | null
}

export type RelationshipInput = {
  cropAId: string
  cropBId: string
  type: 'COMPANION' | 'AVOID' | 'ATTRACTS' | 'REPELS' | 'NURSE' | 'TRAP_CROP'
  confidence: number
}

export type BedResult = {
  index: number
  crops: CropInput[]
}

export type RecommendResult = {
  beds: BedResult[]
  overflow: CropInput[]
  conflicts: Array<{ a: CropInput; b: CropInput }>
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

  // 4. Greedy placement
  const beds: CropInput[][] = Array.from({ length: bedCount }, () => [])
  const overflow: CropInput[] = []

  for (const crop of sorted) {
    let bestBed = -1
    let bestScore = -Infinity

    for (let i = 0; i < beds.length; i++) {
      if (beds[i].length >= bedCapacity) continue
      const score = beds[i].reduce((sum, c) => sum + getWeight(crop.id, c.id), 0)
      if (score > bestScore || (score === bestScore && bestBed === -1)) {
        bestScore = score
        bestBed = i
      }
    }

    if (bestBed === -1) {
      overflow.push(crop)
    } else {
      beds[bestBed].push(crop)
    }
  }

  // 5. Collect conflicts (incompatible pairs in same bed)
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

  return {
    beds: beds.map((crops, index) => ({ index, crops })),
    overflow,
    conflicts,
  }
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
  if (minTempC < 4.4) return 'Zone 9'
  if (minTempC < 10.0) return 'Zone 10'
  if (minTempC < 15.6) return 'Zone 11'
  if (minTempC < 18.3) return 'Zone 12'
  if (minTempC < 26.7) return 'Zone 13'
  return 'Zone 14'
}
