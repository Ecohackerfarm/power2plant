import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from '@/app/api/relationships/route'

vi.mock('@/lib/prisma', () => ({
  default: {
    crop: { findMany: vi.fn() },
    relationshipSource: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    cropRelationship: { upsert: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}))

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}))

vi.mock('@/lib/classify-url', () => ({
  classifyUrl: vi.fn(),
}))

import prisma from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { classifyUrl } from '@/lib/classify-url'

const fakeSession = {
  user: { id: 'user-1', email: 'test@example.com', name: 'Test' },
  session: { id: 'sess-1', token: 'tok', expiresAt: new Date(Date.now() + 86400000) },
}

function makeReq(body: unknown) {
  return new Request('http://localhost/api/relationships', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validBody = { cropAId: 'crop-a', cropBId: 'crop-b', type: 'COMPANION' }

let capturedSourceData: any = null
let createdSources: any[] = []

beforeEach(() => { vi.clearAllMocks(); capturedSourceData = null; createdSources = [] })

describe('POST /api/relationships', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null)
    const res = await POST(makeReq(validBody))
    expect(res.status).toBe(401)
  })

  it('returns 400 when cropAId equals cropBId', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as any)
    const res = await POST(makeReq({ cropAId: 'crop-a', cropBId: 'crop-a', type: 'COMPANION' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('different')
  })

  it('returns 400 when type is invalid', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as any)
    const res = await POST(makeReq({ ...validBody, type: 'ATTRACTS' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('COMPANION or AVOID')
  })

  it('returns 400 when notes exceed 500 chars', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as any)
    vi.mocked(prisma.crop.findMany).mockResolvedValue([{ id: 'crop-a' }, { id: 'crop-b' }] as any)
    const res = await POST(makeReq({ ...validBody, notes: 'x'.repeat(501) }))
    expect(res.status).toBe(400)
  })

  it('returns 422 when crop ids are unknown', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as any)
    vi.mocked(prisma.crop.findMany).mockResolvedValue([{ id: 'crop-a' }] as any)
    const res = await POST(makeReq(validBody))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.ids).toContain('crop-b')
  })

  it('returns 429 when user already submitted this pair today', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as any)
    vi.mocked(prisma.crop.findMany).mockResolvedValue([{ id: 'crop-a' }, { id: 'crop-b' }] as any)
    vi.mocked(prisma.relationshipSource.findFirst).mockResolvedValue({ id: 'existing' } as any)
    const res = await POST(makeReq(validBody))
    expect(res.status).toBe(429)
  })

  function mockTransaction() {
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
      const mockTx = {
        cropRelationship: {
          upsert: vi.fn().mockResolvedValue({ id: 'rel-1' }),
          update: vi.fn().mockResolvedValue({}),
        },
        relationshipSource: {
          create: vi.fn().mockImplementation((data: any) => {
            createdSources.push(data.data)
            capturedSourceData = data
            return { id: `src-${createdSources.length}` }
          }),
          createMany: vi.fn().mockImplementation(({ data }: any) => {
            createdSources.push(...data)
            return { count: data.length }
          }),
          findMany: vi.fn().mockImplementation(() => {
            const confidences = createdSources.map(s => ({ confidence: s.confidence }))
            return confidences.length > 0 ? confidences : [{ confidence: 'ANECDOTAL' }]
          }),
        },
      }
      return fn(mockTx)
    })
  }

  it('returns 201 on happy path without sourceType', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as any)
    vi.mocked(prisma.crop.findMany).mockResolvedValue([{ id: 'crop-a' }, { id: 'crop-b' }] as any)
    vi.mocked(prisma.relationshipSource.findFirst).mockResolvedValue(null)
    mockTransaction()
    const res = await POST(makeReq(validBody))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBe('rel-1')
    expect(capturedSourceData.data.confidence).toBe('ANECDOTAL')
  })

  it('returns 400 when sourceType is invalid', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as any)
    vi.mocked(prisma.crop.findMany).mockResolvedValue([{ id: 'crop-a' }, { id: 'crop-b' }] as any)
    vi.mocked(prisma.relationshipSource.findFirst).mockResolvedValue(null)
    const res = await POST(makeReq({ ...validBody, sourceType: 'INVALID_TYPE' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('sourceType')
  })

  it('persists sourceType and maps to correct confidence', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as any)
    vi.mocked(prisma.crop.findMany).mockResolvedValue([{ id: 'crop-a' }, { id: 'crop-b' }] as any)
    vi.mocked(prisma.relationshipSource.findFirst).mockResolvedValue(null)
    mockTransaction()
    const res = await POST(makeReq({ ...validBody, sourceType: 'SCIENTIFIC_PAPER' }))
    expect(res.status).toBe(201)
    expect(capturedSourceData.data.sourceType).toBe('SCIENTIFIC_PAPER')
    expect(capturedSourceData.data.confidence).toBe('PEER_REVIEWED')
  })

  it('returns 400 when sources is not an array', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as any)
    const res = await POST(makeReq({ ...validBody, sources: 'not-an-array' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('sources must be an array')
  })

  it('returns 400 when sources contains non-strings', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as any)
    const res = await POST(makeReq({ ...validBody, sources: ['https://example.com', 123] }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('sources must be an array')
  })

  it('creates sources from URLs and testimony on multi-source submission', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as any)
    vi.mocked(prisma.crop.findMany).mockResolvedValue([{ id: 'crop-a' }, { id: 'crop-b' }] as any)
    vi.mocked(prisma.relationshipSource.findFirst).mockResolvedValue(null)
    vi.mocked(classifyUrl).mockImplementation((url: string) => {
      if (url.includes('doi.org')) return 'SCIENTIFIC_PAPER' as const
      if (url.includes('rhs.org.uk')) return 'GARDENING_GUIDE' as const
      return 'BLOG_FORUM' as const
    })
    mockTransaction()
    const res = await POST(makeReq({
      ...validBody,
      sources: ['https://doi.org/10.1234/xyz', 'https://www.rhs.org.uk/guide'],
    }))
    expect(res.status).toBe(201)
    expect(createdSources).toHaveLength(3)
expect(createdSources[0].sourceType).toBe('SCIENTIFIC_PAPER')
    expect(createdSources[0].source).toBe('MANUAL')
    expect(createdSources[0].confidence).toBe('PEER_REVIEWED')
    expect(createdSources[0].url).toBe('https://doi.org/10.1234/xyz')
    expect(createdSources[1].sourceType).toBe('GARDENING_GUIDE')
    expect(createdSources[1].source).toBe('MANUAL')
    expect(createdSources[1].confidence).toBe('TRADITIONAL')
    expect(createdSources[1].url).toBe('https://www.rhs.org.uk/guide')
    expect(createdSources[2].sourceType).toBe('PERSONAL_OBSERVATION')
    expect(createdSources[2].source).toBe('COMMUNITY')
    expect(createdSources[2].confidence).toBe('ANECDOTAL')
    expect(createdSources[2].url).toBeUndefined()
  })
})

