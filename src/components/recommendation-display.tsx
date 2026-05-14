'use client'
import Link from 'next/link'
import { useState, useRef } from 'react'
import { ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfidenceBadge } from '@/components/confidence-badge'
import { getDisplayName, type RecommendResult, type BedResult } from '@/lib/recommend'
import { useSession } from '@/lib/auth-client'

// Stable identity key for a bed: sorted crop IDs. Beds with the same key are identical
// across plans and should not animate when switching.
function bedKey(bed: BedResult): string {
  return bed.crops.map(c => c.id).sort().join(',')
}

// Sort beds so companion-rich beds appear first. Users see their most informative beds
// at the top rather than single-plant placeholders.
function sortByHints(beds: BedResult[]): BedResult[] {
  return [...beds].sort(
    (a, b) => b.hints.length - a.hints.length || b.crops.length - a.crops.length,
  )
}

type AnimPhase = 'idle' | 'exiting' | 'entering'
const ANIM_MS = 280

interface RecommendationDisplayProps {
  result: RecommendResult
  alternatives?: RecommendResult[]
  onAccepted?: () => void
}

export function RecommendationDisplay({ result, alternatives = [], onAccepted }: RecommendationDisplayProps) {
  const { data: session } = useSession()
  const [accepting, setAccepting] = useState(false)
  const [acceptError, setAcceptError] = useState<string | null>(null)

  const allPlans = [result, ...alternatives]
  // Pre-sort beds for every plan once
  const planBeds = allPlans.map(p => sortByHints(p.beds))

  // `displayedIndex` drives what's rendered. It only changes AFTER the exit animation
  // completes, so React can keep unchanged beds in the DOM without any jump.
  const [displayedIndex, setDisplayedIndex] = useState(0)
  const [animPhase, setAnimPhase] = useState<AnimPhase>('idle')
  const [isForward, setIsForward] = useState(true)
  const [changedKeys, setChangedKeys] = useState<Set<string>>(new Set())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function selectPlan(newIdx: number) {
    if (newIdx === displayedIndex || animPhase !== 'idle') return

    const oldBeds = planBeds[displayedIndex]
    const newBeds = planBeds[newIdx]
    const oldKeySet = new Set(oldBeds.map(bedKey))
    const newKeySet = new Set(newBeds.map(bedKey))

    // Beds that exist in old but not new — these slide out
    const exitKeys = new Set([...oldKeySet].filter(k => !newKeySet.has(k)))
    // Beds that exist in new but not old — these slide in
    const enterKeys = new Set([...newKeySet].filter(k => !oldKeySet.has(k)))

    setIsForward(newIdx > displayedIndex)
    setChangedKeys(exitKeys)
    setAnimPhase('exiting')

    // After exit completes: swap to new plan, trigger enter animation
    timerRef.current = setTimeout(() => {
      setDisplayedIndex(newIdx)
      setChangedKeys(enterKeys)
      setAnimPhase('entering')

      // After enter completes: return to idle
      timerRef.current = setTimeout(() => {
        setAnimPhase('idle')
        setChangedKeys(new Set())
      }, ANIM_MS + 20)
    }, ANIM_MS + 20)
  }

  // What's visible right now
  const beds = planBeds[displayedIndex]
  const plan = allPlans[displayedIndex]

  // Build crop → display-position indices for "also in Bed N" notes
  const cropDisplayBeds = new Map<string, number[]>()
  beds.forEach((bed, di) => {
    for (const crop of bed.crops) {
      const list = cropDisplayBeds.get(crop.id) ?? []
      list.push(di)
      cropDisplayBeds.set(crop.id, list)
    }
  })

  function animClass(key: string): string {
    if (!changedKeys.has(key)) return ''
    if (animPhase === 'exiting') return isForward ? 'animate-slide-out-left' : 'animate-slide-out-right'
    if (animPhase === 'entering') return isForward ? 'animate-slide-in-right' : 'animate-slide-in-left'
    return ''
  }

  const handleAccept = async () => {
    if (!session) return
    setAccepting(true)
    setAcceptError(null)
    try {
      const res = await fetch('/api/garden/plantings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          beds: beds.map((bed, di) => ({
            name: `Bed ${di + 1}`,
            cropIds: bed.crops.map(c => c.id),
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

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Step 4 — Recommendations</h2>

      {allPlans.length > 1 && (
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-sm text-muted-foreground">Alternative arrangements:</span>
          {allPlans.map((_, i) => (
            <button
              key={i}
              onClick={() => selectPlan(i)}
              disabled={animPhase !== 'idle'}
              className={`px-3 py-1 text-sm rounded border transition-colors disabled:cursor-not-allowed ${
                displayedIndex === i
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border hover:bg-muted disabled:opacity-50'
              }`}
            >
              Plan {String.fromCharCode(65 + i)}
            </button>
          ))}
        </div>
      )}

      {/* Grid: unchanged beds stay in DOM (same React key) — only different beds animate */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {beds.map((bed, displayIdx) => {
          const key = bedKey(bed)
          const cls = animClass(key)

          return (
            <div key={key} className="overflow-hidden">
              <div className={cls || undefined}>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Bed {displayIdx + 1}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {bed.crops.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Empty</p>
                    ) : (
                      <>
                        <ul className="space-y-1">
                          {bed.crops.map(crop => {
                            const otherDisplayBeds = (cropDisplayBeds.get(crop.id) ?? [])
                              .filter(di => di !== displayIdx)
                              .map(di => `Bed ${di + 1}`)
                            return (
                              <li key={crop.id} className="text-sm">
                                <Link
                                  href={`/plants/${crop.id}`}
                                  className="font-medium hover:underline"
                                >
                                  {getDisplayName(crop)}
                                </Link>
                                {otherDisplayBeds.length > 0 && (
                                  <span className="text-xs text-muted-foreground ml-1">
                                    · also in {otherDisplayBeds.join(', ')}
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
              </div>
            </div>
          )
        })}
      </div>

      {session && (
        <div className="pt-4">
          <Button size="lg" onClick={handleAccept} disabled={accepting || animPhase !== 'idle'}>
            {accepting ? 'Saving…' : 'Accept this plan'}
          </Button>
          {acceptError && <p className="text-red-600 mt-2">{acceptError}</p>}
        </div>
      )}

      {plan.overflow.length > 0 && (
        <div>
          <h3 className="font-medium mb-2 text-amber-700">
            Overflow — no bed space ({plan.overflow.length} plants)
          </h3>
          <div className="flex flex-wrap gap-2">
            {plan.overflow.map(crop => (
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

      {plan.conflicts.length > 0 && (
        <div>
          <h3 className="font-medium mb-2 text-red-700">
            Conflicts — incompatible plants in same bed
          </h3>
          <ul className="space-y-1">
            {plan.conflicts.map((c, i) => (
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
