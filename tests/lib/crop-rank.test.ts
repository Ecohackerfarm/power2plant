import { describe, it, expect } from 'vitest'
import { rankCrops, detectRank, type CropRow } from '@/lib/crop-rank'

function makeCrop(overrides: Partial<CropRow> & Pick<CropRow, 'id' | 'name' | 'botanicalName'>): CropRow {
  return {
    minTempC: null,
    isCommonCrop: false,
    commonNames: [],
    ...overrides,
  }
}

describe('rankCrops', () => {
  it('exact name match ranks first', () => {
    const crops = [
      makeCrop({ id: '1', name: 'Algodones Sunflower', botanicalName: 'Helianthus niveus' }),
      makeCrop({ id: '2', name: 'Sunflower', botanicalName: 'Helianthus annuus' }),
    ]
    const [first] = rankCrops(crops, 'sunflower')
    expect(first.id).toBe('2')
  })

  it('exact commonName match ranks first', () => {
    const crops = [
      makeCrop({ id: '1', name: 'Helianthus annuus', botanicalName: 'Helianthus annuus', commonNames: ['Sunflower', 'Common Sunflower'] }),
      makeCrop({ id: '2', name: 'Algodones Sunflower', botanicalName: 'Helianthus niveus', isCommonCrop: true }),
    ]
    const [first] = rankCrops(crops, 'sunflower')
    expect(first.id).toBe('1')
  })

  it('isCommonCrop boosts starts-with ahead of non-common starts-with', () => {
    const crops = [
      makeCrop({ id: '1', name: 'Sunflower plant', botanicalName: 'X', isCommonCrop: false }),
      makeCrop({ id: '2', name: 'Sunflower', botanicalName: 'Helianthus annuus', isCommonCrop: true, commonNames: ['Sunflower'] }),
    ]
    // 'sunflower' → exact name match for id:2 already wins, so test prefix
    const crops2 = [
      makeCrop({ id: '1', name: 'Sunflowers (rare)', botanicalName: 'X', isCommonCrop: false }),
      makeCrop({ id: '2', name: 'Sunflowers (common)', botanicalName: 'Y', isCommonCrop: true }),
    ]
    const [first] = rankCrops(crops2, 'sunflower')
    expect(first.id).toBe('2')
  })

  it('isCommonCrop boosts within contains results', () => {
    const crops = [
      makeCrop({ id: '1', name: 'Wild Zucchini species', botanicalName: 'Cucurbita obscura', isCommonCrop: false }),
      makeCrop({ id: '2', name: 'Texas Gourd', botanicalName: 'Cucurbita pepo', isCommonCrop: true, commonNames: ['Zucchini', 'Courgette', 'Pumpkin'] }),
    ]
    const [first] = rankCrops(crops, 'zucchini')
    // exact commonName match for id:2
    expect(first.id).toBe('2')
  })

  it('alphabetical order within same score', () => {
    const crops = [
      makeCrop({ id: '1', name: 'Zucchini B', botanicalName: 'X', isCommonCrop: true }),
      makeCrop({ id: '2', name: 'Zucchini A', botanicalName: 'Y', isCommonCrop: true }),
    ]
    const ranked = rankCrops(crops, 'xyz')
    expect(ranked[0].id).toBe('2') // 'Zucchini A' before 'Zucchini B'
  })

  // Common garden crop scenarios
  it('sunflower → finds Helianthus annuus via commonName alias', () => {
    const crops = [
      makeCrop({ id: '1', name: 'Helianthus annuus', botanicalName: 'Helianthus annuus', isCommonCrop: true, commonNames: ['Sunflower', 'Common Sunflower'] }),
      makeCrop({ id: '2', name: 'Algodones Sunflower', botanicalName: 'Helianthus niveus', isCommonCrop: false }),
    ]
    const [first] = rankCrops(crops, 'sunflower')
    expect(first.botanicalName).toBe('Helianthus annuus')
  })

  it('zucchini → finds Cucurbita pepo via commonName', () => {
    const crops = [
      makeCrop({ id: '1', name: 'Texas Gourd', botanicalName: 'Cucurbita pepo', isCommonCrop: true, commonNames: ['Zucchini', 'Courgette', 'Pumpkin'] }),
    ]
    const [first] = rankCrops(crops, 'zucchini')
    expect(first.botanicalName).toBe('Cucurbita pepo')
  })

  it('courgette → finds Cucurbita pepo via commonName', () => {
    const crops = [
      makeCrop({ id: '1', name: 'Texas Gourd', botanicalName: 'Cucurbita pepo', isCommonCrop: true, commonNames: ['Zucchini', 'Courgette', 'Pumpkin'] }),
    ]
    const [first] = rankCrops(crops, 'courgette')
    expect(first.botanicalName).toBe('Cucurbita pepo')
  })

  it('does not mutate input array', () => {
    const crops = [
      makeCrop({ id: '1', name: 'B', botanicalName: 'X' }),
      makeCrop({ id: '2', name: 'A', botanicalName: 'Y' }),
    ]
    const original = [...crops]
    rankCrops(crops, 'test')
    expect(crops[0].id).toBe(original[0].id)
  })
})

describe('detectRank', () => {
  it('single word genus', () => {
    expect(detectRank('Rosa')).toBe('genus')
    expect(detectRank('Allium')).toBe('genus')
    expect(detectRank('Ocimum')).toBe('genus')
  })

  it('genus with author abbreviation', () => {
    expect(detectRank('Ocimum L.')).toBe('genus')
    expect(detectRank('Helianthus Michx.')).toBe('genus')
  })

  it('species with lowercase second word', () => {
    expect(detectRank('Ocimum basilicum')).toBe('species')
    expect(detectRank('Helianthus annuus')).toBe('species')
    expect(detectRank('Beta vulgaris')).toBe('species')
  })

  it('cultivar / subspecies names', () => {
    expect(detectRank('Cucurbita pepo var. cylindrica')).toBe('species')
    expect(detectRank('Solanum lycopersicum')).toBe('species')
  })
})
