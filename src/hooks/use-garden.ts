'use client'
import { useState, useCallback, useEffect, useRef } from 'react'
import { type GardenState, DEFAULT_STATE, loadState, saveState } from '@/lib/garden-state'
import { useSession } from '@/lib/auth-client'

export function useGarden() {
  const [state, setState] = useState<GardenState>(DEFAULT_STATE)
  const [hydrated, setHydrated] = useState(false)
  const { data: session } = useSession()

  // Hydrate from localStorage on mount
  useEffect(() => {
    setState(loadState())
    setHydrated(true)
  }, [])

  // Pull from DB when session loads
  useEffect(() => {
    if (!session) return
    fetch('/api/garden')
      .then(r => (r.ok ? r.json() : null))
      .then((data: { lat?: number; lng?: number; minTempC?: number; bedCount?: number; bedCapacity?: number } | null) => {
        if (!data) return
        setState(prev => {
          const next = {
            ...prev,
            lat: data.lat ?? prev.lat,
            lng: data.lng ?? prev.lng,
            minTempC: data.minTempC ?? prev.minTempC,
            bedCount: data.bedCount ?? prev.bedCount,
            bedCapacity: data.bedCapacity ?? prev.bedCapacity,
          }
          saveState(next)
          return next
        })
      })
      .catch(() => {/* network error — keep local state */})
  }, [session?.session.id])

  // Push zone+beds to DB on change (debounced 500ms)
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!hydrated || !session) return
    if (pushTimer.current) clearTimeout(pushTimer.current)
    pushTimer.current = setTimeout(() => {
      fetch('/api/garden', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: state.lat,
          lng: state.lng,
          minTempC: state.minTempC,
          bedCount: state.bedCount,
          bedCapacity: state.bedCapacity,
        }),
      }).catch(() => {/* network error — ignore */})
    }, 500)
    return () => {
      if (pushTimer.current) clearTimeout(pushTimer.current)
    }
  }, [state.lat, state.lng, state.minTempC, state.bedCount, state.bedCapacity, session, hydrated])

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
