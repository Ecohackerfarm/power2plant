import { describe, it, expect } from 'vitest'
import { getDisplayName, applyTranslations, type CropInput } from './recommend'

// ---------------------------------------------------------------------------
// getDisplayName
// ---------------------------------------------------------------------------

describe('getDisplayName', () => {
  it('returns title-cased first commonName', () => {
    expect(getDisplayName({ commonNames: ['zwiebel'], name: 'Onion', botanicalName: 'Allium cepa' })).toBe('Zwiebel')
  })

  it('handles multi-word common names with title case', () => {
    expect(getDisplayName({ commonNames: ['süße paprika'], name: 'Pepper', botanicalName: 'Capsicum annuum' })).toBe('Süße Paprika')
  })

  it('falls back to name when commonNames is empty and name differs from botanicalName', () => {
    expect(getDisplayName({ commonNames: [], name: 'Onion', botanicalName: 'Allium cepa' })).toBe('Onion')
  })

  it('falls back to botanicalName when name equals botanicalName', () => {
    const name = 'Allium cepa'
    expect(getDisplayName({ commonNames: [], name, botanicalName: name })).toBe('Allium Cepa')
  })

  it('uses first commonName only, ignores the rest', () => {
    expect(getDisplayName({ commonNames: ['karotte', 'möhre'], name: 'Carrot', botanicalName: 'Daucus carota' })).toBe('Karotte')
  })

  it('title-cases hyphenated names', () => {
    expect(getDisplayName({ commonNames: ['rot-kohl'], name: 'Red Cabbage', botanicalName: 'Brassica oleracea' })).toBe('Rot-Kohl')
  })
})

// ---------------------------------------------------------------------------
// applyTranslations
// ---------------------------------------------------------------------------

function makeCrop(id: string, commonNames: string[], name = 'Plant', botanicalName = 'Plantus'): CropInput {
  return { id, name, botanicalName, commonNames, minTempC: null }
}

describe('applyTranslations', () => {
  it('replaces commonNames for crops that have a translation', () => {
    const crops = [makeCrop('1', ['onion']), makeCrop('2', ['carrot'])]
    const tMap = new Map([['1', ['Zwiebel']]])
    const result = applyTranslations(crops, tMap)
    expect(result[0].commonNames).toEqual(['Zwiebel'])
    expect(result[1].commonNames).toEqual(['carrot'])
  })

  it('is a no-op when tMap is empty', () => {
    const crops = [makeCrop('1', ['onion'])]
    expect(applyTranslations(crops, new Map())).toBe(crops)
  })

  it('does not replace when translation entry has no names', () => {
    const crops = [makeCrop('1', ['onion'])]
    const tMap = new Map([['1', [] as string[]]])
    const result = applyTranslations(crops, tMap)
    expect(result[0].commonNames).toEqual(['onion'])
  })

  it('does not mutate the original crop objects', () => {
    const crop = makeCrop('1', ['onion'])
    const tMap = new Map([['1', ['Zwiebel']]])
    const [translated] = applyTranslations([crop], tMap)
    expect(translated).not.toBe(crop)
    expect(crop.commonNames).toEqual(['onion'])
  })

  it('preserves all other crop fields', () => {
    const crop = makeCrop('1', ['onion'], 'Onion', 'Allium cepa')
    crop.minTempC = -5
    const tMap = new Map([['1', ['Zwiebel']]])
    const [translated] = applyTranslations([crop], tMap)
    expect(translated.id).toBe('1')
    expect(translated.name).toBe('Onion')
    expect(translated.botanicalName).toBe('Allium cepa')
    expect(translated.minTempC).toBe(-5)
  })
})

// ---------------------------------------------------------------------------
// Consistency: same crop → same display name after translation
// This is the contract that all UI locations rely on.
// ---------------------------------------------------------------------------

describe('name consistency across locations', () => {
  it('getDisplayName returns same result whether called before or after applyTranslations (when no translation)', () => {
    const crop = makeCrop('1', ['onion'])
    const [translated] = applyTranslations([crop], new Map())
    expect(getDisplayName(translated)).toBe(getDisplayName(crop))
  })

  it('getDisplayName returns translated name after applyTranslations is applied', () => {
    const crop = makeCrop('1', ['onion'])
    const tMap = new Map([['1', ['Zwiebel']]])
    const [translated] = applyTranslations([crop], tMap)
    expect(getDisplayName(translated)).toBe('Zwiebel')
    expect(getDisplayName(crop)).toBe('Onion')
  })

  it('two crops with translation both resolve correctly via getDisplayName', () => {
    const crops = [makeCrop('1', ['onion']), makeCrop('2', ['carrot'])]
    const tMap = new Map([['1', ['Zwiebel']], ['2', ['Karotte']]])
    const translated = applyTranslations(crops, tMap)
    expect(translated.map(getDisplayName)).toEqual(['Zwiebel', 'Karotte'])
  })
})
