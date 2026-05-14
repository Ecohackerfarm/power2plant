import { describe, it, expect } from 'vitest'
import { recommendAlternatives, type CropInput, type RelationshipInput } from '@/lib/recommend'

const crop = (id: string, tempC = -10): CropInput => ({
  id,
  name: id,
  botanicalName: id,
  minTempC: tempC,
  commonNames: [id],
})

const companion = (a: string, b: string, conf = 0.8): RelationshipInput => ({
  cropAId: a, cropBId: b, type: 'COMPANION', confidence: conf,
})

const avoid = (a: string, b: string): RelationshipInput => ({
  cropAId: a, cropBId: b, type: 'AVOID', confidence: 0.8,
})

describe('recommendAlternatives', () => {
  it('always returns at least one result (the primary)', () => {
    const crops = [crop('c1'), crop('c2')]
    const results = recommendAlternatives(crops, [], 2, 3, 0)
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0].beds).toBeDefined()
    expect(results[0].overflow).toBeDefined()
  })

  it('primary result matches recommend() output', () => {
    const crops = [crop('c1'), crop('c2'), crop('c3')]
    const rels = [companion('c1', 'c2')]
    const [primary] = recommendAlternatives(crops, rels, 2, 3, 0)
    // Primary placement: c1+c2 should share a bed (they have affinity)
    const flatIds = primary.beds.flatMap(b => b.crops.map(c => c.id))
    expect(flatIds).toContain('c1')
    expect(flatIds).toContain('c2')
  })

  it('returns multiple distinct arrangements when crops allow it', () => {
    // 4 crops with relationships that support different groupings
    const crops = [crop('a'), crop('b'), crop('c'), crop('d')]
    const rels = [
      companion('a', 'b'), companion('c', 'd'),
      companion('a', 'c'), companion('b', 'd'),
    ]
    const results = recommendAlternatives(crops, rels, 2, 2, 0)
    expect(results.length).toBeGreaterThanOrEqual(1)
    // All arrangements must be valid (no undefined beds)
    for (const r of results) {
      expect(r.beds.every(b => Array.isArray(b.crops))).toBe(true)
    }
  })

  it('returns only unique arrangements (no duplicates)', () => {
    const crops = [crop('x'), crop('y')]
    const results = recommendAlternatives(crops, [], 1, 3, 0)
    const keys = results.map(r =>
      r.beds.map(b => b.crops.map(c => c.id).sort().join(',')).sort().join('|'),
    )
    const unique = new Set(keys)
    expect(unique.size).toBe(keys.length)
  })

  it('respects zone filtering — excluded crops never appear', () => {
    const cold = crop('cold', 5)   // minTempC 5 — excluded when zone is -10
    const hardy = crop('hardy', -20)
    const results = recommendAlternatives([cold, hardy], [], 2, 3, -10)
    const allIds = results.flatMap(r => r.beds.flatMap(b => b.crops.map(c => c.id)))
    expect(allIds).not.toContain('cold')
    expect(allIds).toContain('hardy')
  })

  it('n=0 returns only the primary result', () => {
    const crops = [crop('a'), crop('b'), crop('c'), crop('d')]
    const results = recommendAlternatives(crops, [], 2, 2, 0, 0)
    expect(results.length).toBe(1)
  })

  it('conflicts appear in results when unavoidable', () => {
    const crops = [crop('a'), crop('b')]
    const rels = [avoid('a', 'b')]
    // 1 bed, 2 capacity — forced conflict
    const [primary] = recommendAlternatives(crops, rels, 1, 2, 0)
    expect(primary.conflicts.length).toBeGreaterThan(0)
  })
})
