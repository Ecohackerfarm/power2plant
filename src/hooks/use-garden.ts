'use client'
import { useState, useCallback, useEffect } from 'react'
import { type GardenState, DEFAULT_STATE, loadState, saveState } from '@/lib/garden-state'

export function useGarden() {
  const [state, setState] = useState<GardenState>(DEFAULT_STATE)

  useEffect(() => {
    setState(loadState())
  }, [])

  function update(patch: Partial<GardenState>) {
    setState(prev => {
      const next = { ...prev, ...patch }
      saveState(next)
      return next
    })
  }

  const setZone = useCallback((lat: number, lng: number, minTempC: number) => {
    update({ lat, lng, minTempC })
  }, [])

  const addToWishlist = useCallback((cropId: string) => {
    setState(prev => {
      if (prev.wishlist.includes(cropId)) return prev
      const next = { ...prev, wishlist: [...prev.wishlist, cropId] }
      saveState(next)
      return next
    })
  }, [])

  const removeFromWishlist = useCallback((cropId: string) => {
    setState(prev => {
      const next = { ...prev, wishlist: prev.wishlist.filter(id => id !== cropId) }
      saveState(next)
      return next
    })
  }, [])

  const setBeds = useCallback((bedCount: number, bedCapacity: number) => {
    update({ bedCount, bedCapacity })
  }, [])

  return { state, setZone, addToWishlist, removeFromWishlist, setBeds }
}
