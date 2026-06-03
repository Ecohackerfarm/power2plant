'use client'
import { useState, useEffect, useCallback } from 'react'
import { useSession } from '@/lib/auth-client'

export function useInspirations() {
  const { data: session } = useSession()
  const [inspirationIds, setInspirationIds] = useState<string[]>([])

  useEffect(() => {
    if (!session) { setInspirationIds([]); return }
    fetch('/api/garden/inspirations')
      .then(r => r.ok ? r.json() : null)
      .then((data: { inspirations: { id: string }[] } | null) => {
        if (data) setInspirationIds(data.inspirations.map(c => c.id))
      })
      .catch(() => {})
  }, [session?.session.id])

  const add = useCallback(async (cropId: string) => {
    setInspirationIds(prev => prev.includes(cropId) ? prev : [...prev, cropId])
    await fetch('/api/garden/inspirations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cropId, action: 'add' }),
    }).catch(() => {})
  }, [])

  const remove = useCallback(async (cropId: string) => {
    setInspirationIds(prev => prev.filter(id => id !== cropId))
    await fetch('/api/garden/inspirations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cropId, action: 'remove' }),
    }).catch(() => {})
  }, [])

  return { inspirationIds, add, remove }
}
