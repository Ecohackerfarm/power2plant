'use client'
import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { getDisplayName } from '@/lib/recommend'
import type { CropRow } from '@/lib/crop-rank'

type Crop = CropRow

interface AddBedFormProps {
  onSaved: () => void
}

export function AddBedForm({ onSaved }: AddBedFormProps) {
  const [bedName, setBedName] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Crop[]>([])
  const [selectedCrops, setSelectedCrops] = useState<Crop[]>([])
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return }
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/crops?q=${encodeURIComponent(query.trim())}`)
        const data = await res.json()
        setResults(data.crops ?? [])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  const addCrop = useCallback((crop: Crop) => {
    setSelectedCrops(prev => prev.find(c => c.id === crop.id) ? prev : [...prev, crop])
  }, [])

  const removeCrop = useCallback((cropId: string) => {
    setSelectedCrops(prev => prev.filter(c => c.id !== cropId))
  }, [])

  async function handleSave() {
    if (selectedCrops.length === 0) return
    setSaving(true)
    try {
      const getRes = await fetch('/api/garden/plantings')
      const existing = getRes.ok ? await getRes.json() : { beds: [] }
      const existingBeds = (existing.beds ?? []).map(
        (b: { name: string; plantings: { cropId: string }[] }) => ({
          name: b.name,
          cropIds: b.plantings.map((p: { cropId: string }) => p.cropId),
        }),
      )
      const name = bedName.trim() || `Bed ${existingBeds.length + 1}`
      const allBeds = [...existingBeds, { name, cropIds: selectedCrops.map(c => c.id) }]
      const saveRes = await fetch('/api/garden/plantings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beds: allBeds }),
      })
      if (!saveRes.ok) {
        const err = await saveRes.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? 'Failed to save bed')
      }
      setBedName('')
      setSelectedCrops([])
      setQuery('')
      setResults([])
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save bed')
    } finally {
      setSaving(false)
    }
  }

  const selectedIds = new Set(selectedCrops.map(c => c.id))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add a Bed</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          placeholder='Bed name (optional, e.g. "North Bed")'
          value={bedName}
          onChange={e => setBedName(e.target.value)}
          maxLength={50}
        />
        <div className="space-y-1">
          <Input
            placeholder="Search for plants to add…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoComplete="off"
            aria-label="Search plants"
          />
          {searching && <p className="text-xs text-muted-foreground">Searching…</p>}
          {results.length > 0 && (
            <ul className="space-y-0.5 max-h-48 overflow-y-auto border rounded p-1">
              {results.map(crop => {
                const added = selectedIds.has(crop.id)
                const displayName = getDisplayName(crop)
                return (
                  <li
                    key={crop.id}
                    className={`flex items-center text-sm px-2 py-1.5 rounded select-none ${
                      added ? 'opacity-50 cursor-default' : 'cursor-pointer hover:bg-accent'
                    }`}
                    onClick={() => { if (!added) addCrop(crop) }}
                  >
                    <span className="flex-1">
                      <span className="font-medium">{displayName}</span>
                      {displayName !== crop.botanicalName && (
                        <span className="text-muted-foreground italic ml-1 text-xs">{crop.botanicalName}</span>
                      )}
                    </span>
                    {added && <span className="text-xs text-muted-foreground ml-2">Added</span>}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        {selectedCrops.length > 0 && (
          <>
            <Separator />
            <div className="flex flex-wrap gap-2">
              {selectedCrops.map(crop => (
                <Badge key={crop.id} variant="secondary" className="gap-1">
                  {getDisplayName(crop)}
                  <button
                    onClick={() => removeCrop(crop.id)}
                    className="ml-1 text-muted-foreground hover:text-foreground"
                    aria-label={`Remove ${getDisplayName(crop)}`}
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
          </>
        )}
        <Button
          onClick={handleSave}
          disabled={saving || selectedCrops.length === 0}
          size="sm"
        >
          {saving ? 'Saving…' : 'Save Bed'}
        </Button>
      </CardContent>
    </Card>
  )
}
