'use client'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'

interface BedConfigProps {
  bedCount: number
  bedCapacity: number
  bedMax?: number
  plantsPerBedMax?: number
  onChange: (bedCount: number, bedCapacity: number) => void
}

export function BedConfig({
  bedCount,
  bedCapacity,
  bedMax = 20,
  plantsPerBedMax = 5,
  onChange,
}: BedConfigProps) {
  const t = useTranslations('BedConfig')

  const clampedCount = Math.min(bedCount, bedMax)
  const clampedCapacity = Math.min(bedCapacity, plantsPerBedMax)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="bed-count">{t('bedCount')}</Label>
            <span className="text-sm font-medium tabular-nums w-6 text-right">{clampedCount}</span>
          </div>
          <input
            id="bed-count"
            type="range"
            min={1}
            max={bedMax}
            value={clampedCount}
            onChange={e => onChange(parseInt(e.target.value), clampedCapacity)}
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>1</span>
            <span>{bedMax}</span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="bed-capacity">{t('bedCapacity')}</Label>
            <span className="text-sm font-medium tabular-nums w-6 text-right">{clampedCapacity}</span>
          </div>
          <input
            id="bed-capacity"
            type="range"
            min={1}
            max={plantsPerBedMax}
            value={clampedCapacity}
            onChange={e => onChange(clampedCount, parseInt(e.target.value))}
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>1</span>
            <span>{plantsPerBedMax}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
