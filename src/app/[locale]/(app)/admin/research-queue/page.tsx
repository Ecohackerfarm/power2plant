'use client'
import { useState, useEffect, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Crop = { id: string; name: string; botanicalName: string }
type Funder = { source: string; user: { id: string; name: string } | null }
type Log = { model: string; promptTokens: number; completionTokens: number; costUsd: string } | null

type QueueItem = {
  id: string
  cropA: Crop
  cropB: Crop
  status: string
  triggeredBy: string
  priceCents: number
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  funders: Funder[]
  log: Log
}

const STATUS_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  PENDING: 'outline',
  IN_PROGRESS: 'secondary',
  DONE: 'default',
  FAILED: 'destructive',
}

export default function AdminResearchQueuePage() {
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [priceCents, setPriceCents] = useState<number>(100)
  const [potBalanceCents, setPotBalanceCents] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [enqueuing, setEnqueuing] = useState(false)
  const [cropAId, setCropAId] = useState('')
  const [cropBId, setCropBId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/admin/research-queue')
      .then(r => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return
        setQueue(data.queue ?? [])
        setPriceCents(data.priceCents ?? 100)
        setPotBalanceCents(data.potBalanceCents ?? 0)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function enqueue() {
    setEnqueuing(true)
    setError(null)
    const res = await fetch('/api/admin/research-queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cropAId: cropAId.trim(), cropBId: cropBId.trim() }),
    })
    const data = await res.json() as { error?: string }
    if (!res.ok) {
      setError(data.error ?? 'Failed')
    } else {
      setCropAId('')
      setCropBId('')
      load()
    }
    setEnqueuing(false)
  }

  async function updateStatus(id: string, status: string) {
    await fetch('/api/admin/research-queue', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    load()
  }

  const centsToEur = (c: number) => `€${(c / 100).toFixed(2)}`

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">Research Queue</h1>
        <div className="text-sm text-muted-foreground space-x-4">
          <span>Price: <strong>{centsToEur(priceCents)}</strong></span>
          <span>Pot: <strong>{centsToEur(potBalanceCents)}</strong></span>
        </div>
      </div>

      {/* Manual enqueue */}
      <div className="border rounded-md p-4 mb-6 space-y-3">
        <p className="text-sm font-medium">Manually enqueue pair</p>
        <div className="flex gap-2 flex-wrap">
          <Input
            className="w-64"
            placeholder="Crop A ID"
            value={cropAId}
            onChange={e => setCropAId(e.target.value)}
          />
          <Input
            className="w-64"
            placeholder="Crop B ID"
            value={cropBId}
            onChange={e => setCropBId(e.target.value)}
          />
          <Button
            size="sm"
            disabled={enqueuing || !cropAId.trim() || !cropBId.trim()}
            onClick={enqueue}
          >
            {enqueuing ? 'Enqueueing…' : 'Enqueue'}
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!loading && queue.length === 0 && (
        <p className="text-sm text-muted-foreground">Queue is empty.</p>
      )}

      {!loading && queue.length > 0 && (
        <div className="space-y-2">
          {queue.map(item => (
            <div key={item.id} className="border rounded-md px-4 py-3 space-y-1">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium text-sm">
                    {item.cropA.name} &amp; {item.cropB.name}
                  </p>
                  <p className="text-xs text-muted-foreground italic">
                    {item.cropA.botanicalName} × {item.cropB.botanicalName}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <Badge variant={STATUS_COLORS[item.status] ?? 'outline'}>{item.status}</Badge>
                  <Badge variant="outline">{item.triggeredBy}</Badge>
                  <span className="text-xs text-muted-foreground">{centsToEur(item.priceCents)}</span>
                  {item.status === 'PENDING' && (
                    <Button size="sm" variant="secondary" onClick={() => updateStatus(item.id, 'IN_PROGRESS')}>
                      Start
                    </Button>
                  )}
                  {item.status === 'IN_PROGRESS' && (
                    <>
                      <Button size="sm" onClick={() => updateStatus(item.id, 'DONE')}>Done</Button>
                      <Button size="sm" variant="destructive" onClick={() => updateStatus(item.id, 'FAILED')}>Fail</Button>
                    </>
                  )}
                </div>
              </div>
              {item.funders.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Funders: {item.funders.map(f => f.user?.name ?? `[${f.source}]`).join(', ')}
                </p>
              )}
              {item.log && (
                <p className="text-xs text-muted-foreground">
                  {item.log.model} · {item.log.promptTokens + item.log.completionTokens} tokens · ${item.log.costUsd}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
