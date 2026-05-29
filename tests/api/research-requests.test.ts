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
    researchRequest: { findMany: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    researchRequestVote: { findUnique: vi.fn(), create: vi.fn() },
    crop: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}))

import prisma from '@/lib/prisma'
import { auth } from '@/lib/auth'

const fakeSession = { user: { id: 'user-1', email: 'a@b.com' } }

const fakeItem = {
  id: 'rr-1', cropAId: 'crop-a', cropBId: 'crop-b', voteCount: 2, createdAt: new Date(),
  cropA: { id: 'crop-a', name: 'Tomato', botanicalName: 'Solanum lycopersicum', commonNames: [] },
  cropB: { id: 'crop-b', name: 'Basil', botanicalName: 'Ocimum basilicum', commonNames: [] },
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

describe('GET /api/research-requests', () => {
  it('returns list with hasVoted:false for unauthenticated user', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null)
    vi.mocked(prisma.researchRequest.findMany).mockResolvedValue([fakeItem] as never)
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].hasVoted).toBe(false)
  })

  it('returns hasVoted:true when authenticated user has voted', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as never)
    vi.mocked(prisma.researchRequest.findMany).mockResolvedValue([
      { ...fakeItem, votes: [{ id: 'v-1' }] },
    ] as never)
    const res = await GET()
    const body = await res.json()
    expect(body[0].hasVoted).toBe(true)
  })

  it('returns hasVoted:false when authenticated user has not voted', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as never)
    vi.mocked(prisma.researchRequest.findMany).mockResolvedValue([
      { ...fakeItem, votes: [] },
    ] as never)
    const res = await GET()
    const body = await res.json()
    expect(body[0].hasVoted).toBe(false)
  })

  it('does not expose votes array in response', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null)
    vi.mocked(prisma.researchRequest.findMany).mockResolvedValue([fakeItem] as never)
    const res = await GET()
    const body = await res.json()
    expect(body[0].votes).toBeUndefined()
  })
})

describe('POST /api/research-requests', () => {
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
    vi.mocked(prisma.crop.findUnique)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'crop-b' } as never)
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
    vi.mocked(prisma.researchRequest.upsert).mockResolvedValue({ id: 'rr-1', voteCount: 0 } as never)
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
    vi.mocked(prisma.researchRequest.upsert).mockResolvedValue({ id: 'rr-1', voteCount: 3 } as never)
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
    vi.mocked(prisma.researchRequest.upsert).mockResolvedValue({ id: 'rr-1', voteCount: 0 } as never)
    vi.mocked(prisma.researchRequestVote.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.researchRequestVote.create).mockResolvedValue({} as never)
    vi.mocked(prisma.researchRequest.update).mockResolvedValue({ id: 'rr-1', voteCount: 1 } as never)
    // Post with Z before A — should be normalised
    await POST(makePost({ cropAId: 'zzz-crop', cropBId: 'aaa-crop' }))
    const upsertCall = vi.mocked(prisma.researchRequest.upsert).mock.calls[0][0]
    const key = upsertCall.where.cropAId_cropBId!
    expect(key.cropAId).toBe('aaa-crop')
    expect(key.cropBId).toBe('zzz-crop')
  })
})