function makeGetReq(params: string) {
  return new Request(`http://localhost/api/relationships?${params}`, { method: 'GET' })
}

describe('GET /api/relationships', () => {
  function mockRelationships(overrides: Partial<any>[] = []) {
    const defaults = [
      { id: 'rel-3', type: 'COMPANION', reason: 'PEST_CONTROL', confidence: 0.75, notes: null, cropA: { id: 'crop-a', name: 'Tomato', botanicalName: 'Solanum lycopersicum' }, cropB: { id: 'crop-b', name: 'Basil', botanicalName: 'Ocimum basilicum' }, _count: { sources: 2 } },
      { id: 'rel-2', type: 'AVOID', reason: 'ALLELOPATHY', confidence: 0.5, notes: null, cropA: { id: 'crop-c', name: 'Fennel', botanicalName: 'Foeniculum vulgare' }, cropB: { id: 'crop-d', name: 'Dill', botanicalName: 'Anethum graveolens' }, _count: { sources: 1 } },
      { id: 'rel-1', type: 'COMPANION', reason: 'NUTRIENT', confidence: 0.25, notes: 'Three sisters', cropA: { id: 'crop-e', name: 'Corn', botanicalName: 'Zea mays' }, cropB: { id: 'crop-f', name: 'Bean', botanicalName: 'Phaseolus vulgaris' }, _count: { sources: 3 } },
    ]
    return overrides.length > 0 ? overrides : defaults
  }

  it('returns 200 with array of relationships and no nextCursor when results fit in one page', async () => {
    const rows = mockRelationships()
    vi.mocked(prisma.cropRelationship.findMany).mockResolvedValue(rows as any)
    const res = await GET(makeGetReq(''))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.relationships).toHaveLength(3)
    expect(body.relationships[0].id).toBe('rel-3')
    expect(body.relationships[0].cropA.name).toBe('Tomato')
    expect(body.relationships[0].cropB.name).toBe('Basil')
    expect(body.relationships[0].sourceCount).toBe(2)
    expect(body.nextCursor).toBeNull()
  })

  it('returns nextCursor when results exceed limit', async () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({
      id: `rel-${100 - i}`,
      type: 'COMPANION' as const,
      reason: null,
      confidence: 0.25,
      notes: null,
      cropA: { id: `crop-${i}-a`, name: `CropA-${i}`, botanicalName: null },
      cropB: { id: `crop-${i}-b`, name: `CropB-${i}`, botanicalName: null },
      _count: { sources: 0 },
    }))
    vi.mocked(prisma.cropRelationship.findMany).mockResolvedValue(rows as any)
    const res = await GET(makeGetReq('limit=20'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.relationships).toHaveLength(20)
    expect(body.nextCursor).toBe('rel-81')
  })

  it('filters by ?q= — only relationships where cropA or cropB name matches', async () => {
    const rows = mockRelationships()
    vi.mocked(prisma.cropRelationship.findMany).mockResolvedValue(rows as any)
    const res = await GET(makeGetReq('q=Tomato'))
    expect(res.status).toBe(200)
    expect(prisma.cropRelationship.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ cropA: expect.objectContaining({ OR: expect.arrayContaining([{ name: { contains: 'Tomato', mode: 'insensitive' } }]) }) }),
          ]),
        }),
      }),
    )
  })

  it('accepts ?cursor= and returns only relationships with id < cursor', async () => {
    const rows = mockRelationships()
    vi.mocked(prisma.cropRelationship.findMany).mockResolvedValue(rows as any)
    const res = await GET(makeGetReq('cursor=rel-2'))
    expect(res.status).toBe(200)
    expect(prisma.cropRelationship.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { lt: 'rel-2' } }),
      }),
    )
  })
})