import { describe, it, expect } from 'vitest'
import { SOURCE_CONFIDENCE } from '@/lib/source-confidence'

describe('SOURCE_CONFIDENCE', () => {
  it('maps SCIENTIFIC_PAPER to PEER_REVIEWED', () => {
    expect(SOURCE_CONFIDENCE.SCIENTIFIC_PAPER).toBe('PEER_REVIEWED')
  })
  it('maps ACADEMIC_RESOURCE to OBSERVED', () => {
    expect(SOURCE_CONFIDENCE.ACADEMIC_RESOURCE).toBe('OBSERVED')
  })
  it('maps GARDENING_GUIDE to TRADITIONAL', () => {
    expect(SOURCE_CONFIDENCE.GARDENING_GUIDE).toBe('TRADITIONAL')
  })
  it('maps BLOG_FORUM to ANECDOTAL', () => {
    expect(SOURCE_CONFIDENCE.BLOG_FORUM).toBe('ANECDOTAL')
  })
  it('maps PERSONAL_OBSERVATION to ANECDOTAL', () => {
    expect(SOURCE_CONFIDENCE.PERSONAL_OBSERVATION).toBe('ANECDOTAL')
  })
  it('covers all SourceClassification values', () => {
    expect(Object.keys(SOURCE_CONFIDENCE)).toHaveLength(5)
  })
})
