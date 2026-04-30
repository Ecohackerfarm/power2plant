// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGarden } from '@/hooks/use-garden'

beforeEach(() => {
  localStorage.clear()
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
})
