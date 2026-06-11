'use client'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { useGarden } from '@/hooks/use-garden'
import { ZoneDetector } from '@/components/zone-detector'
import { Button } from '@/components/ui/button'

export default function PlanZonePage() {
  const t = useTranslations('Plan')
  const router = useRouter()
  const { state, setZone } = useGarden()

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{t('step', { n: 1 })}</span>
      </div>

      <ZoneDetector
        minTempC={state.minTempC}
        onZoneDetected={(lat, lng, minTempC) => {
          setZone(lat, lng, minTempC)
          router.push('/plan/plants')
        }}
      />

      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={() => router.push('/plan/plants')}>
          {t('skip')}
        </Button>
        {state.minTempC !== null && (
          <Button onClick={() => router.push('/plan/plants')}>
            {t('continue')}
          </Button>
        )}
      </div>
    </main>
  )
}
