'use client'
import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MyInspirations } from '@/components/my-inspirations'
import { useSession } from '@/lib/auth-client'

interface BedSummary {
  bedCount: number
  plantingCount: number
}

export default function GardenOverviewPage() {
  const t = useTranslations('GardenPage')
  const { data: session, isPending } = useSession()
  const [summary, setSummary] = useState<BedSummary | null>(null)

  useEffect(() => {
    if (!session) return
    fetch('/api/garden/plantings')
      .then(r => r.ok ? r.json() : null)
      .then((data: { beds: { plantings: unknown[] }[] } | null) => {
        if (!data) return
        setSummary({
          bedCount: data.beds.length,
          plantingCount: data.beds.reduce((sum, b) => sum + b.plantings.length, 0),
        })
      })
      .catch(() => {})
  }, [session?.session.id])

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('overviewTitle')}</h1>
        <p className="text-muted-foreground mt-1">{t('overviewSubtitle')}</p>
      </div>

      {!isPending && !session && (
        <p className="text-sm text-muted-foreground">{t('signInPrompt')}</p>
      )}

      {session && (
        <div className="grid sm:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('bedsSection')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {summary ? (
                summary.bedCount === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('noBedsYet')}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {(t as (k: string, v: Record<string, unknown>) => string)('bedsSummary', {
                      count: summary.bedCount,
                      plantings: summary.plantingCount,
                    })}
                  </p>
                )
              ) : (
                <p className="text-sm text-muted-foreground">{t('loading')}</p>
              )}
              <div className="flex gap-3 flex-wrap">
                <Link
                  href="/garden/beds"
                  className="text-sm font-medium hover:underline"
                >
                  {t('manageBeds')}
                </Link>
                <Link
                  href="/plan"
                  className="text-sm text-muted-foreground hover:text-foreground hover:underline"
                >
                  {t('goToPlan')}
                </Link>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('inspirationsSection')}</CardTitle>
            </CardHeader>
            <CardContent>
              <MyInspirations />
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  )
}
