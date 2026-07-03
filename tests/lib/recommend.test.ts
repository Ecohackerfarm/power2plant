import { describe, it, expect } from 'vitest'
import { recommend, minTempCToZoneName, pairKey, type CropInput, type RelationshipInput, type ResearchStateMap } from '@/lib/recommend'

const makeCrop = (id: string, minTempC: number | null = null): CropInput => ({
  id,
  name: id,
  botanicalName: id,
  minTempC,
  commonNames: [],
})

const companion = (aId: string, bId: string, confidence = 0.8): RelationshipInput => ({
  cropAId: aId < bId ? aId : bId,
  cropBId: aId < bId ? bId : aId,
  type: 'COMPANION',
  confidence,
})

const avoid = (aId: string, bId: string, confidence = 0.9): RelationshipInput => ({
  cropAId: aId < bId ? aId : bId,
  cropBId: aId < bId ? bId : aId,
  type: 'AVOID',
  confidence,
})

describe('recommend()', () => {
  it('places companion pair in the same bed', () => {
    const crops = [makeCrop('tomato'), makeCrop('basil')]
    const rels = [companion('tomato', 'basil')]
    const result = recommend(crops, rels, 2, 3, 0)
    // Both should be in same bed since they're companions
    const filled = result.beds.filter(b => b.crops.length > 0)
    expect(filled).toHaveLength(1)
    expect(filled[0].crops.map(c => c.id).sort()).toEqual(['basil', 'tomato'])
    expect(result.overflow).toHaveLength(0)
    expect(result.conflicts).toHaveLength(0)
  })

  it('separates incompatible pair when beds allow it', () => {
    const crops = [makeCrop('tomato'), makeCrop('fennel')]
    const rels = [avoid('tomato', 'fennel')]
    const result = recommend(crops, rels, 2, 2, 0)
    // Each crop should be in a different bed
    const filled = result.beds.filter(b => b.crops.length > 0)
    expect(filled).toHaveLength(2)
    expect(result.conflicts).toHaveLength(0)
  })

  it('marks conflict when incompatible pair is forced into same bed', () => {
    const crops = [makeCrop('tomato'), makeCrop('fennel')]
    const rels = [avoid('tomato', 'fennel')]
    const result = recommend(crops, rels, 1, 2, 0) // only 1 bed
    expect(result.conflicts).toHaveLength(1)
    const ids = [result.conflicts[0].a.id, result.conflicts[0].b.id].sort()
    expect(ids).toEqual(['fennel', 'tomato'])
  })

  it('overflows crops that do not fit in beds', () => {
    const crops = [makeCrop('a'), makeCrop('b'), makeCrop('c')]
    const result = recommend(crops, [], 1, 2, 0) // 1 bed × 2 capacity = room for 2
    expect(result.overflow).toHaveLength(1)
    const totalInBeds = result.beds.reduce((s, b) => s + b.crops.length, 0)
    expect(totalInBeds).toBe(2)
  })

  it('filters crops colder than user zone', () => {
    // user zone gets to -30°C; crop only hardy to -10°C → filtered
    const crops = [makeCrop('tender', -10), makeCrop('hardy', -40)]
    const result = recommend(crops, [], 2, 3, -30)
    const allPlaced = result.beds.flatMap(b => b.crops)
    const ids = allPlaced.map(c => c.id)
    expect(ids).not.toContain('tender')
    expect(ids).toContain('hardy')
  })

  it('keeps crops with null minTempC regardless of zone', () => {
    const crops = [makeCrop('unknown', null)]
    const result = recommend(crops, [], 1, 3, -50)
    expect(result.beds.flatMap(b => b.crops).map(c => c.id)).toContain('unknown')
  })

  it('returns empty beds when no eligible crops', () => {
    const crops = [makeCrop('tropical', 10)] // needs min 10°C, zone is -20°C
    const result = recommend(crops, [], 1, 3, -20)
    expect(result.beds.every(b => b.crops.length === 0)).toBe(true)
    expect(result.overflow).toHaveLength(0)
  })

  it('returns correct bed count', () => {
    const result = recommend([], [], 4, 3, 0)
    expect(result.beds).toHaveLength(4)
  })

  it('spreads unrelated crops across beds rather than packing one bed', () => {
    // 4 crops, no relationships, 2 beds with capacity 4 — each bed should get ~2
    const crops = ['a', 'b', 'c', 'd'].map(id => makeCrop(id))
    const result = recommend(crops, [], 2, 4, 0)
    const sizes = result.beds.map(b => b.crops.length)
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1)
  })

  it('never co-locates conflicting pair when a free bed exists', () => {
    // tomato-cucumber conflict, basil companions both — 3 beds with capacity
    const crops = [makeCrop('tomato'), makeCrop('cucumber'), makeCrop('basil')]
    const rels = [
      avoid('tomato', 'cucumber'),
      companion('tomato', 'basil'),
      companion('basil', 'cucumber'),
    ]
    const result = recommend(crops, rels, 3, 3, 0)
    expect(result.conflicts).toHaveLength(0)
    const tomatoBed = result.beds.findIndex(b => b.crops.some(c => c.id === 'tomato'))
    const cucumberBed = result.beds.findIndex(b => b.crops.some(c => c.id === 'cucumber'))
    expect(tomatoBed).not.toBe(cucumberBed)
  })

  it('duplicates a bridge crop into every bed where it adds positive affinity', () => {
    const crops = [makeCrop('tomato'), makeCrop('cucumber'), makeCrop('basil')]
    const rels = [
      avoid('tomato', 'cucumber'),
      companion('tomato', 'basil'),
      companion('basil', 'cucumber'),
    ]
    const result = recommend(crops, rels, 3, 3, 0)
    expect(result.duplicatedCropIds).toContain('basil')
    // basil must appear in at least 2 beds
    const basilBeds = result.beds.filter(b => b.crops.some(c => c.id === 'basil'))
    expect(basilBeds.length).toBeGreaterThanOrEqual(2)
  })

  describe('noDataPairs', () => {
    it('lists in-bed pairs that have no relationship records at all', () => {
      // Two crops forced into one bed with zero relationships between them
      const crops = [makeCrop('tomato'), makeCrop('pepper')]
      const result = recommend(crops, [], 1, 2, 0)
      const filled = result.beds.filter(b => b.crops.length > 0)
      expect(filled).toHaveLength(1)
      expect(filled[0].noDataPairs).toHaveLength(1)
      const pair = filled[0].noDataPairs[0]
      expect([pair.cropAId, pair.cropBId].sort()).toEqual(['pepper', 'tomato'])
      expect(pair.pairLabel).toContain('&')
    })

    it('omits pairs that have any relationship record from noDataPairs', () => {
      const crops = [makeCrop('tomato'), makeCrop('basil')]
      const rels = [companion('tomato', 'basil')]
      const result = recommend(crops, rels, 1, 2, 0)
      const filled = result.beds.filter(b => b.crops.length > 0)
      expect(filled[0].noDataPairs).toHaveLength(0)
    })

    it('returns canonical pair ids (sorted) so deep-links are stable', () => {
      const crops = [makeCrop('zebra'), makeCrop('apple')]
      const result = recommend(crops, [], 1, 2, 0)
      const pair = result.beds.find(b => b.crops.length > 0)!.noDataPairs[0]
      expect(pair.cropAId).toBe('apple')
      expect(pair.cropBId).toBe('zebra')
    })

    it('empty beds have no noDataPairs', () => {
      const result = recommend([], [], 2, 3, 0)
      for (const bed of result.beds) {
        expect(bed.noDataPairs).toEqual([])
      }
    })
  })

  describe('existingBeds parameter', () => {
    it('locks crops in place in correct beds', () => {
      const crops = [makeCrop('tomato'), makeCrop('basil'), makeCrop('carrot')]
      const rels: RelationshipInput[] = []
      const existingBeds = [['tomato']]
      const result = recommend(crops, rels, 2, 3, 0, existingBeds)
      // tomato must be in bed 0 (locked)
      expect(result.beds[0].crops.map(c => c.id)).toContain('tomato')
      // basil must be placed somewhere (not locked)
      const allPlaced = result.beds.flatMap(b => b.crops.map(c => c.id))
      expect(allPlaced).toContain('basil')
      expect(allPlaced).toContain('carrot')
    })

    it('candidates fill remaining capacity around locked crops', () => {
      const crops = [makeCrop('tomato'), makeCrop('basil'), makeCrop('carrot')]
      const rels = [companion('tomato', 'basil')]
      const existingBeds = [['tomato']]
      const result = recommend(crops, rels, 2, 3, 0, existingBeds)
      const totalInBeds = result.beds.reduce((s, b) => s + b.crops.length, 0)
      expect(totalInBeds).toBe(3)
    })

    it('overflow when all beds full from existing', () => {
      const crops = [makeCrop('tomato'), makeCrop('basil'), makeCrop('carrot')]
      const rels: RelationshipInput[] = []
      const existingBeds = [['tomato', 'basil']]
      const result = recommend(crops, rels, 1, 2, 0, existingBeds)
      expect(result.overflow.map(c => c.id)).toContain('carrot')
    })

    it('locked crop skipped in greedy pass (not double-placed)', () => {
      const crops = [makeCrop('tomato'), makeCrop('basil')]
      const rels = [companion('tomato', 'basil')]
      const existingBeds = [['tomato']]
      const result = recommend(crops, rels, 2, 3, 0, existingBeds)
      const tomatoCount = result.beds.reduce((s, b) => s + b.crops.filter(c => c.id === 'tomato').length, 0)
      expect(tomatoCount).toBe(1)
    })
  })
})

