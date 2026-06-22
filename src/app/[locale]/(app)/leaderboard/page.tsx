'use client'
import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

type Period = 'all' | 'yearly' | 'monthly' | 'weekly' | 'daily'

type LeaderboardEntry = {
  userId: string | null
  name: string
  image: string | null
  researchCount: number
  topIncrementalTier: number | null
}

type LeaderboardData =
  | { hidden: true; period: string }
  | {
      hidden?: false
      period: Period
      entries: LeaderboardEntry[]
      community: LeaderboardEntry & { userId: null; name: string }
    }

const PERIODS: { value: Period; labelKey: string }[] = [
  { value: 'all', labelKey: 'allTime' },
  { value: 'yearly', labelKey: 'yearly' },
  { value: 'monthly', labelKey: 'monthly' },
  { value: 'weekly', labelKey: 'weekly' },
  { value: 'daily', labelKey: 'daily' },
]

const TIER_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'Starter', color: 'bg-gray-100 text-gray-700' },
  10: { label: 'Bronze', color: 'bg-amber-100 text-amber-800' },
  30: { label: 'Silver', color: 'bg-slate-100 text-slate-700' },
  50: { label: 'Gold', color: 'bg-yellow-100 text-yellow-800' },
  100: { label: 'Platinum', color: 'bg-cyan-100 text-cyan-800' },
  250: { label: 'Diamond', color: 'bg-blue-100 text-blue-800' },
  500: { label: 'Legend', color: 'bg-purple-100 text-purple-800' },
}

function TierBadge({ tier }: { tier: number }) {
  const info = TIER_LABELS[tier] ?? { label: `Tier ${tier}`, color: 'bg-gray-100 text-gray-700' }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${info.color}`}>
      🏆 {info.label}
    </span>
  )
}

function AvatarCell({ entry }: { entry: LeaderboardEntry }) {
  const initials = entry.name
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  if (entry.image) {
    return (
      <img
        src={entry.image}
        alt={entry.name}
        className="w-8 h-8 rounded-full object-cover"
      />
    )
  }

  return (
    <div className="w-8 h-8 rounded-full bg-[#2D4A3E] text-[#F7F3E8] flex items-center justify-center text-xs font-semibold select-none">
      {initials}
    </div>
  )
}

export default function LeaderboardPage() {
  const t = useTranslations('Leaderboard')
  const router = useRouter()
  const searchParams = useSearchParams()

  const periodParam = (searchParams.get('period') ?? 'all') as Period
  const [activePeriod, setActivePeriod] = useState<Period>(periodParam)
  const [data, setData] = useState<LeaderboardData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async (period: Period) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/leaderboard?period=${period}`)
      if (res.ok) {
        const json = await res.json() as LeaderboardData
        setData(json)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchData(activePeriod)
  }, [activePeriod, fetchData])

  function handlePeriodChange(period: Period) {
    setActivePeriod(period)
    router.replace(`?period=${period}`, { scroll: false })
  }

  const isHidden = data && 'hidden' in data && data.hidden === true
  const entries = data && !isHidden && 'entries' in data ? data.entries : []
  const community = data && !isHidden && 'community' in data ? data.community : null

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">{t('title')}</h1>
      </div>

      {/* Period tabs */}
      <div className="flex gap-1 flex-wrap mb-6">
        {PERIODS.map(({ value, labelKey }) => (
          <button
            key={value}
            onClick={() => handlePeriodChange(value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activePeriod === value
                ? 'bg-[#2D4A3E] text-[#F7F3E8]'
                : 'bg-[#EDE8DC] text-[#5A6E60] hover:bg-[#D6EAF0] hover:text-[#2D4A3E]'
            }`}
          >
            {t(labelKey as Parameters<typeof t>[0])}
          </button>
        ))}
      </div>

      {loading && (
        <p className="text-muted-foreground text-sm">Loading…</p>
      )}

      {!loading && isHidden && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            {t('noData')}
          </CardContent>
        </Card>
      )}

      {!loading && !isHidden && entries.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            {t('noData')}
          </CardContent>
        </Card>
      )}

      {!loading && !isHidden && entries.length > 0 && (
        <div className="space-y-3">
          {/* Table header */}
          <div className="grid grid-cols-[2rem_1fr_auto_auto] gap-3 px-4 text-xs text-muted-foreground font-medium uppercase tracking-wide">
            <span>{t('rank')}</span>
            <span>{t('researcher')}</span>
            <span className="text-right">{t('badge')}</span>
            <span className="text-right">{t('researches')}</span>
          </div>

          {/* Ranked entries */}
          {entries.map((entry, index) => (
            <Card key={entry.userId ?? `entry-${index}`}>
              <CardContent className="py-3 px-4">
                <div className="grid grid-cols-[2rem_1fr_auto_auto] gap-3 items-center">
                  <span className="text-sm font-bold text-muted-foreground tabular-nums">
                    {index + 1}
                  </span>
                  <div className="flex items-center gap-2 min-w-0">
                    <AvatarCell entry={entry} />
                    <div className="min-w-0">
                      {entry.userId ? (
                        <Link
                          href={`/users/${entry.userId}` as Parameters<typeof Link>[0]['href']}
                          className="font-medium text-sm hover:underline truncate block"
                        >
                          {entry.name}
                        </Link>
                      ) : (
                        <span className="font-medium text-sm truncate block">{entry.name}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    {entry.topIncrementalTier != null && (
                      <TierBadge tier={entry.topIncrementalTier} />
                    )}
                  </div>
                  <div className="text-right">
                    <Badge variant="secondary" className="tabular-nums">
                      {entry.researchCount}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Community row */}
          {community && (
            <div className="pt-2">
              <div className="border-t border-dashed mb-3" />
              <Card className="border-[#D6EAF0] bg-[#F7F3E8]/50">
                <CardContent className="py-3 px-4">
                  <div className="grid grid-cols-[2rem_1fr_auto_auto] gap-3 items-center">
                    <span className="text-muted-foreground text-sm">—</span>
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-[#D6EAF0] flex items-center justify-center text-[#2D4A3E] text-xs font-semibold select-none">
                        🌱
                      </div>
                      <div className="min-w-0">
                        <span className="font-medium text-sm">{t('community')}</span>
                        <p className="text-xs text-muted-foreground">{t('fundedBy')}</p>
                      </div>
                    </div>
                    <div />
                    <div className="text-right">
                      <Badge variant="secondary" className="tabular-nums">
                        {community.researchCount}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
