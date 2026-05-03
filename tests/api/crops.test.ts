import { describe, it, expect, vi } from 'vitest'
import { GET } from '@/app/api/crops/route'

vi.mock('@/lib/prisma', () => ({
  default: {
    $queryRaw: vi.fn(),
  },
}))

import prisma from '@/lib/prisma'

const makeCrop = (overrides: Partial<{
  id: string; name: string; botanicalName: string; minTempC: number | null
  isCommonCrop: boolean; commonNames: string[]
}>) => ({
  id: '1',
  name: 'Tomato',
  botanicalName: 'Solanum lycopersicum',
  minTempC: -1.1,
  isCommonCrop: true,
  commonNames: ['Tomato', 'Garden Tomato'],
  ...overrides,
})

const fakeCrops = [
  makeCrop({ id: '1', name: 'Tomato', botanicalName: 'Solanum lycopersicum', commonNames: ['Tomato', 'Garden Tomato'] }),
  makeCrop({ id: '2', name: 'Roma Tomato', botanicalName: 'Solanum lycopersicum var. Roma', commonNames: ['Roma Tomato'] }),
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

  it('queries DB and returns ranked results', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue(fakeCrops)

    const req = new Request('http://localhost/api/crops?q=tomato')
    const res = await GET(req)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.crops).toHaveLength(2)
    expect(body.crops[0].name).toBe('Tomato')
    expect(body.crops[0].commonNames).toEqual(['Tomato', 'Garden Tomato'])
  })

  it('returns empty array when no crops match', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([])
    const req = new Request('http://localhost/api/crops?q=xyznonexistent')
    const res = await GET(req)
    const body = await res.json()
    expect(body.crops).toEqual([])
  })

  it('fetches crops by ids for wishlist rehydration', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue(fakeCrops)
    const req = new Request('http://localhost/api/crops?ids=1,2')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.crops).toHaveLength(2)
    expect(prisma.$queryRaw).toHaveBeenCalled()
  })

  it('returns empty array for ids= with no valid ids', async () => {
    const req = new Request('http://localhost/api/crops?ids=')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.crops).toEqual([])
  })

  it('limits results to 20', async () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      makeCrop({ id: String(i), name: `Crop ${i}`, botanicalName: `Species ${i}`, commonNames: [] }),
    )
    vi.mocked(prisma.$queryRaw).mockResolvedValue(many)
    const req = new Request('http://localhost/api/crops?q=crop')
    const res = await GET(req)
    const body = await res.json()
    expect(body.crops).toHaveLength(20)
  })
})
