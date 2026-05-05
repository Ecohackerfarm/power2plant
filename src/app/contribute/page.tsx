'use client'
import { useState, useEffect, useRef } from 'react'
import { useSession } from '@/lib/auth-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getDisplayName } from '@/lib/recommend'
import type { CropRow } from '@/lib/crop-rank'
import Link from 'next/link'

type Crop = Pick<CropRow, 'id' | 'name' | 'botanicalName' | 'commonNames'>

const TYPES = [
  { value: 'COMPANION', label: 'They grow well together' },
  { value: 'AVOID', label: 'They don\'t grow well together' },
] as const

const REASONS = [
  { value: '', label: '— select a reason (optional) —' },
  { value: 'PEST_CONTROL', label: 'Pest control' },
  { value: 'POLLINATION', label: 'Pollination' },
  { value: 'NUTRIENT', label: 'Nutrient sharing' },
  { value: 'SHADE', label: 'Shade benefit' },
  { value: 'ALLELOPATHY', label: 'Natural repellent (allelopathy)' },
  { value: 'OTHER', label: 'Other' },
] as const

function CropPicker({ label, value, onChange }: {
  label: string
  value: Crop | null
  onChange: (crop: Crop | null) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Crop[]>([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); setActiveIndex(-1); return }
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/crops?q=${encodeURIComponent(query.trim())}`)
      const data = await res.json()
      setResults(data.crops ?? [])
      setActiveIndex(-1)
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return
    listRef.current.querySelectorAll('li')[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  function pick(crop: Crop) {
    onChange(crop); setResults([]); setQuery(''); setActiveIndex(-1)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault(); setActiveIndex(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const target = activeIndex >= 0 ? results[activeIndex] : results[0]
      if (target) pick(target)
    } else if (e.key === 'Escape') {
      setResults([]); setActiveIndex(-1)
    }
  }

  if (value) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{getDisplayName(value)}</span>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground underline"
          onClick={() => { onChange(null); setQuery('') }}
        >
          change
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <Input
        placeholder={`Search for ${label.toLowerCase()}…`}
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      {results.length > 0 && (
        <ul ref={listRef} className="border rounded divide-y max-h-48 overflow-y-auto">
          {results.map((crop, index) => (
            <li
              key={crop.id}
              className={`px-3 py-2 text-sm cursor-pointer hover:bg-accent${index === activeIndex ? ' bg-accent' : ''}`}
              onClick={() => pick(crop)}
            >
              <span className="font-medium">{getDisplayName(crop)}</span>
              <span className="text-muted-foreground italic ml-1 text-xs">{crop.botanicalName}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function ContributePage() {
  const { data: session, isPending } = useSession()
  const [cropA, setCropA] = useState<Crop | null>(null)
  const [cropB, setCropB] = useState<Crop | null>(null)
  const [type, setType] = useState<'COMPANION' | 'AVOID'>('COMPANION')
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<'success' | 'ratelimit' | 'error' | null>(null)

  if (isPending) return null

  if (!session) {
    return (
      <main className="max-w-xl mx-auto px-4 py-8">
        <p className="text-muted-foreground">
          <Link href="/" className="underline">Sign in</Link> to contribute companion planting observations.
        </p>
      </main>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!cropA || !cropB) return
    setSubmitting(true)
    setResult(null)
    try {
      const res = await fetch('/api/relationships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cropAId: cropA.id,
          cropBId: cropB.id,
          type,
          reason: reason || undefined,
          notes: notes || undefined,
        }),
      })
      if (res.status === 429) { setResult('ratelimit'); return }
      if (!res.ok) { setResult('error'); return }
      setResult('success')
      setCropA(null); setCropB(null); setReason(''); setNotes('')
    } catch {
      setResult('error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="max-w-xl mx-auto px-4 py-8 space-y-6">
      <div>
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">← Back</Link>
        <h1 className="text-2xl font-bold mt-2">Contribute an observation</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Share what you've noticed in your garden. Your observations help improve recommendations for everyone.
        </p>
      </div>

      {result === 'success' && (
        <p className="text-green-700 text-sm font-medium">Thanks! Your observation has been recorded.</p>
      )}
      {result === 'ratelimit' && (
        <p className="text-amber-700 text-sm">You already submitted a relationship for this pair today.</p>
      )}
      {result === 'error' && (
        <p className="text-red-600 text-sm">Something went wrong. Please try again.</p>
      )}

      <Card>
        <CardHeader><CardTitle>New observation</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1">
              <Label>Plant A</Label>
              <CropPicker label="Plant A" value={cropA} onChange={setCropA} />
            </div>

            <div className="space-y-1">
              <Label>Plant B</Label>
              <CropPicker label="Plant B" value={cropB} onChange={setCropB} />
            </div>

            <div className="space-y-2">
              <Label>Relationship</Label>
              <div className="flex flex-col gap-2">
                {TYPES.map(t => (
                  <label key={t.value} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="type"
                      value={t.value}
                      checked={type === t.value}
                      onChange={() => setType(t.value)}
                    />
                    {t.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="reason">Reason <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <select
                id="reason"
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                value={reason}
                onChange={e => setReason(e.target.value)}
              >
                {REASONS.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="notes">Notes <span className="text-muted-foreground font-normal">(optional, max 500 chars)</span></Label>
              <textarea
                id="notes"
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background resize-none"
                rows={3}
                maxLength={500}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="e.g. Planted together for 3 seasons, noticed fewer aphids…"
              />
              <p className="text-xs text-muted-foreground text-right">{notes.length}/500</p>
            </div>

            <Button
              type="submit"
              disabled={!cropA || !cropB || submitting}
              className="w-full"
            >
              {submitting ? 'Submitting…' : 'Submit observation'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
