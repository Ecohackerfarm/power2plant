import { describe, it, expect } from 'vitest'
import { toSlug, resolveCommonName } from '../../scripts/import/normalize'

describe('toSlug', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(toSlug('Solanum lycopersicum')).toBe('solanum-lycopersicum')
  })
  it('strips special characters', () => {
    expect(toSlug("St. John's Wort")).toBe('st-johns-wort')
  })
  it('collapses multiple separators', () => {
    expect(toSlug('  Sweet  Basil  ')).toBe('sweet-basil')
  })
  it('strips leading and trailing hyphens', () => {
    expect(toSlug('-tomato-')).toBe('tomato')
  })
})

describe('resolveCommonName', () => {
  it('resolves known common name to botanical name', () => {
    expect(resolveCommonName('tomato')).toBe('Solanum lycopersicum')
  })
  it('resolves with underscores (PlantBuddies format)', () => {
    expect(resolveCommonName('sweet_basil')).toBe('Ocimum basilicum')
  })
  it('resolves case-insensitively', () => {
    expect(resolveCommonName('GARLIC')).toBe('Allium sativum')
  })
  it('returns null for unknown plant', () => {
    expect(resolveCommonName('xyzzy')).toBeNull()
  })
})
