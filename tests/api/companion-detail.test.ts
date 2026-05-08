import { describe, it, expect, vi } from 'vitest'
import { GET } from '@/app/api/plants/[id]/companions/[companionId]/route'

vi.mock('@/lib/prisma', () => ({
  default: {
    $queryRaw: vi.fn(),
    relationshipSource: { findMany: vi.fn() },
  },
}))

import prisma from '@/lib/prisma'

function makeReq(id: string, companionId: string) {
  return new Request(`http://localhost/api/plants/${id}/companions/${companionId}`)
}

const fakeRel = {
  relId: 'rel-1', type: 'COMPANION', reason: null, reasons: [], confidence: 3,
  notes: null, direction: 'MUTUAL',
  cropAId: 'crop-a', cropAName: 'Tomato', cropABotanical: 'Solanum lycopersicum',
  cropACommonNames: ['Tomato'], cropANitrogen: false,
  cropBId: 'crop-b', cropBName: 'Basil', cropBBotanical: 'Ocimum basilicum',
  cropBCommonNames: ['Basil'], cropBNitrogen: false,
}

describe('GET /api/plants/[id]/companions/[companionId]', () => {
  it('returns 404 when relationship not found', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([])
    const res = await GET(makeReq('crop-a', 'crop-b'), {
      params: Promise.resolve({ id: 'crop-a', companionId: 'crop-b' }),
    })
    expect(res.status).toBe(404)
  })

  it('returns relationship with non-community sources', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([fakeRel])
    vi.mocked(prisma.relationshipSource.findMany).mockResolvedValue([
      { source: 'TREFLE', sourceType: null, confidence: 'OBSERVED', url: 'https://trefle.io', notes: null, fetchedAt: new Date('2025-01-01'), userId: null },
    ])

    const res = await GET(makeReq('crop-a', 'crop-b'), {
      params: Promise.resolve({ id: 'crop-a', companionId: 'crop-b' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.relationship.relId).toBe('rel-1')
    expect(body.sources).toHaveLength(1)
    expect(body.sources[0].source).toBe('TREFLE')
    expect(body.sources[0].url).toBe('https://trefle.io')
  })

  it('groups community sources by user+day', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([fakeRel])
    vi.mocked(prisma.relationshipSource.findMany).mockResolvedValue([
      { source: 'COMMUNITY', sourceType: null, confidence: 'ANECDOTAL', url: null, notes: 'I grew these together', fetchedAt: new Date('2025-06-01T10:00:00Z'), userId: 'user-1' },
      { source: 'COMMUNITY', sourceType: 'SCIENTIFIC_PAPER', confidence: 'PEER_REVIEWED', url: 'https://doi.org/10.1234', notes: null, fetchedAt: new Date('2025-06-01T10:01:00Z'), userId: 'user-1' },
      { source: 'COMMUNITY', sourceType: 'GARDENING_GUIDE', confidence: 'TRADITIONAL', url: 'https://rhs.org.uk/guide', notes: null, fetchedAt: new Date('2025-06-01T10:02:00Z'), userId: 'user-1' },
    ])

    const res = await GET(makeReq('crop-a', 'crop-b'), {
      params: Promise.resolve({ id: 'crop-a', companionId: 'crop-b' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sources).toHaveLength(1)
    const group = body.sources[0]
    expect(group.source).toBe('COMMUNITY')
    expect(group.confidence).toBe('ANECDOTAL')
    expect(group.notes).toBe('I grew these together')
    expect(group.urls).toHaveLength(2)
    expect(group.urls[0].url).toBe('https://doi.org/10.1234')
    expect(group.urls[0].sourceType).toBe('SCIENTIFIC_PAPER')
    expect(group.urls[1].url).toBe('https://rhs.org.uk/guide')
    expect(group.urls[1].sourceType).toBe('GARDENING_GUIDE')
  })

  it('separates community and non-community sources', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([fakeRel])
    vi.mocked(prisma.relationshipSource.findMany).mockResolvedValue([
      { source: 'TREFLE', sourceType: null, confidence: 'OBSERVED', url: 'https://trefle.io', notes: null, fetchedAt: new Date('2025-01-01'), userId: null },
      { source: 'COMMUNITY', sourceType: null, confidence: 'ANECDOTAL', url: null, notes: 'testimony', fetchedAt: new Date('2025-06-01'), userId: 'user-1' },
    ])

    const res = await GET(makeReq('crop-a', 'crop-b'), {
      params: Promise.resolve({ id: 'crop-a', companionId: 'crop-b' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sources).toHaveLength(2)
    expect(body.sources[0].source).toBe('TREFLE')
    expect(body.sources[1].source).toBe('COMMUNITY')
  })

  it('does not expose userId in response', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([fakeRel])
    vi.mocked(prisma.relationshipSource.findMany).mockResolvedValue([
      { source: 'COMMUNITY', sourceType: null, confidence: 'ANECDOTAL', url: null, notes: 'test', fetchedAt: new Date('2025-06-01'), userId: 'user-1' },
    ])

    const res = await GET(makeReq('crop-a', 'crop-b'), {
      params: Promise.resolve({ id: 'crop-a', companionId: 'crop-b' }),
    })
    const body = await res.json()
    expect(body.sources[0].userId).toBeUndefined()
  })

  it('includes sourceType on non-community sources', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([fakeRel])
    vi.mocked(prisma.relationshipSource.findMany).mockResolvedValue([
      { source: 'TREFLE', sourceType: 'SCIENTIFIC_PAPER', confidence: 'PEER_REVIEWED', url: 'https://trefle.io', notes: null, fetchedAt: new Date('2025-01-01'), userId: null },
    ])

    const res = await GET(makeReq('crop-a', 'crop-b'), {
      params: Promise.resolve({ id: 'crop-a', companionId: 'crop-b' }),
    })
    const body = await res.json()
    expect(body.sources[0].sourceType).toBe('SCIENTIFIC_PAPER')
  })
})
