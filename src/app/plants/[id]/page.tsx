'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ConfidenceBadge } from '@/components/confidence-badge'
import { getDisplayName, confidenceLabel } from '@/lib/recommend'
import { loadState, saveState } from '@/lib/garden-state'

type CropRow = {
  id: string; name: string; botanicalName: string
  commonNames: string[]; minTempC: number | null; isNitrogenFixer: boolean
}

type CompanionRow = CropRow & {
  relationshipId: string; type: string; reason: string | null
  confidence: number; notes: string | null; direction: string
}

const REASON_LABELS: Record<string, string> = {
  PEST_CONTROL: 'Pest Control', POLLINATION: 'Pollination',
  NUTRIENT: 'Nutrient Sharing', SHADE: 'Shade Benefit',
  ALLELOPATHY: 'Natural Repellent',
}
const TYPE_LABELS: Record<string, string> = {
  COMPANION: 'Companion', ATTRACTS: 'Attracts Beneficials',
  NURSE: 'Nurse Plant', TRAP_CROP: 'Trap Crop',
}

export default function PlantPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [crop, setCrop] = useState<CropRow | null>(null)
  const [companions, setCompanions] = useState<CompanionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [wishlist, setWishlist] = useState<string[]>([])

  useEffect(() => {
    setWishlist(loadState().wishlist)
    fetch(`/api/plants/${id}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(({ crop, companions }) => { setCrop(crop); setCompanions(companions) })
      .finally(() => setLoading(false))
  }, [id])

  function addToWishlist(cropId: string) {
    const state = loadState()
    if (state.wishlist.includes(cropId)) return
    const next = { ...state, wishlist: [...state.wishlist, cropId] }
    saveState(next)
    setWishlist(next.wishlist)
  }

  function addAndRecommend(cropId: string) {
    addToWishlist(cropId)
    router.push('/?autoRecommend=1')
  }

  if (loading) return <main className="max-w-3xl mx-auto px-4 py-8"><p className="text-muted-foreground">Loading…</p></main>
  if (!crop) return <main className="max-w-3xl mx-auto px-4 py-8"><p className="text-red-600">Plant not found.</p></main>

  const displayName = getDisplayName(crop)
  const inWishlist = (cropId: string) => wishlist.includes(cropId)

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">← Back to plan</Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold">{displayName}</h1>
        {displayName !== crop.botanicalName && (
          <p className="text-muted-foreground italic">{crop.botanicalName}</p>
        )}
        <div className="flex gap-2 mt-2 flex-wrap">
          {crop.isNitrogenFixer && <Badge variant="secondary">Nitrogen Fixer</Badge>}
          {crop.minTempC !== null && (
            <Badge variant="outline">Hardy to {crop.minTempC}°C</Badge>
          )}
        </div>
      </div>

      <Separator />

      <div>
        <h2 className="font-semibold mb-3">
          Companions
          <span className="text-muted-foreground font-normal text-sm ml-2">({companions.length})</span>
        </h2>

        {companions.length === 0 && (
          <p className="text-sm text-muted-foreground">No companion data available.</p>
        )}

        <ul className="space-y-3">
          {companions.map(c => {
            const cName = getDisplayName(c)
            const clevel = confidenceLabel(c.confidence)
            const alreadyAdded = inWishlist(c.id)
            const [canonA, canonB] = id < c.id ? [id, c.id] : [c.id, id]

            return (
              <li key={c.id}>
                <Card>
                  <CardContent className="pt-4 pb-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Link
                          href={`/plants/${c.id}`}
                          className="font-medium hover:underline"
                        >
                          {cName}
                        </Link>
                        {cName !== c.botanicalName && (
                          <span className="text-muted-foreground italic text-xs ml-1">{c.botanicalName}</span>
                        )}
                        <div className="flex flex-wrap gap-1 mt-1">
                          {TYPE_LABELS[c.type] && c.type !== 'COMPANION' && (
                            <Badge variant="secondary" className="text-xs">{TYPE_LABELS[c.type]}</Badge>
                          )}
                          {c.reason && REASON_LABELS[c.reason] && (
                            <Badge variant="outline" className="text-xs">{REASON_LABELS[c.reason]}</Badge>
                          )}
                        </div>
                        {c.notes && (
                          <p className="text-xs text-muted-foreground mt-1">{c.notes}</p>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground shrink-0 text-right">
                        <ConfidenceBadge level={clevel} />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        size="sm"
                        variant={alreadyAdded ? 'secondary' : 'outline'}
                        disabled={alreadyAdded}
                        onClick={() => addToWishlist(c.id)}
                      >
                        {alreadyAdded ? 'In wishlist' : 'Add to wishlist'}
                      </Button>
                      {!alreadyAdded && (
                        <Button size="sm" onClick={() => addAndRecommend(c.id)}>
                          Add &amp; recommend
                        </Button>
                      )}
                      <Link
                        href={`/plants/${canonA}/companions/${canonB}`}
                        className="text-xs text-muted-foreground hover:text-foreground underline ml-auto"
                      >
                        Details →
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              </li>
            )
          })}
        </ul>
      </div>
    </main>
  )
}
