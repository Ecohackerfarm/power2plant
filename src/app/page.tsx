'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useGarden } from '@/hooks/use-garden'
import { ZoneDetector } from '@/components/zone-detector'
import { BedConfig } from '@/components/bed-config'
import { RecommendationDisplay } from '@/components/recommendation-display'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { PlantSearch } from '@/components/plant-search'
import { AuthPanel } from '@/components/auth-panel'
import { useSession } from '@/lib/auth-client'
import type { RecommendResult } from '@/lib/recommend'

type RecommendResponse = RecommendResult & { alternatives: RecommendResult[] }

export default function Home() {
  const { data: session } = useSession()
  const { state, hydrated, setZone, addToWishlist, removeFromWishlist, clearWishlist, setBeds } = useGarden()
  const [result, setResult] = useState<RecommendResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lockedBeds, setLockedBeds] = useState<string[][] | null>(null)
  const autoTriggered = useRef(false)

  const canRecommend = state.minTempC !== null && state.wishlist.length >= 2

  // Auto-trigger after plant page adds a companion and redirects with ?autoRecommend=1
  useEffect(() => {
    if (!hydrated || autoTriggered.current) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('autoRecommend') !== '1') return
    window.history.replaceState({}, '', '/')
    autoTriggered.current = true
    if (state.minTempC !== null && state.wishlist.length >= 2) {
      void getRecommendations()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated])

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
          ...(lockedBeds ? { existingBeds: lockedBeds } : {}),
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
          <div className="flex gap-4 text-sm text-muted-foreground mt-1">
            <Link href="/contribute" className="hover:text-foreground">
              Contribute an observation →
            </Link>
            <Link href="/relationships" className="hover:text-foreground">
              Browse observations →
            </Link>
          </div>
        </div>
        <AuthPanel />
      </div>

      <Separator />

      <div className="flex justify-center">
        <Link
          href="/garden"
          className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground px-8 h-9 text-sm font-medium hover:bg-primary/80 transition-colors"
        >
          My Garden →
        </Link>
      </div>

      {lockedBeds && (
        <div className="flex items-center gap-3 rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">
          <span>Adding to your existing garden.</span>
          <button
            className="ml-auto underline hover:no-underline"
            onClick={() => setLockedBeds(null)}
          >
            Start fresh
          </button>
        </div>
      )}

      <ZoneDetector minTempC={state.minTempC} onZoneDetected={setZone} />

      <PlantSearch
        wishlistIds={state.wishlist}
        onAdd={addToWishlist}
        onRemove={removeFromWishlist}
        onClearAll={clearWishlist}
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

      {result && (
        <RecommendationDisplay
          result={result}
          alternatives={result.alternatives}
        />
      )}
    </main>
  )
}