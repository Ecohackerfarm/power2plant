'use client'
import { useState, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

interface Crop {
  id: string
  name: string
  botanicalName: string
  minTempC: number | null
}

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

  // Debounced search
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      return
    }
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
            placeholder="e.g. tomato, basil, Allium…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>

        {searching && <p className="text-sm text-muted-foreground">Searching…</p>}

        {results.length > 0 && (
          <ul className="space-y-1 max-h-64 overflow-y-auto border rounded p-2">
            {results.map(crop => (
              <li key={crop.id} className="flex items-center justify-between text-sm">
                <span>
                  <span className="font-medium">{crop.name}</span>{' '}
                  <span className="text-muted-foreground italic">{crop.botanicalName}</span>
                </span>
                <Button
                  size="sm"
                  variant={inWishlist(crop.id) ? 'secondary' : 'outline'}
                  disabled={inWishlist(crop.id)}
                  onClick={() => handleAdd(crop)}
                >
                  {inWishlist(crop.id) ? 'Added' : 'Add'}
                </Button>
              </li>
            ))}
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
                    {crop.name}
                    <button
                      onClick={() => handleRemove(crop.id)}
                      className="ml-1 text-muted-foreground hover:text-foreground"
                      aria-label={`Remove ${crop.name}`}
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