describe('REPELS type', () => {
  it('gives positive weight (REPELS is a benefit, not a negative)', () => {
    const crops = [makeCrop('tomato'), makeCrop('basil')]
    const rels: RelationshipInput[] = [{
      cropAId: 'basil',
      cropBId: 'tomato',
      type: 'REPELS',
      confidence: 0.8,
    }]
    const result = recommend(crops, rels, 2, 3, 0)
    // With positive weight, basil and tomato should be placed together
    const filled = result.beds.filter(b => b.crops.length > 0)
    expect(filled).toHaveLength(1)
    expect(filled[0].crops.map(c => c.id).sort()).toEqual(['basil', 'tomato'])
    expect(result.conflicts).toHaveLength(0)
  })

  it('REPELS pair generates a hint (positive affinity entry in relMap)', () => {
    const crops = [makeCrop('marigold'), makeCrop('tomato')]
    const rels: RelationshipInput[] = [{
      cropAId: 'marigold',
      cropBId: 'tomato',
      type: 'REPELS',
      confidence: 0.75,
    }]
    const result = recommend(crops, rels, 1, 2, 0)
    const bed = result.beds[0]
    // The pair has positive weight, so should produce a hint
    expect(bed.hints).toHaveLength(1)
    expect(bed.hints[0].details).toContain('repels pests')
  })
})

