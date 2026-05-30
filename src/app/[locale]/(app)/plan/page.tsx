'use client'
import { useState, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { useGarden } from '@/hooks/use-garden'
import { useInspirations } from '@/hooks/use-inspirations'
import { ZoneDetector } from '@/components/zone-detector'
import { BedConfig } from '@/components/bed-config'
import { RecommendationDisplay } from '@/components/recommendation-display'
import { Button } from '@/components/ui/button'
import { PlantSearch } from '@/components/plant-search'
import { useSession } from '@/lib/auth-client'
import type { RecommendResult } from '@/lib/recommend'

type RecommendResponse = RecommendResult & { alternatives: RecommendResult[] }

export default function PlanPage() {
  const t = useTranslations('Home')
  const { data: session } = useSession()
  const { state, hydrated, setZone, addToWishlist, removeFromWishlist, clearWishlist, setBeds } = useGarden()
  const { inspirationIds, add: addInspiration, remove: removeInspiration } = useInspirations()
  const [result, setResult] = useState<RecommendResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lockedBeds, setLockedBeds] = useState<string[][] | null>(null)
  const [searchQuery, setSearchQuery] = useState<string | undefined>(undefined)
  const autoTriggered = useRef(false)

  const canRecommend = state.minTempC !== null && state.wishlist.length >= 2

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const q = params.get('q')
    if (q) setSearchQuery(q)
  }, [])

  useEffect(() => {
    if (!hydrated || autoTriggered.current) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('autoRecommend') !== '1') return
    window.history.replaceState({}, '', window.location.pathname)
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
      <div className="flex justify-center">
        <Link
          href="/garden"
          className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground px-8 h-9 text-sm font-medium hover:bg-primary/80 transition-colors"
        >
          {t('myGarden')}
        </Link>
      </div>

      {lockedBeds && (
        <div className="flex items-center gap-3 rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">
          <span>{t('addingToGarden')}</span>
          <button
            className="ml-auto underline hover:no-underline"
            onClick={() => setLockedBeds(null)}
          >
            {t('startFresh')}
          </button>
        </div>
      )}

      <ZoneDetector minTempC={state.minTempC} onZoneDetected={setZone} />

      <PlantSearch
        wishlistIds={state.wishlist}
        onAdd={addToWishlist}
        onRemove={removeFromWishlist}
        onClearAll={clearWishlist}
        initialQuery={searchQuery}
        inspirationIds={inspirationIds}
        onInspire={addInspiration}
        onUninspire={removeInspiration}
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
          {loading ? t('calculating') : t('getRecommendations')}
        </Button>
        {!canRecommend && (
          <p className="text-sm text-muted-foreground">
            {state.minTempC === null ? t('detectZoneFirst') : t('addAtLeast2')}
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