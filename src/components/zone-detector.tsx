'use client'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
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
  const t = useTranslations('ZoneDetector')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showMap, setShowMap] = useState(false)

  async function fetchZone(lat: number, lng: number) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/zone?lat=${lat}&lng=${lng}`)
      if (!res.ok) throw new Error(t('error'))
      const data = await res.json()
      setShowMap(false)
      onZoneDetected(lat, lng, data.minTempC)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error'))
    } finally {
      setLoading(false)
    }
  }

  function detectLocation() {
    if (!navigator.geolocation) {
      setError(t('error'))
      return
    }
    setLoading(true)
    navigator.geolocation.getCurrentPosition(
      pos => fetchZone(pos.coords.latitude, pos.coords.longitude),
      () => {
        setLoading(false)
        setError(t('locationDenied'))
        setShowMap(true)
      },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {minTempC !== null ? (
          <p className="text-green-700 font-medium">
            ✓ {t('detected', { zone: minTempCToZoneName(minTempC) })} ({t('coldestNight', { temp: minTempC })})
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">{t('hint')}</p>
        )}

        <div className="flex gap-2 flex-wrap">
          <Button onClick={detectLocation} disabled={loading}>
            {loading ? t('detecting') : minTempC !== null ? t('redetect') : t('detect')}
          </Button>
          <Button variant="outline" onClick={() => setShowMap(v => !v)}>
            {showMap ? t('hideMap') : t('pickOnMap')}
          </Button>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        {showMap && (
          <MapPicker onSelect={(lat, lng) => fetchZone(lat, lng)} />
        )}
      </CardContent>
    </Card>
  )
}
