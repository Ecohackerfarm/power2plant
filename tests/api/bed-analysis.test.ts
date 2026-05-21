import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/garden/bed-analysis/route'

vi.mock('@/lib/prisma', () => ({
  default: {
    userGarden: { findUnique: vi.fn() },
    $queryRaw: vi.fn(),
  },
}))

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}))

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue({ user: { id: 'user-1', email: 'test@example.com' } }),
    },
  },
}))

import prisma from '@/lib/prisma'

function makeReq() {
  return new Request('http://localhost/api/garden/bed-analysis')
}

beforeEach(() => vi.clearAllMocks())

describe('GET /api/garden/bed-analysis', () => {
  it('returns 401 when no session', async () => {
    const { auth } = await import('@/lib/auth')
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns empty beds when no garden', async () => {
    vi.mocked(prisma.userGarden.findUnique).mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.beds).toEqual([])
  })

  it('skips beds with fewer than 2 plants', async () => {
    vi.mocked(prisma.userGarden.findUnique).mockResolvedValue({
      id: 'g1',
      beds: [{ id: 'bed-1', plantings: [{ cropId: 'crop-a' }] }],
    } as never)
    const res = await GET()
    const body = await res.json()
    expect(body.beds).toEqual([])
    expect(prisma.$queryRaw).not.toHaveBeenCalled()
  })

  it('returns companion and antagonist pairs for a bed', async () => {
    vi.mocked(prisma.userGarden.findUnique).mockResolvedValue({
      id: 'g1',
      beds: [{
        id: 'bed-1',
        plantings: [{ cropId: 'crop-a' }, { cropId: 'crop-b' }, { cropId: 'crop-c' }],
      }],
    } as never)
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { id: 'rel-1', type: 'COMPANION', confidence: 4, reason: null, cropAId: 'crop-a', cropBId: 'crop-b', cropAName: 'Basil', cropBName: 'Tomato' },
      { id: 'rel-2', type: 'AVOID', confidence: 2, reason: null, cropAId: 'crop-a', cropBId: 'crop-c', cropAName: 'Basil', cropBName: 'Fennel' },
    ] as never)
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.beds).toHaveLength(1)
    const bed = body.beds[0]
    expect(bed.bedId).toBe('bed-1')
    expect(bed.companions).toHaveLength(1)
    expect(bed.companions[0].cropAName).toBe('Basil')
    expect(bed.antagonists).toHaveLength(1)
    expect(bed.antagonists[0].cropBName).toBe('Fennel')
    // crop-b and crop-c have no relationship → 1 unknown pair
    expect(bed.unknownCount).toBe(1)
  })

  it('counts unknown pairs correctly', async () => {
    vi.mocked(prisma.userGarden.findUnique).mockResolvedValue({
      id: 'g1',
      beds: [{ id: 'bed-1', plantings: [{ cropId: 'a' }, { cropId: 'b' }, { cropId: 'c' }] }],
    } as never)
    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as never) // no relationships at all
    const res = await GET()
    const body = await res.json()
    // 3 plants → 3 pairs, all unknown
    expect(body.beds[0].unknownCount).toBe(3)
  })
})
