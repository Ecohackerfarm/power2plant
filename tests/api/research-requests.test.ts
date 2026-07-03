import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from '@/app/api/research-requests/route'

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}))

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}))

vi.mock('@/lib/prisma', () => ({
  default: {
    researchRequest: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    researchRequestVote: { findUnique: vi.fn(), create: vi.fn() },
    crop: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}))

import prisma from '@/lib/prisma'
import { auth } from '@/lib/auth'

const fakeSession = { user: { id: 'user-1', email: 'a@b.com' } }

const fakePairItem = {
  id: 'rr-1', cropAId: 'crop-a', cropBId: 'crop-b', voteCount: 2, createdAt: new Date(),
  cropA: { id: 'crop-a', name: 'Tomato', botanicalName: 'Solanum lycopersicum', commonNames: [] },
  cropB: { id: 'crop-b', name: 'Basil', botanicalName: 'Ocimum basilicum', commonNames: [] },
  votes: [],
}

const fakeSingleItem = {
  id: 'rr-2', cropAId: 'crop-a', cropBId: null, voteCount: 1, createdAt: new Date(),
  cropA: { id: 'crop-a', name: 'Tomato', botanicalName: 'Solanum lycopersicum', commonNames: [] },
  cropB: null,
  votes: [],
}

function makePost(body: object) {
  return new Request('http://localhost/api/research-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => vi.clearAllMocks())

// ── GET ──────────────────────────────────────────────────────────────────────

describe('GET /api/research-requests', () => {
  it('returns list with hasVoted:false for unauthenticated user', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null)
    vi.mocked(prisma.researchRequest.findMany).mockResolvedValue([fakePairItem] as never)
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].hasVoted).toBe(false)
  })

  it('returns hasVoted:true when authenticated user has voted', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as never)
    vi.mocked(prisma.researchRequest.findMany).mockResolvedValue([
      { ...fakePairItem, votes: [{ id: 'v-1' }] },
    ] as never)
    const res = await GET()
    const body = await res.json()
    expect(body[0].hasVoted).toBe(true)
  })

  it('returns hasVoted:false when authenticated user has not voted', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as never)
    vi.mocked(prisma.researchRequest.findMany).mockResolvedValue([
      { ...fakePairItem, votes: [] },
    ] as never)
    const res = await GET()
    const body = await res.json()
    expect(body[0].hasVoted).toBe(false)
  })

  it('does not expose votes array in response', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null)
    vi.mocked(prisma.researchRequest.findMany).mockResolvedValue([fakePairItem] as never)
    const res = await GET()
    const body = await res.json()
    expect(body[0].votes).toBeUndefined()
  })

  it('returns null cropB for single-plant requests', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null)
    vi.mocked(prisma.researchRequest.findMany).mockResolvedValue([fakeSingleItem] as never)
    const res = await GET()
    const body = await res.json()
    expect(body[0].cropBId).toBeNull()
    expect(body[0].cropB).toBeNull()
  })
})

// ── POST pair ─────────────────────────────────────────────────────────────────

