import { describe, it, expect, vi } from 'vitest'
import { POST } from '@/app/api/recommend/route'

vi.mock('@/lib/prisma', () => ({
  default: {
    crop: { findMany: vi.fn() },
    cropRelationship: { findMany: vi.fn() },
  },
}))

import prisma from '@/lib/prisma'

const fakeCrops = [
  { id: 'c1', name: 'Tomato', botanicalName: 'Solanum lycopersicum', minTempC: -1.1 },
  { id: 'c2', name: 'Basil', botanicalName: 'Ocimum basilicum', minTempC: 5.0 },
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

  it('returns recommendation result for valid input', async () => {
    vi.mocked(prisma.crop.findMany).mockResolvedValue(fakeCrops as any)
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
  })

  it('queries relationships only between the requested crops', async () => {
    vi.mocked(prisma.crop.findMany).mockResolvedValue(fakeCrops as any)
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
})
