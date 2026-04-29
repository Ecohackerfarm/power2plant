import { ConfidenceLevel } from '@prisma/client'

export const CONFIDENCE_WEIGHTS: Record<ConfidenceLevel, number> = {
  ANECDOTAL: 0.25,
  TRADITIONAL: 0.5,
  OBSERVED: 0.75,
  PEER_REVIEWED: 1.0,
}

export function confidenceToFloat(level: ConfidenceLevel): number {
  return CONFIDENCE_WEIGHTS[level]
}

export function computeRelationshipConfidence(levels: ConfidenceLevel[]): number {
  if (levels.length === 0) return 0.25
  return Math.max(...levels.map(confidenceToFloat))
}