describe('POST /api/research-requests — pair', () => {
  it('returns 401 for unauthenticated request', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null)
    const res = await POST(makePost({ cropAId: 'crop-a', cropBId: 'crop-b' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when body is missing', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as never)
    const res = await POST(new Request('http://localhost/api/research-requests', { method: 'POST' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when cropAId and cropBId are the same', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as never)
    const res = await POST(makePost({ cropAId: 'crop-a', cropBId: 'crop-a' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when cropAId is not a string', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as never)
    const res = await POST(makePost({ cropAId: 123, cropBId: 'crop-b' }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when cropA not found', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as never)
    vi.mocked(prisma.crop.findUnique).mockResolvedValueOnce(null)
    const res = await POST(makePost({ cropAId: 'crop-a', cropBId: 'crop-b' }))
    expect(res.status).toBe(404)
  })

  it('returns 404 when cropB not found', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as never)
    vi.mocked(prisma.crop.findUnique)
      .mockResolvedValueOnce({ id: 'crop-a' } as never)
      .mockResolvedValueOnce(null)
    const res = await POST(makePost({ cropAId: 'crop-a', cropBId: 'crop-b' }))
    expect(res.status).toBe(404)
  })

  it('creates vote and returns voteCount on first vote', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as never)
    vi.mocked(prisma.crop.findUnique).mockResolvedValue({ id: 'x' } as never)
    vi.mocked(prisma.$transaction).mockImplementation(fn => fn(prisma as never))
    vi.mocked(prisma.researchRequest.findFirst).mockResolvedValue({ id: 'rr-1', voteCount: 0 } as never)
    vi.mocked(prisma.researchRequestVote.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.researchRequestVote.create).mockResolvedValue({} as never)
    vi.mocked(prisma.researchRequest.update).mockResolvedValue({ id: 'rr-1', voteCount: 1 } as never)
    const res = await POST(makePost({ cropAId: 'crop-a', cropBId: 'crop-b' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.alreadyVoted).toBe(false)
    expect(body.voteCount).toBe(1)
  })

  it('returns alreadyVoted:true and does not increment on re-vote', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as never)
    vi.mocked(prisma.crop.findUnique).mockResolvedValue({ id: 'x' } as never)
    vi.mocked(prisma.$transaction).mockImplementation(fn => fn(prisma as never))
    vi.mocked(prisma.researchRequest.findFirst).mockResolvedValue({ id: 'rr-1', voteCount: 3 } as never)
    vi.mocked(prisma.researchRequestVote.findUnique).mockResolvedValue({ id: 'v-1' } as never)
    const res = await POST(makePost({ cropAId: 'crop-a', cropBId: 'crop-b' }))
    const body = await res.json()
    expect(body.alreadyVoted).toBe(true)
    expect(body.voteCount).toBe(3)
    expect(prisma.researchRequestVote.create).not.toHaveBeenCalled()
    expect(prisma.researchRequest.update).not.toHaveBeenCalled()
  })

  it('normalises ID order so cropAId < cropBId lexicographically', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as never)
    vi.mocked(prisma.crop.findUnique).mockResolvedValue({ id: 'x' } as never)
    vi.mocked(prisma.$transaction).mockImplementation(fn => fn(prisma as never))
    vi.mocked(prisma.researchRequest.findFirst).mockResolvedValue({ id: 'rr-1', voteCount: 0 } as never)
    vi.mocked(prisma.researchRequestVote.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.researchRequestVote.create).mockResolvedValue({} as never)
    vi.mocked(prisma.researchRequest.update).mockResolvedValue({ id: 'rr-1', voteCount: 1 } as never)
    await POST(makePost({ cropAId: 'zzz-crop', cropBId: 'aaa-crop' }))
    const findCall = vi.mocked(prisma.researchRequest.findFirst).mock.calls[0]![0]!
    expect(findCall.where!.cropAId).toBe('aaa-crop')
    expect(findCall.where!.cropBId).toBe('zzz-crop')
  })

  it('creates the request if none exists yet', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as never)
    vi.mocked(prisma.crop.findUnique).mockResolvedValue({ id: 'x' } as never)
    vi.mocked(prisma.$transaction).mockImplementation(fn => fn(prisma as never))
    vi.mocked(prisma.researchRequest.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.researchRequest.create).mockResolvedValue({ id: 'rr-new', voteCount: 0 } as never)
    vi.mocked(prisma.researchRequestVote.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.researchRequestVote.create).mockResolvedValue({} as never)
    vi.mocked(prisma.researchRequest.update).mockResolvedValue({ id: 'rr-new', voteCount: 1 } as never)
    const res = await POST(makePost({ cropAId: 'crop-a', cropBId: 'crop-b' }))
    expect(res.status).toBe(200)
    expect(prisma.researchRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ cropAId: 'crop-a', cropBId: 'crop-b' }) })
    )
  })
})

// ── POST single-plant ─────────────────────────────────────────────────────────

