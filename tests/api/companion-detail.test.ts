import { describe, it, expect, vi, beforeEach } from 'vitest'
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
      { id: 'src-1', relationshipId: 'rel-1', source: 'TREFLE', sourceType: null, confidence: 'OBSERVED', url: 'https://trefle.io', notes: null, fetchedAt: new Date('2025-01-01'), userId: null },
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
      { id: 'src-2', relationshipId: 'rel-1', source: 'COMMUNITY', sourceType: null, confidence: 'ANECDOTAL', url: null, notes: 'I grew these together', fetchedAt: new Date('2025-06-01T10:00:00Z'), userId: 'user-1' },
      { id: 'src-3', relationshipId: 'rel-1', source: 'COMMUNITY', sourceType: 'SCIENTIFIC_PAPER', confidence: 'PEER_REVIEWED', url: 'https://doi.org/10.1234', notes: null, fetchedAt: new Date('2025-06-01T10:01:00Z'), userId: 'user-1' },
      { id: 'src-4', relationshipId: 'rel-1', source: 'COMMUNITY', sourceType: 'GARDENING_GUIDE', confidence: 'TRADITIONAL', url: 'https://rhs.org.uk/guide', notes: null, fetchedAt: new Date('2025-06-01T10:02:00Z'), userId: 'user-1' },
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
      { id: 'src-5', relationshipId: 'rel-1', source: 'TREFLE', sourceType: null, confidence: 'OBSERVED', url: 'https://trefle.io', notes: null, fetchedAt: new Date('2025-01-01'), userId: null },
      { id: 'src-6', relationshipId: 'rel-1', source: 'COMMUNITY', sourceType: null, confidence: 'ANECDOTAL', url: null, notes: 'testimony', fetchedAt: new Date('2025-06-01'), userId: 'user-1' },
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
      { id: 'src-7', relationshipId: 'rel-1', source: 'COMMUNITY', sourceType: null, confidence: 'ANECDOTAL', url: null, notes: 'test', fetchedAt: new Date('2025-06-01'), userId: 'user-1' },
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
      { id: 'src-8', relationshipId: 'rel-1', source: 'TREFLE', sourceType: 'SCIENTIFIC_PAPER', confidence: 'PEER_REVIEWED', url: 'https://trefle.io', notes: null, fetchedAt: new Date('2025-01-01'), userId: null },
    ])

    const res = await GET(makeReq('crop-a', 'crop-b'), {
      params: Promise.resolve({ id: 'crop-a', companionId: 'crop-b' }),
    })
    const body = await res.json()
    expect(body.sources[0].sourceType).toBe('SCIENTIFIC_PAPER')
  })
})

describe('GET /api/plants/[id]/companions/[companionId] — genus fallback', () => {
  beforeEach(() => vi.clearAllMocks())

  const annuum = { id: 'crop-annuum', botanicalName: 'Capsicum annuum' }
  const basilicum = { id: 'crop-basil', botanicalName: 'Ocimum basilicum' }
  const capsicumGenus = { id: 'crop-capsicum', botanicalName: 'Capsicum L.' }
  const ocimumGenus = { id: 'crop-ocimum', botanicalName: 'Ocimum L.' }

  const genusRel = {
    relId: 'rel-genus', type: 'COMPANION', reason: null, reasons: [], confidence: 3,
    notes: null, direction: 'MUTUAL',
    cropAId: 'crop-capsicum', cropAName: 'Capsicum', cropABotanical: 'Capsicum L.',
    cropACommonNames: [], cropANitrogen: false,
    cropBId: 'crop-ocimum', cropBName: 'Ocimum', cropBBotanical: 'Ocimum L.',
    cropBCommonNames: [], cropBNitrogen: false,
  }

  it('resolves to genus relationship when no direct relationship found', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([])                           // direct lookup → none
      .mockResolvedValueOnce([annuum, basilicum])          // fetch both crops
      .mockResolvedValueOnce([capsicumGenus])              // genus for annuum
      .mockResolvedValueOnce([ocimumGenus])                // genus for basilicum
      .mockResolvedValueOnce([genusRel])                   // genus relationship
    vi.mocked(prisma.relationshipSource.findMany).mockResolvedValue([])

    const res = await GET(makeReq('crop-annuum', 'crop-basil'), {
      params: Promise.resolve({ id: 'crop-annuum', companionId: 'crop-basil' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.relationship.resolvedToGenus).toBe(true)
    expect(body.relationship.genusA).toEqual({ id: 'crop-capsicum', botanicalName: 'Capsicum L.' })
    expect(body.relationship.genusB).toEqual({ id: 'crop-ocimum', botanicalName: 'Ocimum L.' })
    expect(body.relationship.relId).toBe('rel-genus')
  })

  it('returns 404 when no direct and no genus relationship found', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([])                           // direct → none
      .mockResolvedValueOnce([annuum, basilicum])          // crops
      .mockResolvedValueOnce([capsicumGenus])              // genus A
      .mockResolvedValueOnce([ocimumGenus])                // genus B
      .mockResolvedValueOnce([])                           // genus rel → none
    const res = await GET(makeReq('crop-annuum', 'crop-basil'), {
      params: Promise.resolve({ id: 'crop-annuum', companionId: 'crop-basil' }),
    })
    expect(res.status).toBe(404)
  })

  it('returns 404 when one species has no genus crop', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([])                           // direct → none
      .mockResolvedValueOnce([annuum, basilicum])          // crops
      .mockResolvedValueOnce([capsicumGenus])              // genus A
      .mockResolvedValueOnce([])                           // genus B → none
    const res = await GET(makeReq('crop-annuum', 'crop-basil'), {
      params: Promise.resolve({ id: 'crop-annuum', companionId: 'crop-basil' }),
    })
    expect(res.status).toBe(404)
  })

  it('direct relationships are unaffected — resolvedToGenus absent', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([fakeRel])
    vi.mocked(prisma.relationshipSource.findMany).mockResolvedValue([])
    const res = await GET(makeReq('crop-a', 'crop-b'), {
      params: Promise.resolve({ id: 'crop-a', companionId: 'crop-b' }),
    })
    const body = await res.json()
    expect(body.relationship.resolvedToGenus).toBeUndefined()
    expect(body.relationship.genusA).toBeUndefined()
  })
})
