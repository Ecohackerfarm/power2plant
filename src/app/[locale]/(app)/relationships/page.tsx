'use client'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Link } from '@/i18n/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ThumbsUp } from 'lucide-react'
import { getDisplayName } from '@/lib/recommend'
import { useSession } from '@/lib/auth-client'

const COMPANION_TYPES = new Set(['COMPANION', 'ATTRACTS', 'NURSE', 'TRAP_CROP'])

type CropRow = { id: string; name: string; botanicalName: string; commonNames: string[] }

type RelRow = {
  id: string; type: string; reason: string | null; confidence: number; notes: string | null
  cropA: CropRow; cropB: CropRow
}

type PlantResult = CropRow & { companions: RelRow[]; antagonists: RelRow[] }

type NoDataPlant = CropRow & {
  researchRequestId: string | null; voteCount: number; hasVoted: boolean
}

function confidenceLabel(c: number): string {
  if (c >= 0.875) return 'PEER_REVIEWED'
  if (c >= 0.625) return 'OBSERVED'
  if (c >= 0.375) return 'TRADITIONAL'
  return 'ANECDOTAL'
}

function debounce<T extends (...args: string[]) => void>(fn: T, delay: number): T {
  let timeout: NodeJS.Timeout
  return ((...args: string[]) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => fn(...args), delay)
  }) as T
}

function CompanionRow({ rel, plantId, t }: {
  rel: RelRow
  plantId: string
  t: ReturnType<typeof useTranslations<'Relationships'>>
}) {
  // The other crop in the relationship (not the matched plant)
  const other = rel.cropA.id === plantId ? rel.cropB : rel.cropA
  const label = COMPANION_TYPES.has(rel.type) ? t('companion') : t('avoid')
  const variant = COMPANION_TYPES.has(rel.type) ? 'default' : 'destructive'
  const clevel = confidenceLabel(rel.confidence)

  function tryT(key: string): string {
    try { return t(key as Parameters<typeof t>[0]) } catch { return key }
  }

  return (
    <Link
      href={`/plants/${rel.cropA.id}/companions/${rel.cropB.id}`}
      className="flex items-center justify-between gap-3 py-2 px-3 rounded hover:bg-muted/60 transition-colors group"
    >
      <span className="text-sm font-medium group-hover:underline">
        {getDisplayName(other)}
        {getDisplayName(other) !== other.botanicalName && (
          <span className="font-normal italic text-muted-foreground text-xs ml-1">{other.botanicalName}</span>
        )}
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-muted-foreground">{tryT(clevel)}</span>
        <Badge variant={variant} className="text-xs">{label}</Badge>
      </div>
    </Link>
  )
}

