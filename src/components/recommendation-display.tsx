'use client'
import Link from 'next/link'
import { useState, useRef, useEffect, useMemo } from 'react'
import { ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfidenceBadge } from '@/components/confidence-badge'
import { getDisplayName, type RecommendResult, type BedResult } from '@/lib/recommend'
import { useSession } from '@/lib/auth-client'
import type { CSSProperties } from 'react'

// Unique identity for a bed: sorted crop IDs. Empty beds disambiguated by index.
function bedKey(bed: BedResult): string {
  const ids = bed.crops.map(c => c.id).sort().join(',')
  return ids || `__empty_${bed.index}`
}

// Sort beds: most companion-rich first. Stable tiebreaker: bed.index ascending.
function sortByHints(beds: BedResult[]): BedResult[] {
  return [...beds].sort(
    (a, b) =>
      b.hints.length - a.hints.length ||
      b.crops.length - a.crops.length ||
      a.index - b.index,
  )
}

// CSS keyframes defined once — no reliance on Tailwind JIT emitting animation classes.
const SLIDE_CSS = `
  @keyframes p2p-out-l { from{transform:translateX(0);opacity:1} to{transform:translateX(-115%);opacity:0} }
  @keyframes p2p-out-r { from{transform:translateX(0);opacity:1} to{transform:translateX(115%);opacity:0}  }
  @keyframes p2p-in-r  { from{transform:translateX(115%);opacity:0} to{transform:translateX(0);opacity:1}  }
  @keyframes p2p-in-l  { from{transform:translateX(-115%);opacity:0} to{transform:translateX(0);opacity:1} }
`
const DUR = '280ms'
const ANIM_LOOKUP: Record<string, string> = {
  'exiting-fwd':  `p2p-out-l ${DUR} ease-in  forwards`,
  'exiting-back': `p2p-out-r ${DUR} ease-in  forwards`,
  'entering-fwd': `p2p-in-r  ${DUR} ease-out forwards`,
  'entering-back': `p2p-in-l  ${DUR} ease-out forwards`,
}
const ANIM_MS = 280

type AnimPhase = 'idle' | 'exiting' | 'entering'

interface RecommendationDisplayProps {
  result: RecommendResult
  alternatives?: RecommendResult[]
  onAccepted?: () => void
}

export function RecommendationDisplay({ result, alternatives = [], onAccepted }: RecommendationDisplayProps) {
  const { data: session } = useSession()
  const [accepting, setAccepting] = useState(false)
  const [acceptError, setAcceptError] = useState<string | null>(null)

  const allPlans = useMemo(() => [result, ...alternatives], [result, alternatives])
  const planBeds = useMemo(() => allPlans.map(p => sortByHints(p.beds)), [allPlans])

  // displayedIndex only advances AFTER the exit animation, so unchanged beds keep
  // their React DOM nodes and don't animate at all.
  const [displayedIndex, setDisplayedIndex] = useState(0)
  const [animPhase, setAnimPhase] = useState<AnimPhase>('idle')
  const [isForward, setIsForward] = useState(true)
  const [changedKeys, setChangedKeys] = useState<Set<string>>(new Set())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  function selectPlan(newIdx: number) {
    if (newIdx === displayedIndex || animPhase !== 'idle') return

    const oldKeys = new Set(planBeds[displayedIndex].map(bedKey))
    const newKeys = new Set(planBeds[newIdx].map(bedKey))
    const exitKeys  = new Set([...oldKeys].filter(k => !newKeys.has(k)))
    const enterKeys = new Set([...newKeys].filter(k => !oldKeys.has(k)))

    setIsForward(newIdx > displayedIndex)
    setChangedKeys(exitKeys)
    setAnimPhase('exiting')

    timerRef.current = setTimeout(() => {
      setDisplayedIndex(newIdx)
      setChangedKeys(enterKeys)
      setAnimPhase('entering')

      timerRef.current = setTimeout(() => {
        setAnimPhase('idle')
        setChangedKeys(new Set())
      }, ANIM_MS + 20)
    }, ANIM_MS + 20)
  }

  function bedAnimStyle(key: string): CSSProperties {
    if (animPhase === 'idle' || !changedKeys.has(key)) return {}
    const lookup = `${animPhase}-${isForward ? 'fwd' : 'back'}`
    const anim = ANIM_LOOKUP[lookup]
    return anim ? { animation: anim } : {}
  }

  const beds = planBeds[displayedIndex]
  const plan = allPlans[displayedIndex]

  // crop → display indices for "also in Bed N" cross-references
  const cropDisplayBeds = useMemo(() => {
    const m = new Map<string, number[]>()
    beds.forEach((bed, di) => {
      for (const crop of bed.crops) {
        const list = m.get(crop.id) ?? []
        list.push(di)
        m.set(crop.id, list)
      }
    })
    return m
  }, [beds])

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
      {/* Keyframe definitions — inline so they work regardless of Tailwind JIT state */}
      <style dangerouslySetInnerHTML={{ __html: SLIDE_CSS }} />

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

      {/* Grid: unchanged beds share a React key across plans → DOM stays, no animation */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {beds.map((bed, displayIdx) => {
          const key = bedKey(bed)
          return (
            <div key={key} className="overflow-hidden">
              <div style={bedAnimStyle(key)}>
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
