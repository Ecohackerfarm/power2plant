import { describe, it, expect } from 'vitest'
import { confidenceToFloat, computeRelationshipConfidence } from '../../scripts/import/confidence'
import { ConfidenceLevel } from '@prisma/client'

describe('confidenceToFloat', () => {
  it('maps ANECDOTAL to 0.25', () => {
    expect(confidenceToFloat(ConfidenceLevel.ANECDOTAL)).toBe(0.25)
  })
  it('maps PEER_REVIEWED to 1.0', () => {
    expect(confidenceToFloat(ConfidenceLevel.PEER_REVIEWED)).toBe(1.0)
  })
})

describe('computeRelationshipConfidence', () => {
  it('returns max confidence across sources', () => {
    expect(computeRelationshipConfidence([
      ConfidenceLevel.ANECDOTAL,
      ConfidenceLevel.OBSERVED,
    ])).toBe(0.75)
  })
  it('returns 0.25 for empty sources', () => {
    expect(computeRelationshipConfidence([])).toBe(0.25)
  })
  it('handles single source', () => {
    expect(computeRelationshipConfidence([ConfidenceLevel.TRADITIONAL])).toBe(0.5)
  })
})
