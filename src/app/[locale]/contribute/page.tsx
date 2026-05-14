'use client'
import { useState, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { useSession } from '@/lib/auth-client'
import { Link } from '@/i18n/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { getDisplayName } from '@/lib/recommend'
import { classifyUrl } from '@/lib/classify-url'
import type { CropRow } from '@/lib/crop-rank'
import type { SourceClassification } from '@prisma/client'

type Crop = Pick<CropRow, 'id' | 'name' | 'botanicalName' | 'commonNames' | 'rank'>

const SOURCE_TYPE_BADGE_VARIANTS: Record<SourceClassification, 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'link'> = {
  SCIENTIFIC_PAPER: 'default',
  ACADEMIC_RESOURCE: 'secondary',
  GARDENING_GUIDE: 'outline',
  BLOG_FORUM: 'ghost',
  PERSONAL_OBSERVATION: 'ghost',
}

const SOURCE_TYPES: SourceClassification[] = [
  'SCIENTIFIC_PAPER', 'ACADEMIC_RESOURCE', 'GARDENING_GUIDE', 'BLOG_FORUM', 'PERSONAL_OBSERVATION',
]

const RELATIONSHIP_TYPES = ['COMPANION', 'AVOID'] as const
const REASONS = ['PEST_CONTROL', 'POLLINATION', 'NUTRIENT', 'SHADE', 'ALLELOPATHY', 'OTHER'] as const
const EVIDENCE_LEVELS = ['ANECDOTAL', 'TRADITIONAL', 'OBSERVED', 'PEER_REVIEWED'] as const

function CropPicker({ label, value, onChange, showGenusHint = false }: {
  label: string
  value: Crop | null
  onChange: (crop: Crop | null) => void
  showGenusHint?: boolean
  genusHint?: string
  changeLabel?: string
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Crop[]>([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const listRef = useRef<HTMLUListElement>(null)
  const t = useTranslations('Contribute')

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
          {t('change')}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {showGenusHint && (
        <p className="text-xs text-muted-foreground italic">{t('genusHint')}</p>
      )}
      <Input
        placeholder={t('searchFor', { label: label.toLowerCase() })}
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      {results.length > 0 && (
        <ul ref={listRef} className="border rounded divide-y max-h-48 overflow-y-auto">
          {results.map((crop, index) => {
            const isGenus = crop.rank === 'genus'
            return (
              <li
                key={crop.id}
                className={`px-3 py-2 text-sm cursor-pointer hover:bg-accent${index === activeIndex ? ' bg-accent' : ''}${isGenus ? ' text-muted-foreground' : ''}`}
                onClick={() => pick(crop)}
              >
                <span className={`font-medium${isGenus ? ' text-muted-foreground' : ''}`}>{getDisplayName(crop)}</span>
                <span className="text-muted-foreground italic ml-1 text-xs">{crop.botanicalName}</span>
                {isGenus && (
                  <span className="ml-1.5 inline-block bg-muted text-muted-foreground text-[10px] px-1 py-0.5 rounded font-normal not-italic">Genus</span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default function ContributePage() {
  const t = useTranslations('Contribute')
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
          <Link href="/" className="underline">{t('signInLink')}</Link>{' '}
          {t('signInPrompt')}
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
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">{t('back')}</Link>
        <h1 className="text-2xl font-bold mt-2">{t('title')}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t('subtitle')}</p>
      </div>

      {result === 'success' && (
        <p className="text-green-700 text-sm font-medium">{t('success')}</p>
      )}
      {result === 'ratelimit' && (
        <p className="text-amber-700 text-sm">{t('rateLimit')}</p>
      )}
      {result === 'error' && (
        <p className="text-red-600 text-sm">{t('error')}</p>
      )}

      <Card>
        <CardHeader><CardTitle>{t('newObservation')}</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1">
              <Label>{t('plantA')}</Label>
              <CropPicker label={t('plantA')} value={cropA} onChange={setCropA} showGenusHint />
            </div>

            <div className="space-y-1">
              <Label>{t('plantB')}</Label>
              <CropPicker label={t('plantB')} value={cropB} onChange={setCropB} />
            </div>

            <div className="space-y-2">
              <Label>{t('relationship')}</Label>
              <div className="flex flex-col gap-2">
                {RELATIONSHIP_TYPES.map(rt => (
                  <label key={rt} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="type"
                      value={rt}
                      checked={type === rt}
                      onChange={() => setType(rt)}
                    />
                    {t(rt as 'COMPANION' | 'AVOID')}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="reasons">
                {t('reasons')}{' '}
                <span className="text-muted-foreground font-normal">{t('optionalSelectAll')}</span>
              </Label>
              <select
                id="reasons"
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                multiple
                value={reasons}
                onChange={e => setReasons(Array.from(e.target.selectedOptions).map(o => o.value))}
              >
                {REASONS.map(r => (
                  <option key={r} value={r}>{t(r)}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="notes">
                {t('notes')}{' '}
                <span className="text-muted-foreground font-normal">{t('notesOptional')}</span>
              </Label>
              <textarea
                id="notes"
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background resize-none"
                rows={5}
                maxLength={2000}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={t('notesPlaceholder')}
              />
              <p className="text-xs text-muted-foreground text-right">{notes.length}/2000</p>
            </div>

            <div className="space-y-2">
              <Label>{t('evidenceLevel')}</Label>
              <p className="text-xs text-muted-foreground">{t('evidenceLevelHint')}</p>
              <div className="flex flex-col gap-2">
                {EVIDENCE_LEVELS.map(el => (
                  <label key={el} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="evidenceLevel"
                      value={el}
                      checked={evidenceLevel === el}
                      onChange={() => setEvidenceLevel(el)}
                    />
                    {t(el)}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Label>
                {t('sources')}{' '}
                <span className="text-muted-foreground font-normal">{t('sourcesOptional')}</span>
              </Label>
              <p className="text-xs text-muted-foreground">{t('sourcesHint')}</p>
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
                          {t(displayType)}
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
                          <option value="">{t('autoDetected')}</option>
                          {SOURCE_TYPES.map(key => (
                            <option key={key} value={key}>{t(key)}</option>
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
                          {t('remove')}
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
                {t('addSource')}
              </Button>
            </div>

            <Button
              type="submit"
              disabled={!cropA || !cropB || submitting}
              className="w-full"
            >
              {submitting ? t('submitting') : t('submit')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
