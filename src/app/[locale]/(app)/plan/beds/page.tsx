'use client'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { useSession } from '@/lib/auth-client'
import { useGarden } from '@/hooks/use-garden'
import { BedConfig } from '@/components/bed-config'
import { PaidFeatures } from '@/components/paid-features'
import { Button } from '@/components/ui/button'

export const FREE_BED_MAX = 20
export const PAID_BED_MAX = 100
export const PLANTS_PER_BED_MAX = 5

export default function PlanBedsPage() {
  const t = useTranslations('Plan')
  const router = useRouter()
  const { data: session } = useSession()
  const { state, setBeds } = useGarden()
  const [balanceCents, setBalanceCents] = useState<number | null>(null)

  useEffect(() => {
    if (!session) return
    fetch('/api/credits/balance')
      .then(r => r.ok ? r.json() : null)
      .then((d: { balanceCents: number } | null) => {
        if (d) setBalanceCents(d.balanceCents)
      })
      .catch(() => {})
  }, [session?.session.id])

  const isPaid = balanceCents !== null && balanceCents > 0
  const bedMax = isPaid ? PAID_BED_MAX : FREE_BED_MAX
  const atFreeMax = !isPaid && state.bedCount >= FREE_BED_MAX

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <button className="hover:text-foreground" onClick={() => router.push('/plan/plants')}>
          {t('back')}
        </button>
        <span>{t('step', { n: 3 })}</span>
      </div>

      <BedConfig
        bedCount={state.bedCount}
        bedCapacity={state.bedCapacity}
        bedMax={bedMax}
        plantsPerBedMax={PLANTS_PER_BED_MAX}
        onChange={setBeds}
      />

      {atFreeMax && <PaidFeatures />}

      <div className="flex items-center gap-3">
        <Button onClick={() => router.push('/plan/results?compute=1')}>
          {t('continue')}
        </Button>
      </div>
    </main>
  )
}
