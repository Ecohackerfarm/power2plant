'use client'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ConfidenceBadge } from '@/components/confidence-badge'
import { getDisplayName, type RecommendResult } from '@/lib/recommend'

interface RecommendationDisplayProps {
  result: RecommendResult
}

export function RecommendationDisplay({ result }: RecommendationDisplayProps) {
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
                    {bed.crops.map(crop => (
                      <li key={crop.id} className="text-sm">
                        <Link
                          href={`/plants/${crop.id}`}
                          className="font-medium hover:underline"
                        >
                          {getDisplayName(crop)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {bed.hints.length > 0 && (
                    <ul className="mt-2 space-y-0.5 border-t pt-2">
                      {bed.hints.map((hint, i) => (
                        <li key={i} className="text-xs">
                          <Link
                            href={`/plants/${hint.cropAId}/companions/${hint.cropBId}`}
                            className="font-medium hover:underline"
                          >
                            {hint.pairLabel}
                          </Link>
                          <span className="text-muted-foreground ml-1">
                            —{hint.details && ` ${hint.details} ·`}{' '}
                            <ConfidenceBadge level={hint.confidenceLevel} />
                          </span>
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
