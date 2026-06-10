'use client'
import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useSession } from '@/lib/auth-client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getDisplayName } from '@/lib/recommend'
import { ResearchFundButton } from '@/components/research-fund-button'
import { ThumbsUp } from 'lucide-react'

type Crop = { id: string; name: string; botanicalName: string; commonNames: string[] }

type QueueStatus = 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'FAILED'

type QueueStatusInfo = {
  status: QueueStatus
  position: number
  estimatedMinutes: number | null
  startedAt: string | null
  completedAt: string | null
}

type ResearchRequestItem = {
  id: string
  cropAId: string
  cropBId: string | null
  voteCount: number
  funded: boolean
  createdAt: string
  cropA: Crop
  cropB: Crop | null
  hasVoted: boolean
  queueId: string | null
  queueStatus: QueueStatus | null
}

function QueueBadge({ queueId, initialStatus }: { queueId: string; initialStatus: QueueStatus | null }) {
  const [info, setInfo] = useState<QueueStatusInfo | null>(null)

  useEffect(() => {
    let cancelled = false
    async function poll() {
      while (!cancelled) {
        try {
          const res = await fetch(`/api/research-queue/${queueId}/status`)
          if (res.ok) {
            const data = await res.json() as QueueStatusInfo
            if (!cancelled) setInfo(data)
            if (data.status === 'DONE' || data.status === 'FAILED') break
          }
        } catch { /* ignore */ }
        await new Promise(r => setTimeout(r, 30_000))
      }
    }
    // Only poll for non-terminal initial states
    if (initialStatus !== 'DONE' && initialStatus !== 'FAILED') {
      void poll()
    }
    return () => { cancelled = true }
  }, [queueId, initialStatus])

  const status = info?.status ?? initialStatus
  if (!status) return null

  if (status === 'DONE') return <Badge variant="secondary" className="text-green-600">Researched</Badge>
  if (status === 'FAILED') return <Badge variant="destructive">Research failed</Badge>
  if (status === 'IN_PROGRESS') return <Badge variant="secondary" className="animate-pulse">Researching…</Badge>

  // PENDING
  const pos = info?.position ?? 0
  const eta = info?.estimatedMinutes
  return (
    <Badge variant="outline" className="tabular-nums text-xs">
      #{pos + 1} in queue{eta ? ` · ~${eta}m` : ''}
    </Badge>
  )
}

function PairCard({
  item,
  highlighted,
  onVote,
  canVote,
  t,
}: {
  item: ResearchRequestItem
  highlighted: boolean
  onVote: (id: string, cropAId: string, cropBId: string | null) => void
  canVote: boolean
  t: ReturnType<typeof useTranslations>
}) {
  const [voting, setVoting] = useState(false)

  async function handleVote() {
    setVoting(true)
    await onVote(item.id, item.cropAId, item.cropBId)
    setVoting(false)
  }

  const cardId = item.cropBId
    ? `pair-${item.cropAId}-${item.cropBId}`
    : `single-${item.cropAId}`

  return (
    <Card
      id={cardId}
      className={highlighted ? 'border-primary ring-1 ring-primary' : ''}
    >
      <CardContent className="flex items-center justify-between gap-4 py-4">
        <div className="min-w-0">
          <p className="font-medium">
            {getDisplayName(item.cropA)}
            {item.cropB && (
              <>
                <span className="text-muted-foreground mx-2">&amp;</span>
                {getDisplayName(item.cropB)}
              </>
            )}
          </p>
          <p className="text-xs text-muted-foreground italic">
            {item.cropA.botanicalName}
            {item.cropB && <> × {item.cropB.botanicalName}</>}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Badge variant="secondary" className="tabular-nums">
            <ThumbsUp className="w-3 h-3 mr-1" />
            {item.voteCount}
          </Badge>
          {item.queueId && (
            <QueueBadge queueId={item.queueId} initialStatus={item.queueStatus} />
          )}
          {item.cropB && !item.funded && (
            <ResearchFundButton
              cropAName={getDisplayName(item.cropA)}
              cropBName={getDisplayName(item.cropB)}
              cropAId={item.cropAId}
              cropBId={item.cropBId!}
            />
          )}
          <Button
            size="sm"
            variant={item.hasVoted ? 'secondary' : 'default'}
            disabled={!canVote || item.hasVoted || voting}
            onClick={handleVote}
          >
            {item.hasVoted ? t('voted') : t('vote')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default function ResearchRequestsPage() {
  const t = useTranslations('ResearchRequests')
  const { data: session } = useSession()
  const searchParams = useSearchParams()
  const deepA = searchParams.get('a')
  const deepB = searchParams.get('b')

  const [items, setItems] = useState<ResearchRequestItem[]>([])
  const [loading, setLoading] = useState(true)
  const [deepVoted, setDeepVoted] = useState(false)

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch('/api/research-requests')
      if (res.ok) {
        const data = await res.json() as ResearchRequestItem[]
        setItems(data)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchItems() }, [fetchItems])

  // Auto-vote for the deep-linked pair once session is available
  useEffect(() => {
    if (!session || !deepA || !deepB || deepVoted) return
    setDeepVoted(true)
    void fetch('/api/research-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cropAId: deepA, cropBId: deepB }),
    }).then(() => fetchItems())
  }, [session, deepA, deepB, deepVoted, fetchItems])

  // Scroll to highlighted pair after load
  useEffect(() => {
    if (!deepA || !deepB || loading) return
    const normalA = deepA < deepB ? deepA : deepB
    const normalB = deepA < deepB ? deepB : deepA
    const el = document.getElementById(`pair-${normalA}-${normalB}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [deepA, deepB, loading])

  async function handleVote(_id: string, cropAId: string, cropBId: string | null) {
    if (!session) return
    const res = await fetch('/api/research-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cropBId ? { cropAId, cropBId } : { cropAId }),
    })
    if (res.ok) {
      await fetchItems()
    }
  }

  function isHighlighted(item: ResearchRequestItem): boolean {
    if (deepA && deepB && item.cropBId) {
      const normalA = deepA < deepB ? deepA : deepB
      const normalB = deepA < deepB ? deepB : deepA
      return item.cropAId === normalA && item.cropBId === normalB
    }
    if (deepA && !deepB) {
      return item.cropAId === deepA && item.cropBId === null
    }
    return false
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </div>

      {loading && (
        <p className="text-muted-foreground text-sm">{t('loading')}</p>
      )}

      {!loading && items.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            {t('empty')}
          </CardContent>
        </Card>
      )}

      {!loading && !session && items.length > 0 && (
        <p className="text-sm text-muted-foreground mb-4">{t('loginToVote')}</p>
      )}

      <div className="space-y-2">
        {items.map(item => (
          <PairCard
            key={item.id}
            item={item}
            highlighted={isHighlighted(item)}
            onVote={handleVote}
            canVote={!!session}
            t={t}
          />
        ))}
      </div>
    </div>
  )
}
