import { expect, test } from 'vitest'
import { SOURCE_CONFIDENCE } from '@/lib/source-confidence'
import type { SourceClassification, ConfidenceLevel } from '@prisma/client'

test('SOURCE_CONFIDENCE maps each SourceClassification to correct ConfidenceLevel', () => {
  const expected: Record<SourceClassification, ConfidenceLevel> = {
    SCIENTIFIC_PAPER: 'PEER_REVIEWED',
    ACADEMIC_RESOURCE: 'OBSERVED',
    GARDENING_GUIDE: 'TRADITIONAL',
    BLOG_FORUM: 'ANECDOTAL',
    PERSONAL_OBSERVATION: 'ANECDOTAL',
  }
  expect(SOURCE_CONFIDENCE).toEqual(expected)
})
