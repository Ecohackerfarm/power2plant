import { describe, it, expect } from 'vitest'
import { classifyUrl } from '@/lib/classify-url'

describe('classifyUrl', () => {
  it('classifies doi.org as SCIENTIFIC_PAPER', () => {
    expect(classifyUrl('https://doi.org/10.1234/example')).toBe('SCIENTIFIC_PAPER')
  })

  it('classifies dx.doi.org as SCIENTIFIC_PAPER', () => {
    expect(classifyUrl('https://dx.doi.org/10.1234/example')).toBe('SCIENTIFIC_PAPER')
  })

  it('classifies pubmed as SCIENTIFIC_PAPER', () => {
    expect(classifyUrl('https://pubmed.ncbi.nlm.nih.gov/12345/')).toBe('SCIENTIFIC_PAPER')
  })

  it('classifies scholar.google.com as SCIENTIFIC_PAPER', () => {
    expect(classifyUrl('https://scholar.google.com/scholar?q=companion+planting')).toBe('SCIENTIFIC_PAPER')
  })

  it('classifies .edu URL as ACADEMIC_RESOURCE', () => {
    expect(classifyUrl('https://extension.psu.edu/companion-planting')).toBe('ACADEMIC_RESOURCE')
  })

  it('classifies .ac.uk URL as ACADEMIC_RESOURCE', () => {
    expect(classifyUrl('https://www.rhs.ac.uk/research/plant-guide')).toBe('ACADEMIC_RESOURCE')
  })

  it('classifies rhs.org.uk as GARDENING_GUIDE', () => {
    expect(classifyUrl('https://www.rhs.org.uk/plants/popular/companion-planting')).toBe('GARDENING_GUIDE')
  })

  it('classifies almanac.com as GARDENING_GUIDE', () => {
    expect(classifyUrl('https://www.almanac.com/companion-planting-guide')).toBe('GARDENING_GUIDE')
  })

  it('classifies gardenersworld.com as GARDENING_GUIDE', () => {
    expect(classifyUrl('https://www.gardenersworld.com/how-to/companion-planting/')).toBe('GARDENING_GUIDE')
  })

  it('classifies extension.org as GARDENING_GUIDE', () => {
    expect(classifyUrl('https://extension.org/companion-planting/')).toBe('GARDENING_GUIDE')
  })

  it('classifies growveg.com as GARDENING_GUIDE', () => {
    expect(classifyUrl('https://www.growveg.com/companion-planting/')).toBe('GARDENING_GUIDE')
  })

  it('classifies pfaf.org as GARDENING_GUIDE', () => {
    expect(classifyUrl('https://pfaf.org/user/plant-search')).toBe('GARDENING_GUIDE')
  })

  it('classifies random blog as BLOG_FORUM', () => {
    expect(classifyUrl('https://mybackyardblog.com/companion-planting-tips')).toBe('BLOG_FORUM')
  })

  it('classifies invalid URL as BLOG_FORUM', () => {
    expect(classifyUrl('not-a-valid-url')).toBe('BLOG_FORUM')
  })

  it('classifies empty string as BLOG_FORUM', () => {
    expect(classifyUrl('')).toBe('BLOG_FORUM')
  })

  it('classifies random string as BLOG_FORUM', () => {
    expect(classifyUrl('garbage')).toBe('BLOG_FORUM')
  })

  it('handles URL without protocol as BLOG_FORUM', () => {
    expect(classifyUrl('example.com/page')).toBe('BLOG_FORUM')
  })
})
