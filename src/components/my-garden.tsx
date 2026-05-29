'use client'
import { useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useSession } from '@/lib/auth-client'
import { Share2 } from 'lucide-react'
import { toast } from 'sonner'

type PlantingStatus = 'PLANNED' | 'PLANTED' | 'HARVESTED'

interface Planting {
  plantingId: string
  cropId: string
  cropName: string
  status: PlantingStatus
}

interface BedAnalysis {
  bedId: string
  companions: { id: string; cropAName: string; cropBName: string; confidence: number }[]
  antagonists: { id: string; cropAName: string; cropBName: string }[]
  unknownCount: number
}

interface Bed {
  id: string
  name: string
  plantings: Planting[]
}

interface MyGardenRef {
  refresh: () => void
}

interface MyGardenProps {
  onAddMore?: (beds: string[][]) => void
}

const STATUS_CYCLE: Record<PlantingStatus, PlantingStatus> = {
  PLANNED: 'PLANTED',
  PLANTED: 'HARVESTED',
  HARVESTED: 'PLANNED',
}

const STATUS_COLOR: Record<PlantingStatus, string> = {
  PLANNED: 'text-gray-500',
  PLANTED: 'text-green-600',
  HARVESTED: 'text-amber-600',
}

const STATUS_KEY: Record<PlantingStatus, 'planned' | 'planted' | 'harvested'> = {
  PLANNED: 'planned',
  PLANTED: 'planted',
  HARVESTED: 'harvested',
}

export const MyGarden = forwardRef<MyGardenRef, MyGardenProps>(function MyGarden({ onAddMore }, ref) {
  const t = useTranslations('MyGarden')
  const { data: session } = useSession()
  const [beds, setBeds] = useState<Bed[]>([])
  const [bedAnalysis, setBedAnalysis] = useState<BedAnalysis[]>([])
  const [loading, setLoading] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)

  const fetchBeds = useCallback(async () => {
    if (!session) return
    setLoading(true)
    try {
      const [plantingsRes, analysisRes] = await Promise.all([
        fetch('/api/garden/plantings'),
        fetch('/api/garden/bed-analysis'),
      ])
      if (plantingsRes.ok) {
        const data = await plantingsRes.json()
        setBeds(data.beds)
      }
      if (analysisRes.ok) {
        const data = await analysisRes.json()
        setBedAnalysis(data.beds)
      }
    } finally {
      setLoading(false)
    }
  }, [session])

  useEffect(() => {
    void fetchBeds()
  }, [fetchBeds])

  useImperativeHandle(ref, () => ({ refresh: fetchBeds }), [fetchBeds])

  async function cycleStatus(plantingId: string, current: PlantingStatus) {
    const next = STATUS_CYCLE[current]
    setBeds(prev => prev.map(b => ({
      ...b,
      plantings: b.plantings.map(p => p.plantingId === plantingId ? { ...p, status: next } : p),
    })))
    const res = await fetch(`/api/garden/plantings/${plantingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
    if (!res.ok) {
      toast.error(t('statusError'))
      void fetchBeds()
    }
  }

  async function handleShare() {
    setSharing(true)
    setShareUrl(null)
    try {
      const res = await fetch('/api/garden/share', { method: 'POST' })
      if (!res.ok) return
      const { token } = await res.json()
      const url = `${window.location.origin}/share/${token}`
      setShareUrl(url)
      await navigator.clipboard.writeText(url).catch(() => {/* clipboard denied — link still shown */})
    } finally {
      setSharing(false)
    }
  }

  if (!session) return null

  return (
    <div className="space-y-4">
      {loading ? (
        <p className="text-sm text-muted-foreground">{t('loading')}</p>
      ) : beds.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {beds.map((bed) => {
              const analysis = bedAnalysis.find(a => a.bedId === bed.id)
              return (
                <Card key={bed.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{bed.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <ul className="space-y-1">
                      {bed.plantings.map((p) => (
                        <li key={p.plantingId} className="text-sm flex items-center justify-between gap-2">
                          <Link href={`/plants/${p.cropId}`} className="hover:underline">{p.cropName}</Link>
                          <button
                            className={`text-xs font-medium hover:underline ${STATUS_COLOR[p.status]}`}
                            onClick={() => void cycleStatus(p.plantingId, p.status)}
                          >
                            {t(STATUS_KEY[p.status])}
                          </button>
                        </li>
                      ))}
                    </ul>

                    {bed.plantings.length < 2 ? (
                      <p className="text-xs text-muted-foreground">{t('addMoreForAnalysis')}</p>
                    ) : analysis ? (
                      <div className="border-t pt-2 space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">{t('bedRelationships')}</p>
                        {analysis.companions.length > 0 && (
                          <p className="text-xs text-green-600">
                            ✓ {(t as (k: string, v: Record<string, unknown>) => string)('companions', { count: analysis.companions.length })}
                          </p>
                        )}
                        {analysis.antagonists.length > 0 && (
                          <details className="text-xs">
                            <summary className="text-red-600 cursor-pointer">
                              ✗ {(t as (k: string, v: Record<string, unknown>) => string)('antagonists', { count: analysis.antagonists.length })}
                            </summary>
                            <ul className="mt-1 ml-3 space-y-0.5 text-muted-foreground">
                              {analysis.antagonists.map(a => (
                                <li key={a.id}>{a.cropAName} × {a.cropBName}</li>
                              ))}
                            </ul>
                          </details>
                        )}
                        {analysis.unknownCount > 0 && (
                          <p className="text-xs text-muted-foreground">
                            ? {(t as (k: string, v: Record<string, unknown>) => string)('unknownPairs', { count: analysis.unknownCount })}
                          </p>
                        )}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              )
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {onAddMore && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onAddMore(beds.map(b => b.plantings.map(p => p.cropId)))}
              >
                {t('addMorePlants')}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleShare}
              disabled={sharing}
            >
              <Share2 className="w-3.5 h-3.5 mr-1.5" />
              {sharing ? t('generating') : t('shareGarden')}
            </Button>
          </div>
          {shareUrl && (
            <p className="text-sm text-muted-foreground">
              {t('copied')}{' '}
              <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="underline text-foreground">
                {shareUrl}
              </a>
            </p>
          )}
        </>
      )}
    </div>
  )
})
