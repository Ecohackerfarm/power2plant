import type { SourceClassification, ConfidenceLevel } from '@prisma/client'

export const SOURCE_CONFIDENCE: Record<SourceClassification, ConfidenceLevel> = {
  SCIENTIFIC_PAPER:     'PEER_REVIEWED',
  ACADEMIC_RESOURCE:    'OBSERVED',
  GARDENING_GUIDE:      'TRADITIONAL',
  BLOG_FORUM:           'ANECDOTAL',
  PERSONAL_OBSERVATION: 'ANECDOTAL',
}