function PlantCard({ plant, t }: {
  plant: PlantResult
  t: ReturnType<typeof useTranslations<'Relationships'>>
}) {
  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <Link href={`/plants/${plant.id}`} className="block group">
          <p className="font-bold text-base group-hover:underline">{getDisplayName(plant)}</p>
          {getDisplayName(plant) !== plant.botanicalName && (
            <p className="italic text-muted-foreground text-sm">{plant.botanicalName}</p>
          )}
        </Link>

        {plant.companions.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
              {t('companions')}
            </p>
            <div className="divide-y divide-muted">
              {plant.companions.map(r => (
                <CompanionRow key={r.id} rel={r} plantId={plant.id} t={t} />
              ))}
            </div>
          </div>
        )}

        {plant.antagonists.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
              {t('antagonists')}
            </p>
            <div className="divide-y divide-muted">
              {plant.antagonists.map(r => (
                <CompanionRow key={r.id} rel={r} plantId={plant.id} t={t} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function NoDataCard({ plant, t, onVoted }: {
  plant: NoDataPlant
  t: ReturnType<typeof useTranslations<'Relationships'>>
  onVoted: (id: string, newCount: number) => void
}) {
  const { data: session } = useSession()
  const [voting, setVoting] = useState(false)
  const [hasVoted, setHasVoted] = useState(plant.hasVoted)
  const [voteCount, setVoteCount] = useState(plant.voteCount)

  async function handleVote() {
    if (!session || voting || hasVoted) return
    setVoting(true)
    try {
      const res = await fetch('/api/research-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cropAId: plant.id }),
      })
      if (res.ok) {
        const data = await res.json()
        if (!data.alreadyVoted) {
          setHasVoted(true)
          setVoteCount(data.voteCount)
          onVoted(plant.id, data.voteCount)
        }
      }
    } finally {
      setVoting(false)
    }
  }

  return (
    <Card className="opacity-70">
      <CardContent className="pt-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Link href={`/plants/${plant.id}`} className="group">
              <p className="font-medium text-sm group-hover:underline">{getDisplayName(plant)}</p>
              {getDisplayName(plant) !== plant.botanicalName && (
                <p className="italic text-muted-foreground text-xs">{plant.botanicalName}</p>
              )}
            </Link>
            <p className="text-xs text-muted-foreground mt-1">{t('noData')}</p>
          </div>
          <div className="shrink-0">
            {session ? (
              <button
                onClick={handleVote}
                disabled={voting || hasVoted}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  hasVoted
                    ? 'bg-primary/10 border-primary/30 text-primary font-medium'
                    : 'border-muted-foreground/30 text-muted-foreground hover:border-primary/50 hover:text-foreground'
                }`}
              >
                <ThumbsUp className="w-3 h-3" />
                {hasVoted ? t('voted') : t('voteForResearch')}
                {voteCount > 0 && <span className="ml-1 tabular-nums">{voteCount}</span>}
              </button>
            ) : (
              <span className="text-xs text-muted-foreground">{t('signInToVote')}</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function RelationshipsInner() {
  const t = useTranslations('Relationships')
  const locale = useLocale()
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const [plants, setPlants] = useState<PlantResult[]>([])
  const [noDataPlants, setNoDataPlants] = useState<NoDataPlant[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [search, setSearch] = useState(searchParams.get('q') ?? '')

  const fetchResults = useCallback(async (q: string) => {
    if (!q.trim()) {
      setPlants([])
      setNoDataPlants([])
      return
    }
    setLoading(true)
    setError(false)
    try {
      const params = new URLSearchParams({ q, locale })
      const res = await fetch(`/api/plants/search?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setPlants(data.plants ?? [])
      setNoDataPlants(data.noDataPlants ?? [])
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [locale])

  const handleSearch = useCallback(
    debounce((value: string) => {
      setSearch(value)
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set('q', value)
      } else {
        params.delete('q')
      }
      router.replace(`${pathname}?${params}`)
    }, 300),
    [searchParams, router, pathname]
  )

  useEffect(() => {
    fetchResults(search)
  }, [search, fetchResults])

  function handleVoted(plantId: string, newCount: number) {
    setNoDataPlants(prev =>
      prev.map(p => p.id === plantId ? { ...p, voteCount: newCount, hasVoted: true } : p)
    )
  }

  const hasAnyResults = plants.length > 0 || noDataPlants.length > 0
  const searched = search.trim().length > 0

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-start justify-end gap-4">
        <Link href="/contribute" className="text-sm text-primary hover:underline shrink-0">
          {t('contributeObservation')}
        </Link>
      </div>

      <Input
        type="search"
        placeholder={t('searchPlaceholder')}
        defaultValue={search}
        onChange={(e) => handleSearch(e.target.value)}
        className="max-w-sm"
      />

      {error ? (
        <p className="text-destructive text-sm">{t('loadError')}</p>
      ) : loading ? (
        <div className="space-y-4">
          {[0, 1, 2].map(i => (
            <Card key={i}>
              <CardContent className="pt-4 space-y-2">
                <div className="h-5 bg-muted rounded animate-pulse w-1/3" />
                <div className="h-4 bg-muted rounded animate-pulse w-1/2" />
                <div className="h-4 bg-muted rounded animate-pulse w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : searched && !hasAnyResults ? (
        <p className="text-muted-foreground text-sm">{t('noResults')}</p>
      ) : !searched ? (
        <p className="text-muted-foreground text-sm">{t('noObservations')}</p>
      ) : (
        <div className="space-y-4">
          {plants.map(plant => (
            <PlantCard key={plant.id} plant={plant} t={t} />
          ))}
          {noDataPlants.map(plant => (
            <NoDataCard key={plant.id} plant={plant} t={t} onVoted={handleVoted} />
          ))}
        </div>
      )}
    </main>
  )
}

export default function RelationshipsPage() {
  return (
    <Suspense>
      <RelationshipsInner />
    </Suspense>
  )
}
