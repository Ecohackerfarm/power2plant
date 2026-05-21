'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Link, useRouter } from '@/i18n/navigation'
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
  parentGenus?: { id: string; botanicalName: string; name: string }
  species?: Array<{ id: string; botanicalName: string; name: string }>
  speciesCount?: number
  wikipedia?: { extract?: string; thumbnail?: string; articleUrl?: string }
}

type CompanionRow = CropRow & {
  relationshipId: string; type: string; reason: string | null
  confidence: number; notes: string | null; direction: string
  inheritedFrom?: { id: string; botanicalName: string }
}

export default function PlantPage() {
  const t = useTranslations('PlantPage')
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

  if (loading) return <main className="max-w-3xl mx-auto px-4 py-8"><p className="text-muted-foreground">{t('loading')}</p></main>
  if (!crop) return <main className="max-w-3xl mx-auto px-4 py-8"><p className="text-red-600">{t('notFound')}</p></main>

  const displayName = getDisplayName(crop)
  const inWishlist = (cropId: string) => wishlist.includes(cropId)
  const genusWord = crop.botanicalName.trim().split(/\s+/)[0]

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">

      <div>
        <h1 className="text-2xl font-bold">{displayName}</h1>
        {displayName !== crop.botanicalName && (
          <p className="text-muted-foreground italic">{crop.botanicalName}</p>
        )}
        <div className="flex gap-2 mt-2 flex-wrap">
          {crop.isNitrogenFixer && <Badge variant="secondary">{t('nitrogenFixer')}</Badge>}
          {crop.minTempC !== null && (
            <Badge variant="outline">{t('hardyTo', { temp: crop.minTempC })}</Badge>
          )}
        </div>

        {crop.parentGenus && (
          <p className="text-sm text-muted-foreground mt-2">
            {t('partOfGenus', { genus: crop.parentGenus.botanicalName })}{' '}
            <Link href={`/plants/${crop.parentGenus.id}`} className="underline hover:text-foreground">
              {t('viewGenusPage')}
            </Link>
          </p>
        )}
      </div>

      {crop.wikipedia && (crop.wikipedia.extract || crop.wikipedia.thumbnail) && (
        <div className="flex gap-4">
          {crop.wikipedia.thumbnail && (
            <img
              src={crop.wikipedia.thumbnail}
              alt={displayName}
              className="w-24 h-24 object-cover rounded shrink-0"
            />
          )}
          <div className="space-y-1 min-w-0">
            {crop.wikipedia.extract && (
              <p className="text-sm text-muted-foreground line-clamp-4">{crop.wikipedia.extract}</p>
            )}
            <div className="flex gap-3 text-xs text-muted-foreground flex-wrap">
              {crop.wikipedia.articleUrl && (
                <a href={crop.wikipedia.articleUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
                  {t('wikiReadMore')}
                </a>
              )}
              <span>{t('wikiAttribution')}</span>
            </div>
          </div>
        </div>
      )}

      <Separator />

      {crop.species && crop.species.length > 0 && (
        <div>
          <h2 className="font-semibold mb-3">{t('speciesSection')}</h2>
          <div className="flex flex-wrap gap-2">
            {crop.species.map(s => (
              <Link
                key={s.id}
                href={`/plants/${s.id}`}
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                {s.name || s.botanicalName}
              </Link>
            ))}
          </div>
          {crop.speciesCount !== undefined && crop.speciesCount > 8 && (
            <Link
              href={`/plan?q=${encodeURIComponent(genusWord)}`}
              className="text-sm text-muted-foreground underline hover:text-foreground mt-2 inline-block"
            >
              {t('seeAllSpecies', { count: crop.speciesCount })}
            </Link>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            {t('speciesExploreHint')}{' '}
            <Link href={`/plan?q=${encodeURIComponent(genusWord)}`} className="underline hover:text-foreground">
              {t('exploreSpecies')}
            </Link>
          </p>
          <Separator className="mt-4" />
        </div>
      )}

      <div>
        <h2 className="font-semibold mb-3">
          {t('companions')}
          <span className="text-muted-foreground font-normal text-sm ml-2">({companions.length})</span>
        </h2>

        {companions.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('noCompanionData')}</p>
        )}

        <ul className="space-y-3">
          {companions.map(c => {
            const cName = getDisplayName(c)
            const clevel = confidenceLabel(c.confidence)
            const alreadyAdded = inWishlist(c.id)

            // For inherited companions, link to genus relationship page
            const detailsCropA = c.inheritedFrom ? c.inheritedFrom.id : id
            const detailsCropB = c.id
            const [canonA, canonB] = detailsCropA < detailsCropB
              ? [detailsCropA, detailsCropB]
              : [detailsCropB, detailsCropA]

            return (
              <li key={c.id}>
                <Card>
                  <CardContent className="pt-4 pb-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Link href={`/plants/${c.id}`} className="font-medium hover:underline">
                          {cName}
                        </Link>
                        {cName !== c.botanicalName && (
                          <span className="text-muted-foreground italic text-xs ml-1">{c.botanicalName}</span>
                        )}
                        {c.inheritedFrom && (
                          <span className="text-xs text-muted-foreground ml-2">
                            {t('inheritedFrom', { genus: c.inheritedFrom.botanicalName })}
                          </span>
                        )}
                        <div className="flex flex-wrap gap-1 mt-1">
                          {c.type !== 'COMPANION' && ['ATTRACTS', 'NURSE', 'TRAP_CROP'].includes(c.type) && (
                            <Badge variant="secondary" className="text-xs">
                              {t(c.type as 'ATTRACTS' | 'NURSE' | 'TRAP_CROP')}
                            </Badge>
                          )}
                          {c.reason && ['PEST_CONTROL', 'POLLINATION', 'NUTRIENT', 'SHADE', 'ALLELOPATHY'].includes(c.reason) && (
                            <Badge variant="outline" className="text-xs">
                              {t(c.reason as 'PEST_CONTROL' | 'POLLINATION' | 'NUTRIENT' | 'SHADE' | 'ALLELOPATHY')}
                            </Badge>
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
                        {alreadyAdded ? t('inWishlist') : t('addToWishlist')}
                      </Button>
                      {!alreadyAdded && (
                        <Button size="sm" onClick={() => addAndRecommend(c.id)}>
                          {t('addAndRecommend')}
                        </Button>
                      )}
                      <Link
                        href={`/plants/${canonA}/companions/${canonB}`}
                        className="text-xs text-muted-foreground hover:text-foreground underline ml-auto"
                      >
                        {t('details')}
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
