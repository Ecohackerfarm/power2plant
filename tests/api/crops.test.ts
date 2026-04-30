import { describe, it, expect, vi } from 'vitest'
import { GET } from '@/app/api/crops/route'

vi.mock('@/lib/prisma', () => ({
  default: {
    crop: {
      findMany: vi.fn(),
    },
  },
}))

import prisma from '@/lib/prisma'

const fakeCrops = [
  { id: '1', name: 'Tomato', botanicalName: 'Solanum lycopersicum', minTempC: -1.1 },
  { id: '2', name: 'Roma Tomato', botanicalName: 'Solanum lycopersicum var. Roma', minTempC: -1.1 },
]

describe('GET /api/crops', () => {
  it('returns 400 when q is missing', async () => {
    const req = new Request('http://localhost/api/crops')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when q is less than 2 characters', async () => {
    const req = new Request('http://localhost/api/crops?q=t')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('calls prisma with case-insensitive contains and returns results', async () => {
    vi.mocked(prisma.crop.findMany).mockResolvedValue(fakeCrops as any)

    const req = new Request('http://localhost/api/crops?q=tomato')
    const res = await GET(req)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.crops).toHaveLength(2)
    expect(body.crops[0].name).toBe('Tomato')

    expect(prisma.crop.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { name: { contains: 'tomato', mode: 'insensitive' } },
            { botanicalName: { contains: 'tomato', mode: 'insensitive' } },
          ],
        },
        take: 20,
      })
    )
  })

  it('returns empty array when no crops match', async () => {
    vi.mocked(prisma.crop.findMany).mockResolvedValue([])
    const req = new Request('http://localhost/api/crops?q=xyznonexistent')
    const res = await GET(req)
    const body = await res.json()
    expect(body.crops).toEqual([])
  })
})
