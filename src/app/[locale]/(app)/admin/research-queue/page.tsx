'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Crop = { id: string; name: string; botanicalName: string; commonNames?: string[] }
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

function displayName(crop: Crop): string {
  const raw = crop.commonNames?.[0] ?? (crop.name !== crop.botanicalName ? crop.name : crop.botanicalName)
  return raw.replace(/(^|[\s-])(\S)/g, (_: string, sep: string, c: string) => sep + c.toUpperCase())
}

function CropPicker({ label, value, onChange }: {
  label: string
  value: Crop | null
  onChange: (crop: Crop | null) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Crop[]>([])
  const [searching, setSearching] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (query.trim().length < 2) { setResults([]); return }
    timerRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/crops?q=${encodeURIComponent(query.trim())}&locale=en`)
        const data = res.ok ? await res.json() : { crops: [] }
        setResults((data.crops ?? []).slice(0, 8))
      } finally {
        setSearching(false)
      }
    }, 250)
  }, [query])

  function select(crop: Crop) {
    onChange(crop)
    setQuery(displayName(crop))
    setResults([])
  }

  function clear() {
    onChange(null)
    setQuery('')
    setResults([])
  }

  return (
    <div className="relative w-64">
      <div className="flex gap-1">
        <Input
          placeholder={label}
          value={query}
          onChange={e => { setQuery(e.target.value); if (value) onChange(null) }}
          className="text-sm"
        />
        {value && (
          <button
            type="button"
            onClick={clear}
            className="text-muted-foreground hover:text-foreground px-1 text-lg leading-none"
          >
            ×
          </button>
        )}
      </div>
      {searching && <p className="text-xs text-muted-foreground mt-0.5">Searching…</p>}
      {results.length > 0 && !value && (
        <ul className="absolute z-10 mt-1 w-full bg-background border rounded shadow-md max-h-48 overflow-y-auto">
          {results.map(crop => (
            <li
              key={crop.id}
              className="px-3 py-1.5 text-sm cursor-pointer hover:bg-accent"
              onClick={() => select(crop)}
            >
              <span className="font-medium">{displayName(crop)}</span>
              <span className="text-muted-foreground italic ml-1 text-xs">{crop.botanicalName}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function AdminResearchQueuePage() {
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [priceCents, setPriceCents] = useState<number>(100)
  const [potBalanceCents, setPotBalanceCents] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [enqueuing, setEnqueuing] = useState(false)
  const [cropA, setCropA] = useState<Crop | null>(null)
  const [cropB, setCropB] = useState<Crop | null>(null)
  const [pickerKey, setPickerKey] = useState(0)
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
    if (!cropA || !cropB) return
    setEnqueuing(true)
    setError(null)
    const res = await fetch('/api/admin/research-queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cropAId: cropA.id, cropBId: cropB.id }),
    })
    const data = await res.json() as { error?: string }
    if (!res.ok) {
      setError(data.error ?? 'Failed')
    } else {
      setCropA(null)
      setCropB(null)
      setPickerKey(k => k + 1)
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
        <div className="flex gap-2 flex-wrap items-start">
          <CropPicker key={`a-${pickerKey}`} label="Search crop A…" value={cropA} onChange={setCropA} />
          <CropPicker key={`b-${pickerKey}`} label="Search crop B…" value={cropB} onChange={setCropB} />
          <Button
            size="sm"
            disabled={enqueuing || !cropA || !cropB}
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
