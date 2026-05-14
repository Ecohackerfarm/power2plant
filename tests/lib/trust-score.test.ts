import { describe, it, expect } from 'vitest'
import { scoreFromHistory, MIN_SUBMISSIONS, type SubmissionRecord } from '@/lib/trust-score'

function makeHistory(overrides: Partial<SubmissionRecord>[]): SubmissionRecord[] {
  return overrides.map(o => ({ claimedValue: 0.25, derivedValue: 0.25, ...o }))
}

describe('scoreFromHistory', () => {
  it('returns 1.0 for fewer than MIN_SUBMISSIONS', () => {
    const history = makeHistory(Array(MIN_SUBMISSIONS - 1).fill({}))
    expect(scoreFromHistory(history)).toBe(1.0)
  })

  it('returns 1.0 for exactly 0 submissions', () => {
    expect(scoreFromHistory([])).toBe(1.0)
  })

  it('all accurate submissions → score 1.0', () => {
    const history = makeHistory(Array(MIN_SUBMISSIONS).fill({
      claimedValue: 0.25,
      derivedValue: 0.25,
    }))
    expect(scoreFromHistory(history)).toBe(1.0)
  })

  it('all over-confident → floor 0.1', () => {
    const history = makeHistory(Array(MIN_SUBMISSIONS).fill({
      claimedValue: 1.0,
      derivedValue: 0.25,
    }))
    expect(scoreFromHistory(history)).toBe(0.1)
  })

  it('one over-confident in five → penalises correctly', () => {
    // 4 accurate + 1 over-confident with penalty=2
    // score = 4 / (4 + 1*2) = 4/6 ≈ 0.667
    const history: SubmissionRecord[] = [
      ...makeHistory(Array(4).fill({ claimedValue: 0.25, derivedValue: 0.25 })),
      { claimedValue: 1.0, derivedValue: 0.25 },
    ]
    const score = scoreFromHistory(history)
    expect(score).toBeCloseTo(4 / 6, 5)
  })

  it('mix: accurate is peer-reviewed with peer-reviewed source → still accurate', () => {
    const history: SubmissionRecord[] = makeHistory(Array(MIN_SUBMISSIONS).fill({
      claimedValue: 1.0,
      derivedValue: 1.0,
    }))
    expect(scoreFromHistory(history)).toBe(1.0)
  })

  it('exact match (claimed === derived) counts as accurate', () => {
    const history: SubmissionRecord[] = makeHistory(Array(MIN_SUBMISSIONS).fill({
      claimedValue: 0.5,
      derivedValue: 0.5,
    }))
    expect(scoreFromHistory(history)).toBe(1.0)
  })

  it('floor prevents score below 0.1', () => {
    const history: SubmissionRecord[] = makeHistory(Array(20).fill({
      claimedValue: 1.0,
      derivedValue: 0.25,
    }))
    expect(scoreFromHistory(history)).toBeGreaterThanOrEqual(0.1)
    expect(scoreFromHistory(history)).toBe(0.1)
  })
})
