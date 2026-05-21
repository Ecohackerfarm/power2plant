import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/plants/[id]/route'

vi.mock('@/lib/prisma', () => ({
  default: { $queryRaw: vi.fn() },
}))

import prisma from '@/lib/prisma'

const mockWikiOk = {
  ok: true,
  json: async () => ({
    type: 'standard',
    extract: 'Capsicum annuum is a species of the plant genus Capsicum.',
    thumbnail: { source: 'https://upload.wikimedia.org/thumb/capsicum.jpg' },
    content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Capsicum_annuum' } },
  }),
}
const mockWikiDisambig = { ok: true, json: async () => ({ type: 'disambiguation' }) }
const mockWikiFail = { ok: false }

function makeReq(id: string) {
  return new Request(`http://localhost/api/plants/${id}`)
}

const speciescrop = {
  id: 'crop-annuum', name: 'Cayenne Pepper', botanicalName: 'Capsicum annuum',
  commonNames: ['Cayenne'], minTempC: 10, isNitrogenFixer: false,
}
const genusCrop = {
  id: 'crop-capsicum', name: 'Capsicum', botanicalName: 'Capsicum L.',
  commonNames: [], minTempC: 10, isNitrogenFixer: false,
}
const basilCrop = {
  id: 'crop-basil', name: 'Basil', botanicalName: 'Ocimum basilicum',
  commonNames: ['Basil'], minTempC: 10, isNitrogenFixer: false,
}
const tomatoCrop = {
  id: 'crop-tomato', name: 'Tomato', botanicalName: 'Solanum lycopersicum',
  commonNames: ['Tomato'], minTempC: 5, isNitrogenFixer: false,
}

const directCompanion = {
  ...basilCrop,
  relationshipId: 'rel-direct', type: 'COMPANION', reason: null, confidence: 4, notes: null, direction: 'MUTUAL',
}
const genusCompanion = {
  ...tomatoCrop,
  relationshipId: 'rel-genus', type: 'COMPANION', reason: null, confidence: 3, notes: null, direction: 'MUTUAL',
}
const genusRow = { id: 'crop-capsicum', botanicalName: 'Capsicum L.', name: 'Capsicum' }

describe('GET /api/plants/[id] — plain species (no genus crop in DB)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 404 when crop not found', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([])
    const res = await GET(makeReq('missing'), { params: Promise.resolve({ id: 'missing' }) })
    expect(res.status).toBe(404)
  })

  it('returns crop and direct companions — no parentGenus when no genus crop exists', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([speciescrop])         // crop lookup
      .mockResolvedValueOnce([directCompanion])     // direct companions
      .mockResolvedValueOnce([])                    // genus lookup → none
    const res = await GET(makeReq('crop-annuum'), { params: Promise.resolve({ id: 'crop-annuum' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.crop.id).toBe('crop-annuum')
    expect(body.crop.parentGenus).toBeUndefined()
    expect(body.companions).toHaveLength(1)
    expect(body.companions[0].id).toBe('crop-basil')
    expect(body.companions[0].inheritedFrom).toBeUndefined()
  })
})