describe('POST /api/research-requests — single plant', () => {
  it('accepts request without cropBId', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as never)
    vi.mocked(prisma.crop.findUnique).mockResolvedValue({ id: 'crop-a' } as never)
    vi.mocked(prisma.$transaction).mockImplementation(fn => fn(prisma as never))
    vi.mocked(prisma.researchRequest.findFirst).mockResolvedValue({ id: 'rr-1', voteCount: 0 } as never)
    vi.mocked(prisma.researchRequestVote.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.researchRequestVote.create).mockResolvedValue({} as never)
    vi.mocked(prisma.researchRequest.update).mockResolvedValue({ id: 'rr-1', voteCount: 1 } as never)
    const res = await POST(makePost({ cropAId: 'crop-a' }))
    expect(res.status).toBe(200)
  })

  it('accepts request with explicit null cropBId', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as never)
    vi.mocked(prisma.crop.findUnique).mockResolvedValue({ id: 'crop-a' } as never)
    vi.mocked(prisma.$transaction).mockImplementation(fn => fn(prisma as never))
    vi.mocked(prisma.researchRequest.findFirst).mockResolvedValue({ id: 'rr-1', voteCount: 0 } as never)
    vi.mocked(prisma.researchRequestVote.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.researchRequestVote.create).mockResolvedValue({} as never)
    vi.mocked(prisma.researchRequest.update).mockResolvedValue({ id: 'rr-1', voteCount: 1 } as never)
    const res = await POST(makePost({ cropAId: 'crop-a', cropBId: null }))
    expect(res.status).toBe(200)
  })

  it('queries findFirst with cropBId: null for single-plant', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as never)
    vi.mocked(prisma.crop.findUnique).mockResolvedValue({ id: 'x' } as never)
    vi.mocked(prisma.$transaction).mockImplementation(fn => fn(prisma as never))
    vi.mocked(prisma.researchRequest.findFirst).mockResolvedValue({ id: 'rr-1', voteCount: 0 } as never)
    vi.mocked(prisma.researchRequestVote.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.researchRequestVote.create).mockResolvedValue({} as never)
    vi.mocked(prisma.researchRequest.update).mockResolvedValue({ id: 'rr-1', voteCount: 1 } as never)
    await POST(makePost({ cropAId: 'crop-a' }))
    const findCall = vi.mocked(prisma.researchRequest.findFirst).mock.calls[0]![0]!
    expect(findCall.where!.cropAId).toBe('crop-a')
    expect(findCall.where!.cropBId).toBeNull()
  })

  it('creates single-plant request with null cropBId', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as never)
    vi.mocked(prisma.crop.findUnique).mockResolvedValue({ id: 'x' } as never)
    vi.mocked(prisma.$transaction).mockImplementation(fn => fn(prisma as never))
    vi.mocked(prisma.researchRequest.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.researchRequest.create).mockResolvedValue({ id: 'rr-new', voteCount: 0 } as never)
    vi.mocked(prisma.researchRequestVote.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.researchRequestVote.create).mockResolvedValue({} as never)
    vi.mocked(prisma.researchRequest.update).mockResolvedValue({ id: 'rr-new', voteCount: 1 } as never)
    await POST(makePost({ cropAId: 'crop-a' }))
    expect(prisma.researchRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ cropAId: 'crop-a', cropBId: null }) })
    )
  })

  it('returns 404 when cropA not found for single-plant request', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as never)
    vi.mocked(prisma.crop.findUnique).mockResolvedValue(null)
    const res = await POST(makePost({ cropAId: 'unknown' }))
    expect(res.status).toBe(404)
  })

  it('does not lookup cropB when cropBId absent', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as never)
    vi.mocked(prisma.crop.findUnique).mockResolvedValue({ id: 'x' } as never)
    vi.mocked(prisma.$transaction).mockImplementation(fn => fn(prisma as never))
    vi.mocked(prisma.researchRequest.findFirst).mockResolvedValue({ id: 'rr-1', voteCount: 0 } as never)
    vi.mocked(prisma.researchRequestVote.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.researchRequestVote.create).mockResolvedValue({} as never)
    vi.mocked(prisma.researchRequest.update).mockResolvedValue({ id: 'rr-1', voteCount: 1 } as never)
    await POST(makePost({ cropAId: 'crop-a' }))
    // Only one findUnique call (for cropA), not two
    expect(prisma.crop.findUnique).toHaveBeenCalledTimes(1)
  })
})
