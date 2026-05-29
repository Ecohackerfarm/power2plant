'use client'
import { useState, useEffect, useCallback, useImperativeHandle, forwardRef, useRef } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useSession } from '@/lib/auth-client'
import { Share2, Pencil, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { getDisplayName } from '@/lib/recommend'
import type { CropRow } from '@/lib/crop-rank'

type PlantingStatus = 'PLANNED' | 'PLANTED' | 'HARVESTED'

interface Planting {
  plantingId: string
  cropId: string
  cropName: string
  status: PlantingStatus
}

interface UnknownPair {
  cropAId: string
  cropBId: string
  cropAName: string
  cropBName: string
}

interface BedAnalysis {
  bedId: string
  companions: { id: string; cropAName: string; cropBName: string; confidence: number }[]
  antagonists: { id: string; cropAName: string; cropBName: string }[]
  unknownPairs: UnknownPair[]
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
  const locale = useLocale()
  const { data: session } = useSession()
  const [beds, setBeds] = useState<Bed[]>([])
  const [bedAnalysis, setBedAnalysis] = useState<BedAnalysis[]>([])
  const [loading, setLoading] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const [votedPairs, setVotedPairs] = useState<Set<string>>(new Set())
  const [votingPair, setVotingPair] = useState<string | null>(null)

  // Edit state
  const [editingBedId, setEditingBedId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editCrops, setEditCrops] = useState<{ id: string; name: string }[]>([])
  const [editQuery, setEditQuery] = useState('')
  const [editResults, setEditResults] = useState<CropRow[]>([])
  const [editSearching, setEditSearching] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [deletingBedId, setDeletingBedId] = useState<string | null>(null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchBeds = useCallback(async () => {
    if (!session) return
    setLoading(true)
    try {
      const [plantingsRes, analysisRes] = await Promise.all([
        fetch(`/api/garden/plantings?locale=${locale}`),
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
  }, [session, locale])

  useEffect(() => {
    void fetchBeds()
  }, [fetchBeds])

  useImperativeHandle(ref, () => ({ refresh: fetchBeds }), [fetchBeds])

  // Debounced search for edit mode
  useEffect(() => {
    if (editingBedId === null) return
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    if (editQuery.trim().length < 2) { setEditResults([]); return }
    searchTimerRef.current = setTimeout(async () => {
      setEditSearching(true)
      try {
        const res = await fetch(`/api/crops?q=${encodeURIComponent(editQuery.trim())}&locale=${locale}`)
        if (res.ok) {
          const data = await res.json()
          setEditResults(data.crops ?? [])
        }
      } finally {
        setEditSearching(false)
      }
    }, 300)
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [editQuery, editingBedId, locale])

  function startEdit(bed: Bed) {
    setEditingBedId(bed.id)
    setEditName(bed.name)
    setEditCrops(bed.plantings.map(p => ({ id: p.cropId, name: p.cropName })))
    setEditQuery('')
    setEditResults([])
  }

  function cancelEdit() {
    setEditingBedId(null)
    setEditQuery('')
    setEditResults([])
  }

  async function saveEdit(bedId: string) {
    if (editCrops.length === 0) {
      toast.error(t('mustHaveOnePlant'))
      return
    }
    setEditSaving(true)
    try {
      const res = await fetch(`/api/garden/beds/${bedId}?locale=${locale}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() || undefined, cropIds: editCrops.map(c => c.id) }),
      })
      if (!res.ok) {
        toast.error(t('saveError'))
        return
      }
      const updated = await res.json() as Bed
      setBeds(prev => prev.map(b => b.id === bedId ? updated : b))
      cancelEdit()
    } finally {
      setEditSaving(false)
    }
  }

  async function deleteBed(bed: Bed) {
    if (!window.confirm(t('confirmDelete', { name: bed.name }))) return
    setDeletingBedId(bed.id)
    try {
      const res = await fetch(`/api/garden/beds/${bed.id}`, { method: 'DELETE' })
      if (!res.ok) {
        toast.error(t('deleteError'))
        return
      }
      setBeds(prev => prev.filter(b => b.id !== bed.id))
      setBedAnalysis(prev => prev.filter(a => a.bedId !== bed.id))
    } finally {
      setDeletingBedId(null)
    }
  }

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

  async function voteResearch(pair: UnknownPair) {
    const key = [pair.cropAId, pair.cropBId].sort().join(':')
    if (votedPairs.has(key) || votingPair === key) return
    setVotingPair(key)
    try {
      const res = await fetch('/api/research-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cropAId: pair.cropAId, cropBId: pair.cropBId }),
      })
      if (res.ok) {
        setVotedPairs(prev => new Set([...prev, key]))
      } else {
        toast.error(t('voteError'))
      }
    } finally {
      setVotingPair(null)
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
              const isEditing = editingBedId === bed.id
              const isDeleting = deletingBedId === bed.id
              const editSelectedIds = new Set(editCrops.map(c => c.id))

              return (
                <Card key={bed.id}>
                  <CardHeader className="pb-2">
                    {isEditing ? (
                      <Input
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        maxLength={50}
                        className="text-base font-semibold h-8"
                        autoFocus
                      />
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-base">{bed.name}</CardTitle>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            className="text-muted-foreground hover:text-foreground p-0.5"
                            onClick={() => startEdit(bed)}
                            aria-label={t('editBed')}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            className="text-muted-foreground hover:text-destructive p-0.5"
                            onClick={() => void deleteBed(bed)}
                            disabled={isDeleting}
                            aria-label={t('deleteBed')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {isEditing ? (
                      <>
                        <div className="flex flex-wrap gap-1.5">
                          {editCrops.map(c => (
                            <Badge key={c.id} variant="secondary" className="gap-1 text-xs">
                              {c.name}
                              <button
                                onClick={() => setEditCrops(prev => prev.filter(ec => ec.id !== c.id))}
                                className="ml-0.5 text-muted-foreground hover:text-foreground"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                        <div className="space-y-1">
                          <Input
                            placeholder={t('searchPlants')}
                            value={editQuery}
                            onChange={e => setEditQuery(e.target.value)}
                            autoComplete="off"
                            className="h-8 text-sm"
                          />
                          {editSearching && <p className="text-xs text-muted-foreground">{t('searching')}</p>}
                          {editResults.length > 0 && (
                            <ul className="space-y-0.5 max-h-40 overflow-y-auto border rounded p-1">
                              {editResults.map(crop => {
                                const already = editSelectedIds.has(crop.id)
                                const displayName = getDisplayName(crop)
                                return (
                                  <li
                                    key={crop.id}
                                    className={`flex items-center text-sm px-2 py-1 rounded select-none ${
                                      already ? 'opacity-50 cursor-default' : 'cursor-pointer hover:bg-accent'
                                    }`}
                                    onClick={() => {
                                      if (!already) {
                                        setEditCrops(prev => [...prev, { id: crop.id, name: displayName }])
                                        setEditQuery('')
                                        setEditResults([])
                                      }
                                    }}
                                  >
                                    <span className="flex-1">
                                      <span className="font-medium">{displayName}</span>
                                      {displayName !== crop.botanicalName && (
                                        <span className="text-muted-foreground italic ml-1 text-xs">{crop.botanicalName}</span>
                                      )}
                                    </span>
                                    {already && <span className="text-xs text-muted-foreground ml-2">{t('alreadyAdded')}</span>}
                                  </li>
                                )
                              })}
                            </ul>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => void saveEdit(bed.id)} disabled={editSaving}>
                            {editSaving ? '…' : t('saveEdit')}
                          </Button>
                          <Button size="sm" variant="outline" onClick={cancelEdit} disabled={editSaving}>
                            {t('cancelEdit')}
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
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
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('bedRelationships')}</p>
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
                            {analysis.unknownPairs.length > 0 && (
                              <details className="text-xs">
                                <summary className="text-muted-foreground cursor-pointer">
                                  ? {(t as (k: string, v: Record<string, unknown>) => string)('unknownPairs', { count: analysis.unknownPairs.length })}
                                </summary>
                                <ul className="mt-1 ml-3 space-y-1">
                                  {analysis.unknownPairs.map(pair => {
                                    const key = [pair.cropAId, pair.cropBId].sort().join(':')
                                    const voted = votedPairs.has(key)
                                    return (
                                      <li key={key} className="flex items-center justify-between gap-2 text-muted-foreground">
                                        <span>{pair.cropAName} × {pair.cropBName}</span>
                                        <button
                                          className={`shrink-0 underline hover:no-underline ${voted ? 'opacity-50 cursor-default' : ''}`}
                                          disabled={voted || votingPair === key}
                                          onClick={() => { if (!voted) void voteResearch(pair) }}
                                        >
                                          {voted ? t('voted') : t('voteResearch')}
                                        </button>
                                      </li>
                                    )
                                  })}
                                </ul>
                              </details>
                            )}
                          </div>
                        ) : null}
                      </>
                    )}
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
