// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('@/lib/auth-client', () => ({
  useSession: vi.fn(() => ({ data: null, isPending: false, error: null })),
}))

import { useGarden } from '@/hooks/use-garden'
import { useSession } from '@/lib/auth-client'

// Reset localStorage before each test
beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  vi.mocked(useSession).mockReturnValue({ data: null, isPending: false, error: null } as any)
})

describe('useGarden()', () => {
  it('returns default state when localStorage is empty', () => {
    const { result } = renderHook(() => useGarden())
    expect(result.current.state.bedCount).toBe(3)
    expect(result.current.state.bedCapacity).toBe(3)
    expect(result.current.state.wishlist).toEqual([])
    expect(result.current.state.minTempC).toBeNull()
  })

  it('setZone updates lat, lng, and minTempC', () => {
    const { result } = renderHook(() => useGarden())
    act(() => result.current.setZone(51.5, -0.1, -12.2))
    expect(result.current.state.lat).toBeCloseTo(51.5)
    expect(result.current.state.lng).toBeCloseTo(-0.1)
    expect(result.current.state.minTempC).toBeCloseTo(-12.2)
  })

  it('addToWishlist adds a crop id', () => {
    const { result } = renderHook(() => useGarden())
    act(() => result.current.addToWishlist('crop-1'))
    expect(result.current.state.wishlist).toContain('crop-1')
  })

  it('addToWishlist does not add duplicates', () => {
    const { result } = renderHook(() => useGarden())
    act(() => {
      result.current.addToWishlist('crop-1')
      result.current.addToWishlist('crop-1')
    })
    expect(result.current.state.wishlist.filter(id => id === 'crop-1')).toHaveLength(1)
  })

  it('removeFromWishlist removes a crop id', () => {
    const { result } = renderHook(() => useGarden())
    act(() => {
      result.current.addToWishlist('crop-1')
      result.current.removeFromWishlist('crop-1')
    })
    expect(result.current.state.wishlist).not.toContain('crop-1')
  })

  it('setBeds updates bedCount and bedCapacity', () => {
    const { result } = renderHook(() => useGarden())
    act(() => result.current.setBeds(5, 4))
    expect(result.current.state.bedCount).toBe(5)
    expect(result.current.state.bedCapacity).toBe(4)
  })

  it('persists state in localStorage', () => {
    const { result } = renderHook(() => useGarden())
    act(() => result.current.addToWishlist('crop-persist'))

    // Re-render as if page reloaded
    const { result: result2 } = renderHook(() => useGarden())
    expect(result2.current.state.wishlist).toContain('crop-persist')
  })

  it('fetches garden from DB when session exists', async () => {
    vi.mocked(useSession).mockReturnValue({
      data: { user: { id: 'u1', email: 'a@b.com', name: 'A' }, session: { id: 's1' } as any },
      isPending: false,
      error: null,
    } as any)

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ lat: 48.8, lng: 2.3, minTempC: -8.0, bedCount: 4, bedCapacity: 5 }),
    } as Response)
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useGarden())
    await act(async () => {
      await new Promise(r => setTimeout(r, 50))
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/garden')
    expect(result.current.state.lat).toBeCloseTo(48.8)
    expect(result.current.state.bedCount).toBe(4)
  })

  it('does not fetch from DB when no session', async () => {
    vi.mocked(useSession).mockReturnValue({ data: null, isPending: false, error: null } as any)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    renderHook(() => useGarden())
    await act(async () => {
      await new Promise(r => setTimeout(r, 50))
    })

    const gardenFetches = fetchMock.mock.calls.filter(
      (args: unknown[]) => args[0] === '/api/garden',
    )
    expect(gardenFetches).toHaveLength(0)
  })
})
