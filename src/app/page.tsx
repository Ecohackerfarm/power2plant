'use client'
import { useState } from 'react'
import { useGarden } from '@/hooks/use-garden'
import { ZoneDetector } from '@/components/zone-detector'
import { PlantSearch } from '@/components/plant-search'
import { BedConfig } from '@/components/bed-config'
import { RecommendationDisplay } from '@/components/recommendation-display'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import type { RecommendResult } from '@/lib/recommend'
import { AuthPanel } from '@/components/auth-panel'

export default function Home() {
  const { state, setZone, addToWishlist, removeFromWishlist, setBeds } = useGarden()
  const [result, setResult] = useState<RecommendResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canRecommend = state.minTempC !== null && state.wishlist.length >= 2

  async function getRecommendations() {
    if (!canRecommend) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cropIds: state.wishlist,
          bedCount: state.bedCount,
          bedCapacity: state.bedCapacity,
          minTempC: state.minTempC,
        }),
      })
      if (!res.ok) throw new Error('Recommendation request failed.')
      setResult(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">power2plant</h1>
          <p className="text-muted-foreground mt-1">
            Companion planting recommendations for your garden beds.
          </p>
        </div>
        <AuthPanel />
      </div>

      <Separator />

      <ZoneDetector minTempC={state.minTempC} onZoneDetected={setZone} />

      <PlantSearch
        wishlistIds={state.wishlist}
        onAdd={addToWishlist}
        onRemove={removeFromWishlist}
      />

      <BedConfig
        bedCount={state.bedCount}
        bedCapacity={state.bedCapacity}
        onChange={setBeds}
      />

      <div className="flex items-center gap-4">
        <Button
          size="lg"
          onClick={getRecommendations}
          disabled={!canRecommend || loading}
        >
          {loading ? 'Calculating…' : 'Get Recommendations'}
        </Button>
        {!canRecommend && (
          <p className="text-sm text-muted-foreground">
            {state.minTempC === null
              ? 'Detect your zone first.'
              : 'Add at least 2 plants to your wishlist.'}
          </p>
        )}
      </div>

      {error && <p className="text-red-600">{error}</p>}

      {result && <RecommendationDisplay result={result} />}
    </main>
  )
}
