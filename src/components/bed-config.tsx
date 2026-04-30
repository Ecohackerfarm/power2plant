'use client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface BedConfigProps {
  bedCount: number
  bedCapacity: number
  onChange: (bedCount: number, bedCapacity: number) => void
}

export function BedConfig({ bedCount, bedCapacity, onChange }: BedConfigProps) {
  function handleCount(e: React.ChangeEvent<HTMLInputElement>) {
    const v = Math.max(1, parseInt(e.target.value) || 1)
    onChange(v, bedCapacity)
  }

  function handleCapacity(e: React.ChangeEvent<HTMLInputElement>) {
    const v = Math.max(1, parseInt(e.target.value) || 1)
    onChange(bedCount, v)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Step 3 — Beds</CardTitle>
      </CardHeader>
      <CardContent className="flex gap-6">
        <div className="space-y-1">
          <Label htmlFor="bed-count">Number of beds</Label>
          <Input
            id="bed-count"
            type="number"
            min={1}
            max={20}
            value={bedCount}
            onChange={handleCount}
            className="w-24"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="bed-capacity">Plants per bed (max)</Label>
          <Input
            id="bed-capacity"
            type="number"
            min={1}
            max={20}
            value={bedCapacity}
            onChange={handleCapacity}
            className="w-24"
          />
        </div>
      </CardContent>
    </Card>
  )
}
