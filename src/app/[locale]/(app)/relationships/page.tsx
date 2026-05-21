'use client'
import { useState, useEffect, useCallback } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { getDisplayName } from '@/lib/recommend'

type Relationship = {
  id: string
  type: 'COMPANION' | 'AVOID' | 'ATTRACTS' | 'REPELS' | 'NURSE' | 'TRAP_CROP'
  reason: string | null
  confidence: string
  notes: string | null
  cropA: { id: string; name: string; botanicalName: string; commonNames: string[] }
  cropB: { id: string; name: string; botanicalName: string; commonNames: string[] }
  sourceCount: number
}

const COMPANION_TYPES = new Set(['COMPANION', 'ATTRACTS', 'NURSE', 'TRAP_CROP'])

function debounce<T extends (...args: string[]) => void>(fn: T, delay: number): T {
  let timeout: NodeJS.Timeout
  return ((...args: string[]) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => fn(...args), delay)
  }) as T
}

function RelationshipCard({ rel, t }: { rel: Relationship; t: (k: string, opts?: Record<string, unknown>) => string }) {
  function tryT(key: string): string {
    try { return t(key as Parameters<typeof t>[0]) } catch { return key }
  }
  return (
    <Link
      key={rel.id}
      href={`/plants/${rel.cropA.id}/companions/${rel.cropB.id}`}
      className="block group"
      data-feedback-target={`relationship:${rel.id}`}
      data-entity-type="relationship"
      data-entity-id={rel.id}
    >
      <Card className="transition-colors group-hover:border-foreground/30">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <CardTitle className="text-base">
              <span className="font-bold">{getDisplayName(rel.cropA)}</span>
              {getDisplayName(rel.cropA) !== rel.cropA.botanicalName && (
                <span className="font-normal italic text-muted-foreground text-xs ml-1">{rel.cropA.botanicalName}</span>
              )}
              {' + '}
              <span className="font-bold">{getDisplayName(rel.cropB)}</span>
              {getDisplayName(rel.cropB) !== rel.cropB.botanicalName && (
                <span className="font-normal italic text-muted-foreground text-xs ml-1">{rel.cropB.botanicalName}</span>
              )}
            </CardTitle>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant={COMPANION_TYPES.has(rel.type) ? 'default' : 'destructive'}>
                {COMPANION_TYPES.has(rel.type) ? t('companion') : t('avoid')}
              </Badge>
              <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {rel.reason && (
            <p className="text-sm">
              <span className="text-muted-foreground">{t('reason')}:</span>{' '}
              {tryT(rel.reason)}
            </p>
          )}
          <p className="text-sm">
            <span className="text-muted-foreground">{t('confidence')}:</span> {tryT(rel.confidence)}
          </p>
          <p className="text-sm text-muted-foreground">
            {(t as (k: string, v: Record<string, unknown>) => string)('sourceCount', { count: rel.sourceCount })}
          </p>
        </CardContent>
      </Card>
    </Link>
  )
}

export default function RelationshipsPage() {
  const t = useTranslations('Relationships')
  const locale = useLocale()
  const [relationships, setRelationships] = useState<Relationship[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(false)
  const [search, setSearch] = useState('')
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)

  const fetchRelationships = useCallback(async (cursor?: string, q?: string, append = false) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (cursor) params.set('cursor', cursor)
    params.set('locale', locale)
    params.set('limit', '20')

    try {
      const res = await fetch(`/api/relationships?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (append) {
        setRelationships((prev) => [...prev, ...data.relationships])
      } else {
        setRelationships(data.relationships ?? [])
      }
      setNextCursor(data.nextCursor)
      setHasMore(!!data.nextCursor)
      setError(false)
    } catch {
      setError(true)
    }
  }, [locale])

  useEffect(() => {
    setLoading(true)
    fetchRelationships(undefined, search, false).finally(() => setLoading(false))
  }, [search, fetchRelationships])

  const handleSearch = debounce((value: string) => {
    setSearch(value)
  }, 300)

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    await fetchRelationships(nextCursor, search, true)
    setLoadingMore(false)
  }

  const companions = relationships.filter(r => COMPANION_TYPES.has(r.type))
  const antagonists = relationships.filter(r => r.type === 'AVOID')

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-3xl font-bold mt-2">{t('title')}</h1>
        <Link
          href="/contribute"
          className="text-sm text-primary hover:underline shrink-0 mt-3"
        >
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
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <div className="h-5 bg-muted rounded animate-pulse" />
              </CardHeader>
              <CardContent>
                <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : relationships.length === 0 ? (
        <p className="text-muted-foreground">{t('noObservations')}</p>
      ) : (
        <>
          {companions.length > 0 && (
            <section className="space-y-4">
              <h2 className="font-semibold text-lg">
                {t('companions')}
                <span className="text-muted-foreground font-normal text-sm ml-2">({companions.length})</span>
              </h2>
              {companions.map(rel => <RelationshipCard key={rel.id} rel={rel} t={t as (k: string) => string} />)}
            </section>
          )}

          {antagonists.length > 0 && (
            <section className="space-y-4">
              <h2 className="font-semibold text-lg">
                {t('antagonists')}
                <span className="text-muted-foreground font-normal text-sm ml-2">({antagonists.length})</span>
              </h2>
              {antagonists.map(rel => <RelationshipCard key={rel.id} rel={rel} t={t as (k: string) => string} />)}
            </section>
          )}

          {hasMore && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? t('loading') : t('loadMore')}
              </Button>
            </div>
          )}
        </>
      )}
    </main>
  )
}