describe('GET /api/plants/[id] — species with genus crop in DB', () => {
  beforeEach(() => vi.clearAllMocks())

  it('adds parentGenus and inherited companions', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([speciescrop])         // crop
      .mockResolvedValueOnce([directCompanion])     // direct companions
      .mockResolvedValueOnce([genusRow])            // genus lookup
      .mockResolvedValueOnce([genusCompanion])      // genus companions
    const res = await GET(makeReq('crop-annuum'), { params: Promise.resolve({ id: 'crop-annuum' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.crop.parentGenus).toEqual({ id: 'crop-capsicum', botanicalName: 'Capsicum L.', name: 'Capsicum' })
    expect(body.companions).toHaveLength(2)
    const inherited = body.companions.find((c: { inheritedFrom?: unknown }) => c.inheritedFrom)
    expect(inherited).toBeDefined()
    expect(inherited.id).toBe('crop-tomato')
    expect(inherited.inheritedFrom).toEqual({ id: 'crop-capsicum', botanicalName: 'Capsicum L.' })
  })

  it('deduplicates: direct companion wins over genus companion for same crop', async () => {
    // directCompanion and genusCompanion are for the same crop (basil)
    const directBasil = { ...directCompanion }
    const genusBasil = { ...directCompanion, relationshipId: 'rel-genus-basil' }
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([speciescrop])
      .mockResolvedValueOnce([directBasil])
      .mockResolvedValueOnce([genusRow])
      .mockResolvedValueOnce([genusBasil])
    const res = await GET(makeReq('crop-annuum'), { params: Promise.resolve({ id: 'crop-annuum' }) })
    const body = await res.json()
    // basil appears once, with no inheritedFrom (direct wins)
    const basilCompanions = body.companions.filter((c: { id: string }) => c.id === 'crop-basil')
    expect(basilCompanions).toHaveLength(1)
    expect(basilCompanions[0].inheritedFrom).toBeUndefined()
  })
})

describe('GET /api/plants/[id] — genus crop', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns species list and speciesCount', async () => {
    const speciesList = [
      { id: 'crop-annuum', botanicalName: 'Capsicum annuum', name: 'Cayenne Pepper' },
      { id: 'crop-frutescens', botanicalName: 'Capsicum frutescens', name: 'Tabasco' },
    ]
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([genusCrop])         // crop
      .mockResolvedValueOnce([directCompanion])   // genus companions (direct)
      .mockResolvedValueOnce(speciesList)         // species list
      .mockResolvedValueOnce([{ count: BigInt(2) }]) // count
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockWikiFail))
    const res = await GET(makeReq('crop-capsicum'), { params: Promise.resolve({ id: 'crop-capsicum' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.crop.species).toHaveLength(2)
    expect(body.crop.speciesCount).toBe(2)
    expect(body.crop.parentGenus).toBeUndefined()
  })
})

describe('GET /api/plants/[id] — Wikipedia enrichment', () => {
  beforeEach(() => vi.clearAllMocks())

  it('includes wikipedia data when fetch succeeds', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([speciescrop])
      .mockResolvedValueOnce([directCompanion])
      .mockResolvedValueOnce([])                  // no genus
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockWikiOk))
    const res = await GET(makeReq('crop-annuum'), { params: Promise.resolve({ id: 'crop-annuum' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.crop.wikipedia).toBeDefined()
    expect(body.crop.wikipedia.extract).toContain('Capsicum annuum')
    expect(body.crop.wikipedia.thumbnail).toBe('https://upload.wikimedia.org/thumb/capsicum.jpg')
    expect(body.crop.wikipedia.articleUrl).toBe('https://en.wikipedia.org/wiki/Capsicum_annuum')
  })

  it('omits wikipedia when fetch returns non-ok', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([speciescrop])
      .mockResolvedValueOnce([directCompanion])
      .mockResolvedValueOnce([])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockWikiFail))
    const res = await GET(makeReq('crop-annuum'), { params: Promise.resolve({ id: 'crop-annuum' }) })
    const body = await res.json()
    expect(body.crop.wikipedia).toBeUndefined()
  })

  it('omits wikipedia for disambiguation pages', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([speciescrop])
      .mockResolvedValueOnce([directCompanion])
      .mockResolvedValueOnce([])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockWikiDisambig))
    const res = await GET(makeReq('crop-annuum'), { params: Promise.resolve({ id: 'crop-annuum' }) })
    const body = await res.json()
    expect(body.crop.wikipedia).toBeUndefined()
  })

  it('omits wikipedia when fetch throws', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([speciescrop])
      .mockResolvedValueOnce([directCompanion])
      .mockResolvedValueOnce([])
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))
    const res = await GET(makeReq('crop-annuum'), { params: Promise.resolve({ id: 'crop-annuum' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.crop.wikipedia).toBeUndefined()
  })
})
