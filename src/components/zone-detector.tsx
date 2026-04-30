'use client'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { minTempCToZoneName } from '@/lib/recommend'

const MapPicker = dynamic(
  () => import('@/components/map-picker').then(m => m.MapPicker),
  { ssr: false, loading: () => <div className="h-80 bg-muted animate-pulse rounded" /> },
)

interface ZoneDetectorProps {
  minTempC: number | null
  onZoneDetected: (lat: number, lng: number, minTempC: number) => void
}

export function ZoneDetector({ minTempC, onZoneDetected }: ZoneDetectorProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showMap, setShowMap] = useState(false)

  async function fetchZone(lat: number, lng: number) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/zone?lat=${lat}&lng=${lng}`)
      if (!res.ok) throw new Error('Could not look up climate data for this location.')
      const data = await res.json()
      onZoneDetected(lat, lng, data.minTempC)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  function detectLocation() {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.')
      return
    }
    setLoading(true)
    navigator.geolocation.getCurrentPosition(
      pos => fetchZone(pos.coords.latitude, pos.coords.longitude),
      () => {
        setLoading(false)
        setError('Location access denied. Pick your location on the map instead.')
        setShowMap(true)
      },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Step 1 — Your Growing Zone</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {minTempC !== null ? (
          <p className="text-green-700 font-medium">
            ✓ {minTempCToZoneName(minTempC)} (coldest winter night: {minTempC}°C)
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">
            We need your location to filter out plants that won&apos;t survive your winters.
          </p>
        )}

        <div className="flex gap-2 flex-wrap">
          <Button onClick={detectLocation} disabled={loading}>
            {loading ? 'Detecting…' : minTempC !== null ? 'Re-detect location' : 'Detect my location'}
          </Button>
          <Button variant="outline" onClick={() => setShowMap(v => !v)}>
            {showMap ? 'Hide map' : 'Pick on map instead'}
          </Button>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        {showMap && (
          <MapPicker
            onSelect={(lat, lng) => {
              setShowMap(false)
              fetchZone(lat, lng)
            }}
          />
        )}
      </CardContent>
    </Card>
  )
}
