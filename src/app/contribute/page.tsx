'use client'
import { useState, useEffect, useRef } from 'react'
import { useSession } from '@/lib/auth-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { getDisplayName } from '@/lib/recommend'
import { classifyUrl } from '@/lib/classify-url'
import type { CropRow } from '@/lib/crop-rank'
import type { SourceClassification } from '@prisma/client'
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

const EVIDENCE_LEVELS = [
  { value: 'ANECDOTAL', label: 'I observed this personally' },
  { value: 'TRADITIONAL', label: 'I\'ve read about this in resources' },
  { value: 'OBSERVED', label: 'I can point to documentation' },
  { value: 'PEER_REVIEWED', label: 'I have peer-reviewed sources' },
] as const

const SOURCE_TYPE_LABELS: Record<SourceClassification, string> = {
  SCIENTIFIC_PAPER: 'Scientific paper',
  ACADEMIC_RESOURCE: 'Academic resource',
  GARDENING_GUIDE: 'Gardening guide',
  BLOG_FORUM: 'Blog / Forum',
  PERSONAL_OBSERVATION: 'Personal observation',
}

const SOURCE_TYPE_BADGE_VARIANTS: Record<SourceClassification, 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'link'> = {
  SCIENTIFIC_PAPER: 'default',
  ACADEMIC_RESOURCE: 'secondary',
  GARDENING_GUIDE: 'outline',
  BLOG_FORUM: 'ghost',
  PERSONAL_OBSERVATION: 'ghost',
}

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
  const [reasons, setReasons] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [evidenceLevel, setEvidenceLevel] = useState<string>('ANECDOTAL')
  const [sourceUrls, setSourceUrls] = useState<string[]>([])
  const [sourceTypes, setSourceTypes] = useState<SourceClassification[]>([])
  const [sourceOverrides, setSourceOverrides] = useState<(SourceClassification | null)[]>([])
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
      const urls = sourceUrls.filter(Boolean)
      const overrides: Record<number, string> = {}
      sourceOverrides.forEach((ov, idx) => {
        if (ov && urls[idx]) overrides[idx] = ov
      })
      const res = await fetch('/api/relationships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cropAId: cropA.id,
          cropBId: cropB.id,
          type,
          reason: reasons.length > 0 ? reasons : undefined,
          notes: notes || undefined,
          sources: urls.length > 0 ? urls : undefined,
          evidenceLevel,
          sourceTypeOverrides: Object.keys(overrides).length > 0 ? overrides : undefined,
        }),
      })
      if (res.status === 429) { setResult('ratelimit'); return }
      if (!res.ok) { setResult('error'); return }
      setResult('success')
      setCropA(null); setCropB(null); setReasons([]); setNotes(''); setEvidenceLevel('ANECDOTAL')
      setSourceUrls([]); setSourceTypes([]); setSourceOverrides([])
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
              <Label htmlFor="reasons">Reasons <span className="text-muted-foreground font-normal">(optional, select all that apply)</span></Label>
              <select
                id="reasons"
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                multiple
                value={reasons}
                onChange={e => setReasons(Array.from(e.target.selectedOptions).map(option => option.value))}
              >
                {REASONS.slice(1).map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="notes">Notes <span className="text-muted-foreground font-normal">(optional, max 2000 chars)</span></Label>
              <textarea
                id="notes"
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background resize-none"
                rows={5}
                maxLength={2000}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="e.g. Planted together for 3 seasons, noticed fewer aphids…"
              />
              <p className="text-xs text-muted-foreground text-right">{notes.length}/2000</p>
            </div>

            <div className="space-y-2">
              <Label>Evidence level</Label>
              <p className="text-xs text-muted-foreground">Select the highest quality evidence you have for this observation.</p>
              <div className="flex flex-col gap-2">
                {EVIDENCE_LEVELS.map(el => (
                  <label key={el.value} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="evidenceLevel"
                      value={el.value}
                      checked={evidenceLevel === el.value}
                      onChange={() => setEvidenceLevel(el.value)}
                    />
                    {el.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Label>Sources <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <p className="text-xs text-muted-foreground">
                doi.org and PubMed links are recognised automatically as scientific papers.
              </p>
              {sourceUrls.map((url, idx) => {
                const detected = sourceTypes[idx] ?? 'BLOG_FORUM'
                const override = sourceOverrides[idx]
                const displayType = override ?? detected
                return (
                  <div key={idx} className="flex items-start gap-2 mb-2">
                    <span className="text-sm font-medium mt-2 shrink-0">[{idx + 1}]</span>
                    <div className="flex-1 space-y-1">
                      <Input
                        value={url}
                        placeholder="https://..."
                        onChange={e => {
                          const next = [...sourceUrls]
                          next[idx] = e.target.value
                          setSourceUrls(next)
                        }}
                        onBlur={e => {
                          const classified = classifyUrl(e.target.value)
                          const nextTypes = [...sourceTypes]
                          nextTypes[idx] = classified
                          setSourceTypes(nextTypes)
                        }}
                      />
                      <div className="flex items-center gap-2">
                        <Badge variant={SOURCE_TYPE_BADGE_VARIANTS[displayType]}>
                          {SOURCE_TYPE_LABELS[displayType]}
                        </Badge>
                        <select
                          className="text-xs border rounded px-1 py-0.5 bg-background"
                          value={override ?? ''}
                          onChange={e => {
                            const val = e.target.value
                            const next = [...sourceOverrides]
                            next[idx] = val ? (val as SourceClassification) : null
                            setSourceOverrides(next)
                          }}
                        >
                          <option value="">Auto-detected</option>
                          {(Object.entries(SOURCE_TYPE_LABELS) as [SourceClassification, string][]).map(([key, label]) => (
                            <option key={key} value={key}>{label}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="text-xs text-muted-foreground hover:text-foreground underline shrink-0"
                          onClick={() => {
                            setSourceUrls(sourceUrls.filter((_, i) => i !== idx))
                            setSourceTypes(sourceTypes.filter((_, i) => i !== idx))
                            setSourceOverrides(sourceOverrides.filter((_, i) => i !== idx))
                          }}
                        >
                          remove
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
              <Button
                type="button"
                onClick={() => {
                  setSourceUrls([...sourceUrls, ''])
                  setSourceTypes([...sourceTypes, 'BLOG_FORUM'])
                  setSourceOverrides([...sourceOverrides, null])
                }}
                disabled={sourceUrls.length >= 20}
                className="mt-2"
              >
                Add source
              </Button>
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
