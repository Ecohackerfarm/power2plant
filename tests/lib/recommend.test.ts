import { describe, it, expect } from 'vitest'
import { recommend, minTempCToZoneName, type CropInput, type RelationshipInput } from '@/lib/recommend'

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
})

describe('minTempCToZoneName()', () => {
  it('maps -30°C to Zone 4', () => expect(minTempCToZoneName(-30)).toBe('Zone 4'))
  it('maps -1°C to Zone 10', () => expect(minTempCToZoneName(-1)).toBe('Zone 10'))
  it('maps -50°C to Zone 1', () => expect(minTempCToZoneName(-50)).toBe('Zone 1'))
  it('maps 20°C to Zone 13', () => expect(minTempCToZoneName(20)).toBe('Zone 13'))
  it('maps -17.8°C to Zone 7 boundary', () => expect(minTempCToZoneName(-17.8)).toBe('Zone 7'))
})
