'use client'
import { useState, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { useGarden } from '@/hooks/use-garden'
import { RecommendationDisplay } from '@/components/recommendation-display'
import { Button } from '@/components/ui/button'
import type { RecommendResult } from '@/lib/recommend'

type RecommendResponse = RecommendResult & { alternatives: RecommendResult[] }

const CACHE_KEY = 'power2plant:last-result'

interface CachedResult {
  inputs: string
  result: RecommendResponse
}

function inputsKey(wishlist: string[], bedCount: number, bedCapacity: number, minTempC: number | null) {
  return JSON.stringify({ w: [...wishlist].sort(), bc: bedCount, bp: bedCapacity, t: minTempC })
}

export default function PlanResultsPage() {
  const t = useTranslations('Plan')
  const router = useRouter()
  const { state, hydrated } = useGarden()
  const [result, setResult] = useState<RecommendResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lockedBeds, setLockedBeds] = useState<string[][] | null>(null)
  const autoTriggered = useRef(false)

  const canRecommend = state.minTempC !== null && state.wishlist.length >= 2

  // Restore from cache on mount (handles browser back)
  useEffect(() => {
    if (!hydrated) return
    try {
      const raw = sessionStorage.getItem(CACHE_KEY)
      if (!raw) return
      const cached: CachedResult = JSON.parse(raw)
      const current = inputsKey(state.wishlist, state.bedCount, state.bedCapacity, state.minTempC)
      if (cached.inputs === current) setResult(cached.result)
    } catch {
      // ignore
    }
  }, [hydrated]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-compute when navigating forward (?compute=1)
  useEffect(() => {
    if (!hydrated || autoTriggered.current || result) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('compute') !== '1') return
    window.history.replaceState({}, '', window.location.pathname)
    autoTriggered.current = true
    if (canRecommend) void compute()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated])

  async function compute() {
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
      const data: RecommendResponse = await res.json()
      setResult(data)
      // Cache for browser-back restore
      try {
        const entry: CachedResult = {
          inputs: inputsKey(state.wishlist, state.bedCount, state.bedCapacity, state.minTempC),
          result: data,
        }
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(entry))
      } catch {
        // quota — ignore
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <button className="hover:text-foreground" onClick={() => router.push('/plan/beds')}>
          {t('back')}
        </button>
        <span>{t('step', { n: 4 })}</span>
      </div>

      {lockedBeds && (
        <div className="flex items-center gap-3 rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">
          <span>{t('addingToGarden')}</span>
          <button className="ml-auto underline hover:no-underline" onClick={() => setLockedBeds(null)}>
            {t('startFresh')}
          </button>
        </div>
      )}

      {!result && (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Button
              size="lg"
              variant="outline"
              onClick={compute}
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
        </div>
      )}

      {result && (
        <>
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={() => void compute()} disabled={loading}>
              {loading ? t('calculating') : t('recompute')}
            </Button>
          </div>
          {error && <p className="text-red-600">{error}</p>}
          <RecommendationDisplay
            result={result}
            alternatives={result.alternatives}
          />
        </>
      )}
    </main>
  )
}
