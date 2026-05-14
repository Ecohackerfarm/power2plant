import { describe, it, expect, vi } from 'vitest'
import { POST } from '@/app/api/recommend/route'

vi.mock('@/lib/prisma', () => ({
  default: {
    $queryRaw: vi.fn(),
    cropRelationship: { findMany: vi.fn() },
  },
}))

import prisma from '@/lib/prisma'

const fakeCrops = [
  { id: 'c1', name: 'Tomato', botanicalName: 'Solanum lycopersicum', minTempC: -1.1, commonNames: ['Tomato'] },
  { id: 'c2', name: 'Basil', botanicalName: 'Ocimum basilicum', minTempC: 5.0, commonNames: ['Basil'] },
]

const fakeRels = [
  { cropAId: 'c1', cropBId: 'c2', type: 'COMPANION', confidence: 0.8 },
]

describe('POST /api/recommend', () => {
  it('returns 400 for missing body fields', async () => {
    const req = new Request('http://localhost/api/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cropIds: ['c1'] }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 for empty cropIds', async () => {
    const req = new Request('http://localhost/api/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cropIds: [], bedCount: 2, bedCapacity: 3, minTempC: -10 }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when bedCount is NaN', async () => {
    const req = new Request('http://localhost/api/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cropIds: ['c1'], bedCount: NaN, bedCapacity: 3, minTempC: -10 }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when bedCount exceeds 100', async () => {
    const req = new Request('http://localhost/api/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cropIds: ['c1'], bedCount: 101, bedCapacity: 3, minTempC: -10 }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when bedCapacity exceeds 100', async () => {
    const req = new Request('http://localhost/api/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cropIds: ['c1'], bedCount: 2, bedCapacity: 101, minTempC: -10 }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns recommendation result for valid input', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue(fakeCrops)
    vi.mocked(prisma.cropRelationship.findMany).mockResolvedValue(fakeRels as any)

    const req = new Request('http://localhost/api/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cropIds: ['c1', 'c2'],
        bedCount: 2,
        bedCapacity: 3,
        minTempC: 10,
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.beds).toBeDefined()
    expect(body.overflow).toBeDefined()
    expect(body.conflicts).toBeDefined()
    expect(Array.isArray(body.alternatives)).toBe(true)
  })

  it('queries relationships only between the requested crops', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue(fakeCrops)
    vi.mocked(prisma.cropRelationship.findMany).mockResolvedValue([])

    const req = new Request('http://localhost/api/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cropIds: ['c1', 'c2'],
        bedCount: 1,
        bedCapacity: 3,
        minTempC: 10,
      }),
    })
    await POST(req)

    expect(prisma.cropRelationship.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { cropAId: { in: ['c1', 'c2'] } },
            { cropBId: { in: ['c1', 'c2'] } },
          ],
        },
      }),
    )
  })

  it('returns 400 when existingBeds is not an array', async () => {
    const req = new Request('http://localhost/api/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cropIds: ['c1'],
        bedCount: 2,
        bedCapacity: 3,
        minTempC: 10,
        existingBeds: 'not-an-array',
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when existingBed entry has too many ids', async () => {
    const req = new Request('http://localhost/api/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cropIds: ['c1'],
        bedCount: 2,
        bedCapacity: 3,
        minTempC: 10,
        existingBeds: [Array(21).fill('c1')],
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 200 happy path passes existingBeds through', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      ...fakeCrops,
      { id: 'c3', name: 'Carrot', botanicalName: 'Daucus carota', minTempC: -1.1, commonNames: ['Carrot'] },
    ])
    vi.mocked(prisma.cropRelationship.findMany).mockResolvedValue([])

    const req = new Request('http://localhost/api/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cropIds: ['c1', 'c2'],
        bedCount: 2,
        bedCapacity: 3,
        minTempC: 10,
        existingBeds: [['c1']],
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    // c1 must be in bed 0 (locked)
    expect(body.beds[0].crops.map((c: any) => c.id)).toContain('c1')
    // No alternatives when existingBeds locks the arrangement
    expect(body.alternatives).toEqual([])
  })
})