describe('relMap dominant-type selection', () => {
  it('returns companion entry for a pair with mixed types where companion outweighs avoid', () => {
    const crops = [makeCrop('tomato'), makeCrop('basil')]
    // 2 companion sources at 0.8 each, 1 avoid at 0.5 — net positive
    const rels: RelationshipInput[] = [
      { cropAId: 'basil', cropBId: 'tomato', type: 'COMPANION', confidence: 0.8 },
      { cropAId: 'basil', cropBId: 'tomato', type: 'COMPANION', confidence: 0.8 },
      { cropAId: 'basil', cropBId: 'tomato', type: 'AVOID', confidence: 0.5 },
    ]
    const result = recommend(crops, rels, 2, 3, 0)
    // Net weight is positive: pair should be placed together and produce a hint
    const filled = result.beds.filter(b => b.crops.length > 0)
    expect(filled).toHaveLength(1)
    const bed = filled[0]
    // hint should be generated (relMap entry is the dominant COMPANION type)
    expect(bed.hints.length).toBeGreaterThan(0)
    expect(result.conflicts).toHaveLength(0)
  })

  it('avoid entry wins when avoid weight exceeds companion weight', () => {
    const crops = [makeCrop('tomato'), makeCrop('fennel')]
    // 1 avoid at 0.9, 1 companion at 0.3 — net negative
    const rels: RelationshipInput[] = [
      { cropAId: 'fennel', cropBId: 'tomato', type: 'AVOID', confidence: 0.9 },
      { cropAId: 'fennel', cropBId: 'tomato', type: 'COMPANION', confidence: 0.3 },
    ]
    const result = recommend(crops, rels, 2, 2, 0)
    // Net weight is negative: crops should be separated
    expect(result.conflicts).toHaveLength(0)
    const filledBeds = result.beds.filter(b => b.crops.length > 0)
    expect(filledBeds).toHaveLength(2)
  })
})

describe('recommend() secondary-research state', () => {
  // Two crops with no relationship, forced into one bed → the pair is a "no data" pair.
  const crops = [makeCrop('a'), makeCrop('b')]
  const key = pairKey('a', 'b')

  it('with no research state, an unknown pair is offered for research (noDataPairs)', () => {
    const bed = recommend(crops, [], 1, 2, 0).beds.find(b => b.crops.length === 2)!
    expect(bed.noDataPairs).toHaveLength(1)
    expect(bed.researchedNoDataPairs).toHaveLength(0)
    expect(bed.researchInProgressPairs).toHaveLength(0)
  })

  it('DONE moves the pair to researchedNoDataPairs (no longer offered)', () => {
    const state: ResearchStateMap = new Map([[key, 'DONE']])
    const bed = recommend(crops, [], 1, 2, 0, undefined, state).beds.find(b => b.crops.length === 2)!
    expect(bed.noDataPairs).toHaveLength(0)
    expect(bed.researchedNoDataPairs).toHaveLength(1)
    expect(bed.researchInProgressPairs).toHaveLength(0)
  })

  it('PENDING and IN_PROGRESS move the pair to researchInProgressPairs', () => {
    for (const status of ['PENDING', 'IN_PROGRESS'] as const) {
      const state: ResearchStateMap = new Map([[key, status]])
      const bed = recommend(crops, [], 1, 2, 0, undefined, state).beds.find(b => b.crops.length === 2)!
      expect(bed.noDataPairs).toHaveLength(0)
      expect(bed.researchInProgressPairs).toHaveLength(1)
    }
  })
})

describe('minTempCToZoneName()', () => {
  it('maps -30°C to Zone 4', () => expect(minTempCToZoneName(-30)).toBe('Zone 4'))
  it('maps -1°C to Zone 10', () => expect(minTempCToZoneName(-1)).toBe('Zone 10'))
  it('maps -50°C to Zone 1', () => expect(minTempCToZoneName(-50)).toBe('Zone 1'))
  it('maps 20°C to Zone 13', () => expect(minTempCToZoneName(20)).toBe('Zone 13'))
  it('maps -17.8°C to Zone 7 boundary', () => expect(minTempCToZoneName(-17.8)).toBe('Zone 7'))
})
