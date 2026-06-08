import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/plants/search/route'

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}))

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}))

vi.mock('@/lib/prisma', () => ({
  default: {
    crop: { findMany: vi.fn() },
    cropRelationship: { findMany: vi.fn() },
    researchRequest: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
}))

import prisma from '@/lib/prisma'
import { auth } from '@/lib/auth'

const tomato = { id: 'crop-tomato', name: 'Tomato', botanicalName: 'Solanum lycopersicum', commonNames: ['tomato'], translations: [] }
const basil  = { id: 'crop-basil',  name: 'Basil',  botanicalName: 'Ocimum basilicum',     commonNames: ['basil'],  translations: [] }
const unknown = { id: 'crop-x',     name: 'Unknown', botanicalName: 'Unknown sp.',          commonNames: [],          translations: [] }

function makeGet(q: string, locale = 'en') {
  return new Request(`http://localhost/api/plants/search?q=${encodeURIComponent(q)}&locale=${locale}`)
}

beforeEach(() => vi.clearAllMocks())

describe('GET /api/plants/search', () => {
  it('returns empty results for blank query', async () => {
    const res = await GET(makeGet(''))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.plants).toHaveLength(0)
    expect(body.noDataPlants).toHaveLength(0)
    // no DB calls for blank query
    expect(prisma.$queryRaw).not.toHaveBeenCalled()
  })

  it('returns empty when no crop IDs match', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null)
    vi.mocked(prisma.$queryRaw).mockResolvedValue([])
    const res = await GET(makeGet('xyzzy'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.plants).toHaveLength(0)
    expect(body.noDataPlants).toHaveLength(0)
  })

  it('groups a matched crop with its companions', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null)
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ id: tomato.id }])
    vi.mocked(prisma.crop.findMany).mockResolvedValue([tomato] as never)
    vi.mocked(prisma.cropRelationship.findMany).mockResolvedValue([
      {
        id: 'rel-1', type: 'COMPANION', reason: 'PEST_CONTROL', confidence: 0.8, notes: null,
        cropA: tomato, cropB: basil,
      },
    ] as never)
    vi.mocked(prisma.researchRequest.findMany).mockResolvedValue([])

    const res = await GET(makeGet('tomato'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.plants).toHaveLength(1)
    expect(body.plants[0].id).toBe(tomato.id)
    expect(body.plants[0].companions).toHaveLength(1)
    expect(body.plants[0].companions[0].cropB.id).toBe(basil.id)
    expect(body.plants[0].antagonists).toHaveLength(0)
    expect(body.noDataPlants).toHaveLength(0)
  })

  it('splits companion vs antagonist relationships', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null)
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ id: tomato.id }])
    vi.mocked(prisma.crop.findMany).mockResolvedValue([tomato] as never)
    vi.mocked(prisma.cropRelationship.findMany).mockResolvedValue([
      { id: 'r1', type: 'COMPANION', reason: null, confidence: 0.5, notes: null, cropA: tomato, cropB: basil },
      { id: 'r2', type: 'AVOID',     reason: null, confidence: 0.5, notes: null, cropA: tomato, cropB: unknown },
    ] as never)
    vi.mocked(prisma.researchRequest.findMany).mockResolvedValue([])

    const res = await GET(makeGet('tomato'))
    const body = await res.json()
    expect(body.plants[0].companions).toHaveLength(1)
    expect(body.plants[0].antagonists).toHaveLength(1)
    expect(body.plants[0].antagonists[0].cropB.id).toBe(unknown.id)
  })

  it('puts plants with no relationships in noDataPlants', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null)
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ id: unknown.id }])
    vi.mocked(prisma.crop.findMany).mockResolvedValue([unknown] as never)
    vi.mocked(prisma.cropRelationship.findMany).mockResolvedValue([])
    vi.mocked(prisma.researchRequest.findMany).mockResolvedValue([])

    const res = await GET(makeGet('unknown'))
    const body = await res.json()
    expect(body.plants).toHaveLength(0)
    expect(body.noDataPlants).toHaveLength(1)
    expect(body.noDataPlants[0].id).toBe(unknown.id)
    expect(body.noDataPlants[0].voteCount).toBe(0)
    expect(body.noDataPlants[0].hasVoted).toBe(false)
    expect(body.noDataPlants[0].researchRequestId).toBeNull()
  })

  it('includes existing research request data for no-data plants', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null)
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ id: unknown.id }])
    vi.mocked(prisma.crop.findMany).mockResolvedValue([unknown] as never)
    vi.mocked(prisma.cropRelationship.findMany).mockResolvedValue([])
    vi.mocked(prisma.researchRequest.findMany).mockResolvedValue([
      { id: 'rr-x', cropAId: unknown.id, voteCount: 5, votes: [] },
    ] as never)

    const res = await GET(makeGet('unknown'))
    const body = await res.json()
    expect(body.noDataPlants[0].researchRequestId).toBe('rr-x')
    expect(body.noDataPlants[0].voteCount).toBe(5)
  })

  it('sets hasVoted:true for authenticated user who already voted', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: 'user-1' } } as never)
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ id: unknown.id }])
    vi.mocked(prisma.crop.findMany).mockResolvedValue([unknown] as never)
    vi.mocked(prisma.cropRelationship.findMany).mockResolvedValue([])
    vi.mocked(prisma.researchRequest.findMany).mockResolvedValue([
      { id: 'rr-x', cropAId: unknown.id, voteCount: 3, votes: [{ id: 'v-1' }] },
    ] as never)

    const res = await GET(makeGet('unknown'))
    const body = await res.json()
    expect(body.noDataPlants[0].hasVoted).toBe(true)
  })

  it('applies locale translations to commonNames', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null)
    const tomatoDe = {
      ...tomato,
      translations: [{ cropId: tomato.id, commonNames: ['Tomate'] }],
    }
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ id: tomato.id }])
    vi.mocked(prisma.crop.findMany).mockResolvedValue([tomatoDe] as never)
    vi.mocked(prisma.cropRelationship.findMany).mockResolvedValue([
      { id: 'r1', type: 'COMPANION', reason: null, confidence: 0.5, notes: null, cropA: tomatoDe, cropB: basil },
    ] as never)
    vi.mocked(prisma.researchRequest.findMany).mockResolvedValue([])

    const res = await GET(makeGet('tomate', 'de'))
    const body = await res.json()
    expect(body.plants[0].commonNames).toEqual(['Tomate'])
  })

  it('applies locale translations to companion plant commonNames', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null)
    const basilDe = { ...basil, translations: [{ cropId: basil.id, commonNames: ['Basilikum'] }] }
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ id: tomato.id }])
    vi.mocked(prisma.crop.findMany).mockResolvedValue([{ ...tomato, translations: [] }] as never)
    vi.mocked(prisma.cropRelationship.findMany).mockResolvedValue([
      { id: 'r1', type: 'COMPANION', reason: null, confidence: 0.5, notes: null, cropA: tomato, cropB: basilDe },
    ] as never)
    vi.mocked(prisma.researchRequest.findMany).mockResolvedValue([])

    const res = await GET(makeGet('tomate', 'de'))
    const body = await res.json()
    // companion (cropB) must use its own embedded translation
    expect(body.plants[0].companions[0].cropB.commonNames).toEqual(['Basilikum'])
  })

  it('ATTRACTS, NURSE, TRAP_CROP all go into companions bucket', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null)
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ id: tomato.id }])
    vi.mocked(prisma.crop.findMany).mockResolvedValue([tomato] as never)
    vi.mocked(prisma.cropRelationship.findMany).mockResolvedValue([
      { id: 'r1', type: 'ATTRACTS',   reason: null, confidence: 0.5, notes: null, cropA: tomato, cropB: basil },
      { id: 'r2', type: 'NURSE',      reason: null, confidence: 0.5, notes: null, cropA: tomato, cropB: unknown },
      { id: 'r3', type: 'TRAP_CROP',  reason: null, confidence: 0.5, notes: null, cropA: tomato, cropB: unknown },
    ] as never)
    vi.mocked(prisma.researchRequest.findMany).mockResolvedValue([])

    const res = await GET(makeGet('tomato'))
    const body = await res.json()
    expect(body.plants[0].companions).toHaveLength(3)
    expect(body.plants[0].antagonists).toHaveLength(0)
  })

  it('shows a plant in both plants and noDataPlants when matched by different queries', async () => {
    // When basil matches and has relationships, tomato (also matched) has none
    vi.mocked(auth.api.getSession).mockResolvedValue(null)
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ id: tomato.id }, { id: basil.id }])
    vi.mocked(prisma.crop.findMany).mockResolvedValue([tomato, basil] as never)
    vi.mocked(prisma.cropRelationship.findMany).mockResolvedValue([
      { id: 'r1', type: 'COMPANION', reason: null, confidence: 0.5, notes: null, cropA: basil, cropB: unknown },
    ] as never)
    vi.mocked(prisma.researchRequest.findMany).mockResolvedValue([])

    const res = await GET(makeGet('ba'))
    const body = await res.json()
    const plantIds = body.plants.map((p: { id: string }) => p.id)
    const noDataIds = body.noDataPlants.map((p: { id: string }) => p.id)
    expect(plantIds).toContain(basil.id)
    expect(noDataIds).toContain(tomato.id)
    expect(plantIds).not.toContain(tomato.id)
  })
})
