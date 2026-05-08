'use client'
import Link from 'next/link'
import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfidenceBadge } from '@/components/confidence-badge'
import { getDisplayName, type RecommendResult } from '@/lib/recommend'
import { useSession } from '@/lib/auth-client'

interface RecommendationDisplayProps {
  result: RecommendResult
  onAccepted?: () => void
}

export function RecommendationDisplay({ result, onAccepted }: RecommendationDisplayProps) {
  const { data: session } = useSession()
  const [accepting, setAccepting] = useState(false)
  const [acceptError, setAcceptError] = useState<string | null>(null)

  const handleAccept = async () => {
    if (!session) return
    setAccepting(true)
    setAcceptError(null)
    try {
      const res = await fetch('/api/garden/plantings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          beds: result.beds.map((bed) => ({
            name: `Bed ${bed.index + 1}`,
            cropIds: bed.crops.map((c) => c.id),
          })),
        }),
      })
      if (!res.ok) throw new Error('Failed to save plan')
      onAccepted?.()
    } catch (e) {
      setAcceptError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setAccepting(false)
    }
  }

  // Build cropId → bed indices map for "also in Bed X" notes
  const cropBeds = new Map<string, number[]>()
  for (const bed of result.beds) {
    for (const crop of bed.crops) {
      const list = cropBeds.get(crop.id) ?? []
      list.push(bed.index)
      cropBeds.set(crop.id, list)
    }
  }
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Step 4 — Recommendations</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {result.beds.map(bed => (
          <Card key={bed.index}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Bed {bed.index + 1}</CardTitle>
            </CardHeader>
            <CardContent>
              {bed.crops.length === 0 ? (
                <p className="text-sm text-muted-foreground">Empty</p>
              ) : (
                <>
                  <ul className="space-y-1">
                    {bed.crops.map(crop => {
                      const otherBeds = (cropBeds.get(crop.id) ?? [])
                        .filter(i => i !== bed.index)
                        .map(i => `Bed ${i + 1}`)
                      return (
                        <li key={crop.id} className="text-sm">
                          <Link
                            href={`/plants/${crop.id}`}
                            className="font-medium hover:underline"
                          >
                            {getDisplayName(crop)}
                          </Link>
                          {otherBeds.length > 0 && (
                            <span className="text-xs text-muted-foreground ml-1">
                              · also in {otherBeds.join(', ')}
                            </span>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                  {bed.hints.length > 0 && (
                    <ul className="mt-2 space-y-1 border-t pt-2">
                      {bed.hints.map((hint, i) => (
                        <li key={i}>
                          <Link
                            href={`/plants/${hint.cropAId}/companions/${hint.cropBId}`}
                            className="flex items-center justify-between gap-2 text-xs rounded px-1 py-0.5 -mx-1 hover:bg-muted group"
                          >
                            <span>
                              <span className="font-medium">{hint.pairLabel}</span>
                              <span className="text-muted-foreground ml-1">
                                —{hint.details && ` ${hint.details} ·`}{' '}
                                <ConfidenceBadge level={hint.confidenceLevel} />
                              </span>
                            </span>
                            <ArrowRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {session && (
        <div className="pt-4">
          <Button size="lg" onClick={handleAccept} disabled={accepting}>
            {accepting ? 'Saving…' : 'Accept this plan'}
          </Button>
          {acceptError && <p className="text-red-600 mt-2">{acceptError}</p>}
        </div>
      )}

      {result.overflow.length > 0 && (
        <div>
          <h3 className="font-medium mb-2 text-amber-700">
            Overflow — no bed space ({result.overflow.length} plants)
          </h3>
          <div className="flex flex-wrap gap-2">
            {result.overflow.map(crop => (
              <Badge key={crop.id} variant="outline" className="cursor-pointer">
                <Link href={`/plants/${crop.id}`}>{getDisplayName(crop)}</Link>
              </Badge>
            ))}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Add more beds or increase capacity to fit these plants.
          </p>
        </div>
      )}

      {result.conflicts.length > 0 && (
        <div>
          <h3 className="font-medium mb-2 text-red-700">
            Conflicts — incompatible plants in same bed
          </h3>
          <ul className="space-y-1">
            {result.conflicts.map((c, i) => (
              <li key={i} className="text-sm text-red-700">
                {getDisplayName(c.a)} and {getDisplayName(c.b)} should not share a bed
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground mt-1">
            Add more beds to separate these plants.
          </p>
        </div>
      )}
    </div>
  )
}
