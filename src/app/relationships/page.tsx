'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
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

const REASON_LABELS: Record<string, string> = {
  PEST_CONTROL: 'Pest control',
  POLLINATION: 'Pollination',
  NUTRIENT: 'Nutrient sharing',
  SHADE: 'Shade benefit',
  ALLELOPATHY: 'Allelopathy',
  OTHER: 'Other',
}

function debounce<T extends (...args: string[]) => void>(fn: T, delay: number): T {
  let timeout: NodeJS.Timeout
  return ((...args: string[]) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => fn(...args), delay)
  }) as T
}

export default function RelationshipsPage() {
  const [relationships, setRelationships] = useState<Relationship[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [search, setSearch] = useState('')
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)

  const fetchRelationships = useCallback(async (cursor?: string, q?: string, append = false) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (cursor) params.set('cursor', cursor)
    params.set('limit', '20')

    const res = await fetch(`/api/relationships?${params}`)
    const data = await res.json()

    if (append) {
      setRelationships((prev) => [...prev, ...data.relationships])
    } else {
      setRelationships(data.relationships)
    }
    setNextCursor(data.nextCursor)
    setHasMore(!!data.nextCursor)
  }, [])

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

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Home
        </Link>
        <h1 className="text-3xl font-bold mt-2">Community observations</h1>
      </div>

      <Input
        type="search"
        placeholder="Search by crop name..."
        defaultValue={search}
        onChange={(e) => handleSearch(e.target.value)}
        className="max-w-sm"
      />

      {loading ? (
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
        <p className="text-muted-foreground">No observations yet</p>
      ) : (
        <>
          <div className="space-y-4">
            {relationships.map((rel) => (
              <Link
                key={rel.id}
                href={`/plants/${rel.cropA.id}/companions/${rel.cropB.id}`}
                className="block group"
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
                        <Badge variant={rel.type === 'COMPANION' ? 'default' : 'destructive'}>
                          {rel.type === 'COMPANION' ? 'Companion' : 'Avoid'}
                        </Badge>
                        <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {rel.reason && (
                      <p className="text-sm">
                        <span className="text-muted-foreground">Reason:</span>{' '}
                        {REASON_LABELS[rel.reason] ?? rel.reason}
                      </p>
                    )}
                    <p className="text-sm">
                      <span className="text-muted-foreground">Confidence:</span> {rel.confidence}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {rel.sourceCount} source{rel.sourceCount !== 1 ? 's' : ''}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {hasMore && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          )}
        </>
      )}
    </main>
  )
}