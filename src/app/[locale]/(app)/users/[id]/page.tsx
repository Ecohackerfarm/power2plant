'use client'
import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import Image from 'next/image'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

type Crop = { id: string; name: string; botanicalName: string }

type UserBadge = {
  id: string
  type: 'INCREMENTAL' | 'PLANT' | 'PAIR'
  slug: string
  tier: number | null
  cropId: string | null
  crop: Crop | null
  cropAId: string | null
  cropA: Crop | null
  cropBId: string | null
  cropB: Crop | null
  awardedAt: string
}

type ProfileData = {
  user: { id: string; name: string; image: string | null }
  badges: UserBadge[]
}

const TIER_LABELS: Record<number, string> = {
  1: 'Starter',
  10: 'Bronze',
  30: 'Silver',
  50: 'Gold',
  100: 'Platinum',
  250: 'Diamond',
  500: 'Legend',
}

const TIER_COLORS: Record<number, string> = {
  1: '#6b7280',
  10: '#cd7f32',
  30: '#c0c0c0',
  50: '#ffd700',
  100: '#e5e4e2',
  250: '#b9f2ff',
  500: '#ff69b4',
}

const TIER_ORDER = [1, 10, 30, 50, 100, 250, 500]

function getHighestTier(badges: UserBadge[]): number | null {
  const tiers = badges
    .map(b => b.tier)
    .filter((t): t is number => t !== null)
  if (tiers.length === 0) return null
  return Math.max(...tiers)
}

function getNextTier(current: number): number | null {
  const idx = TIER_ORDER.indexOf(current)
  if (idx === -1 || idx === TIER_ORDER.length - 1) return null
  return TIER_ORDER[idx + 1]
}

export default function UserProfilePage({ params }: { params: { id: string } }) {
  const t = useTranslations('UserProfile')
  const [data, setData] = useState<ProfileData | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/users/${params.id}/badges`)
      .then(async res => {
        if (res.status === 404) {
          setNotFound(true)
          return
        }
        const json = await res.json()
        setData(json)
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [params.id])

  if (loading) {
    return (
      <div className="max-w-xl mx-auto px-4 py-10">
        <p className="text-muted-foreground">{t('loading')}</p>
      </div>
    )
  }

  if (notFound || !data) {
    return (
      <div className="max-w-xl mx-auto px-4 py-10">
        <p className="text-muted-foreground">{t('notFound')}</p>
      </div>
    )
  }

  const { user, badges } = data

  const incrementalBadges = badges.filter(b => b.type === 'INCREMENTAL')
  const plantBadges = badges.filter(b => b.type === 'PLANT')
  const pairBadges = badges.filter(b => b.type === 'PAIR')

  const highestTier = getHighestTier(incrementalBadges)
  const nextTier = highestTier !== null ? getNextTier(highestTier) : null

  const initial = user.name ? user.name.charAt(0).toUpperCase() : '?'

  return (
    <div className="max-w-xl mx-auto px-4 py-10 space-y-8">
      {/* User header */}
      <div className="flex items-center gap-4">
        {user.image ? (
          <Image
            src={user.image}
            alt={user.name}
            width={64}
            height={64}
            className="rounded-full object-cover"
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-2xl font-semibold">
            {initial}
          </div>
        )}
        <h1 className="text-2xl font-bold">{user.name}</h1>
      </div>

      {/* Badges card */}
      <Card>
        <CardHeader>
          <CardTitle>{t('badges')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-8">
          {badges.length === 0 && (
            <p className="text-muted-foreground">{t('noBadges')}</p>
          )}

          {/* INCREMENTAL badges */}
          {incrementalBadges.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-semibold">{t('incrementalBadges')}</h2>
              {highestTier !== null && (
                <div className="flex items-center gap-3">
                  <span
                    className="inline-flex items-center justify-center w-12 h-12 rounded-full text-sm font-bold border-2"
                    style={{
                      color: TIER_COLORS[highestTier],
                      borderColor: TIER_COLORS[highestTier],
                    }}
                  >
                    {highestTier}
                  </span>
                  <div>
                    <p className="font-semibold" style={{ color: TIER_COLORS[highestTier] }}>
                      {TIER_LABELS[highestTier]}
                    </p>
                    {nextTier !== null && (
                      <p className="text-xs text-muted-foreground">
                        Next: {TIER_LABELS[nextTier]} at {nextTier}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* PLANT badges */}
          {plantBadges.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-semibold">
                {t('plantBadges')}{' '}
                <span className="text-muted-foreground font-normal text-sm">
                  {t('plantsResearched', { count: plantBadges.length })}
                </span>
              </h2>
              <div className="flex flex-wrap gap-2">
                {plantBadges.map(b => (
                  <Badge key={b.id} variant="secondary">
                    {b.crop?.name ?? b.slug}
                  </Badge>
                ))}
              </div>
            </section>
          )}

          {/* PAIR badges */}
          {pairBadges.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-semibold">
                {t('pairBadges')}{' '}
                <span className="text-muted-foreground font-normal text-sm">
                  {t('pairsResearched', { count: pairBadges.length })}
                </span>
              </h2>
              <div className="flex flex-wrap gap-2">
                {pairBadges.map(b => (
                  <Badge key={b.id} variant="secondary">
                    {b.cropA?.name ?? b.cropAId ?? '?'} + {b.cropB?.name ?? b.cropBId ?? '?'}
                  </Badge>
                ))}
              </div>
            </section>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
