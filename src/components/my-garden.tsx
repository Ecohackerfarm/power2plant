'use client'
import { useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useSession } from '@/lib/auth-client'
import { Share2 } from 'lucide-react'

type PlantingStatus = 'PLANNED' | 'PLANTED' | 'HARVESTED'

interface Planting {
  plantingId: string
  cropId: string
  cropName: string
  status: PlantingStatus
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

export const MyGarden = forwardRef<MyGardenRef, MyGardenProps>(function MyGarden({ onAddMore }, ref) {
  const { data: session } = useSession()
  const [beds, setBeds] = useState<Bed[]>([])
  const [loading, setLoading] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)

  const fetchBeds = useCallback(async () => {
    if (!session) return
    setLoading(true)
    try {
      const res = await fetch('/api/garden/plantings')
      if (res.ok) {
        const data = await res.json()
        setBeds(data.beds)
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
    if (!res.ok) void fetchBeds()
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
      <h2 className="text-xl font-semibold">My Garden</h2>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : beds.length === 0 ? (
        <p className="text-sm text-muted-foreground">No plan saved yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {beds.map((bed) => (
              <Card key={bed.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{bed.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1">
                    {bed.plantings.map((p) => (
                      <li key={p.plantingId} className="text-sm flex items-center justify-between gap-2">
                        <span>{p.cropName}</span>
                        <button
                          className={`text-xs font-medium hover:underline ${STATUS_COLOR[p.status]}`}
                          onClick={() => void cycleStatus(p.plantingId, p.status)}
                        >
                          {p.status.toLowerCase()}
                        </button>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {onAddMore && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onAddMore(beds.map(b => b.plantings.map(p => p.cropId)))}
              >
                Add more plants
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleShare}
              disabled={sharing}
            >
              <Share2 className="w-3.5 h-3.5 mr-1.5" />
              {sharing ? 'Generating…' : 'Share plan'}
            </Button>
          </div>
          {shareUrl && (
            <p className="text-sm text-muted-foreground">
              Link copied!{' '}
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
