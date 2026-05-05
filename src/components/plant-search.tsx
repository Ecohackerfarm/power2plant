'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { getDisplayName } from '@/lib/recommend'
import type { CropRow } from '@/lib/crop-rank'

type Crop = CropRow

interface PlantSearchProps {
  wishlistIds: string[]
  onAdd: (cropId: string) => void
  onRemove: (cropId: string) => void
}

export function PlantSearch({ wishlistIds, onAdd, onRemove }: PlantSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Crop[]>([])
  const [wishlistCrops, setWishlistCrops] = useState<Crop[]>([])
  const [searching, setSearching] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const listRef = useRef<HTMLUListElement>(null)

  // Rehydrate wishlist crop objects after page refresh (wishlistIds restored from storage
  // but wishlistCrops local state starts empty).
  useEffect(() => {
    const missing = wishlistIds.filter(id => !wishlistCrops.find(c => c.id === id))
    if (missing.length === 0) return
    fetch(`/api/crops?ids=${missing.join(',')}`)
      .then(r => r.ok ? r.json() : { crops: [] })
      .then(({ crops }: { crops: Crop[] }) => {
        setWishlistCrops(prev => {
          const existingIds = new Set(prev.map(c => c.id))
          return [...prev, ...crops.filter(c => !existingIds.has(c.id))]
        })
      })
      .catch(() => {/* network error — wishlist badges stay empty but IDs preserved */})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wishlistIds])

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      setActiveIndex(-1)
      return
    }
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/crops?q=${encodeURIComponent(query.trim())}`)
        const data = await res.json()
        setResults(data.crops ?? [])
        setActiveIndex(-1)
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return
    const items = listRef.current.querySelectorAll('li')
    items[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const handleAdd = useCallback((crop: Crop) => {
    setWishlistCrops(prev =>
      prev.find(c => c.id === crop.id) ? prev : [...prev, crop],
    )
    onAdd(crop.id)
  }, [onAdd])

  const handleRemove = useCallback((cropId: string) => {
    setWishlistCrops(prev => prev.filter(c => c.id !== cropId))
    onRemove(cropId)
  }, [onRemove])

  const inWishlist = (id: string) => wishlistIds.includes(id)

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const target = activeIndex >= 0 ? results[activeIndex] : results[0]
      if (target && !inWishlist(target.id)) handleAdd(target)
    } else if (e.key === 'Escape') {
      setResults([])
      setActiveIndex(-1)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Step 2 — Choose Plants</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="plant-search">Search by name or botanical name</Label>
          <Input
            id="plant-search"
            placeholder="e.g. tomato, basil, sunflower…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
          />
        </div>

        {searching && <p className="text-sm text-muted-foreground">Searching…</p>}

        {results.length > 0 && (
          <ul ref={listRef} className="space-y-0.5 max-h-64 overflow-y-auto border rounded p-1">
            {results.map((crop, index) => {
              const displayName = getDisplayName(crop)
              const added = inWishlist(crop.id)
              const q = query.trim().toLowerCase()
              const matchedAlias = q.length >= 2
                ? crop.commonNames.find(
                    cn => cn.toLowerCase().includes(q) && cn.toLowerCase() !== displayName.toLowerCase()
                  )
                : undefined
              return (
                <li
                  key={crop.id}
                  className={cn(
                    'flex items-center text-sm px-2 py-1.5 rounded select-none',
                    added
                      ? 'opacity-50 cursor-default'
                      : 'cursor-pointer hover:bg-accent',
                    index === activeIndex && !added && 'bg-accent',
                  )}
                  onClick={() => { if (!added) handleAdd(crop) }}
                >
                  <span className="flex-1 min-w-0">
                    <span className="font-medium">{displayName}</span>
                    {displayName !== crop.botanicalName && (
                      <span className="text-muted-foreground italic ml-1">{crop.botanicalName}</span>
                    )}
                    {matchedAlias && (
                      <span className="block text-xs text-muted-foreground">also: {matchedAlias}</span>
                    )}
                  </span>
                  {added && (
                    <span className="text-xs text-muted-foreground ml-2 shrink-0">Added</span>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {wishlistCrops.length > 0 && (
          <>
            <Separator />
            <div>
              <p className="text-sm font-medium mb-2">
                Your wishlist ({wishlistCrops.length} plants)
              </p>
              <div className="flex flex-wrap gap-2">
                {wishlistCrops.map(crop => (
                  <Badge key={crop.id} variant="secondary" className="gap-1">
                    {getDisplayName(crop)}
                    <button
                      onClick={() => handleRemove(crop.id)}
                      className="ml-1 text-muted-foreground hover:text-foreground"
                      aria-label={`Remove ${getDisplayName(crop)}`}
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          </>
        )}

        {wishlistIds.length < 2 && (
          <p className="text-sm text-muted-foreground">Add at least 2 plants to get a recommendation.</p>
        )}
      </CardContent>
    </Card>
  )
}
