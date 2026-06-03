'use client'
import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { useSession } from '@/lib/auth-client'
import { X } from 'lucide-react'
import { getDisplayName } from '@/lib/recommend'

interface InspirationCrop {
  id: string
  name: string
  botanicalName: string
  commonNames: string[]
}

interface MyInspirationsProps {
  onRemove?: (cropId: string) => void
}

export function MyInspirations({ onRemove }: MyInspirationsProps) {
  const t = useTranslations('MyInspirations')
  const { data: session } = useSession()
  const [crops, setCrops] = useState<InspirationCrop[]>([])
  const [loading, setLoading] = useState(false)

  const fetchInspirations = useCallback(async () => {
    if (!session) return
    setLoading(true)
    try {
      const res = await fetch('/api/garden/inspirations')
      if (res.ok) {
        const data: { inspirations: InspirationCrop[] } = await res.json()
        setCrops(data.inspirations)
      }
    } finally {
      setLoading(false)
    }
  }, [session])

  useEffect(() => {
    void fetchInspirations()
  }, [fetchInspirations])

  async function handleRemove(cropId: string) {
    setCrops(prev => prev.filter(c => c.id !== cropId))
    await fetch('/api/garden/inspirations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cropId, action: 'remove' }),
    }).catch(() => {})
    onRemove?.(cropId)
  }

  if (!session) return null

  if (loading) return <p className="text-sm text-muted-foreground">{t('loading')}</p>

  if (crops.length === 0) {
    return (
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
        <p className="text-xs text-muted-foreground">{t('emptyHint')}</p>
      </div>
    )
  }

  return (
    <ul className="space-y-1">
      {crops.map(crop => (
        <li key={crop.id} className="flex items-center gap-2 text-sm">
          <Link
            href={`/plants/${crop.id}`}
            className="flex-1 hover:underline"
          >
            <span className="font-medium">{getDisplayName(crop)}</span>
            {getDisplayName(crop) !== crop.botanicalName && (
              <span className="text-muted-foreground italic ml-1.5 text-xs">{crop.botanicalName}</span>
            )}
          </Link>
          <button
            onClick={() => void handleRemove(crop.id)}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label={t('remove')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </li>
      ))}
    </ul>
  )
}
