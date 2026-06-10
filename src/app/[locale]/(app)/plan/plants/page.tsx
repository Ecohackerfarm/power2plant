'use client'
import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { useGarden } from '@/hooks/use-garden'
import { useInspirations } from '@/hooks/use-inspirations'
import { PlantSearch } from '@/components/plant-search'
import { Button } from '@/components/ui/button'

export default function PlanPlantsPage() {
  const t = useTranslations('Plan')
  const router = useRouter()
  const { state, addToWishlist, removeFromWishlist, clearWishlist } = useGarden()
  const { inspirationIds, add: addInspiration, remove: removeInspiration } = useInspirations()
  const [searchQuery, setSearchQuery] = useState<string | undefined>(undefined)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const q = params.get('q')
    if (q) setSearchQuery(q)
  }, [])

  const canContinue = state.wishlist.length >= 2

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <button className="hover:text-foreground" onClick={() => router.push('/plan/zone')}>
          {t('back')}
        </button>
        <span>{t('step', { n: 2 })}</span>
      </div>

      <PlantSearch
        wishlistIds={state.wishlist}
        onAdd={addToWishlist}
        onRemove={removeFromWishlist}
        onClearAll={clearWishlist}
        initialQuery={searchQuery}
        inspirationIds={inspirationIds}
        onInspire={addInspiration}
        onUninspire={removeInspiration}
      />

      <div className="flex items-center gap-3">
        <Button
          onClick={() => router.push('/plan/beds')}
          disabled={!canContinue}
        >
          {t('continue')}
        </Button>
        {!canContinue && (
          <p className="text-sm text-muted-foreground">{t('addAtLeast2')}</p>
        )}
      </div>
    </main>
  )
}
