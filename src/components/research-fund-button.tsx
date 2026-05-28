'use client'
import { Button } from '@/components/ui/button'
import { ExternalLink } from 'lucide-react'

const KOFI_BASE = process.env.NEXT_PUBLIC_KOFI_URL?.startsWith('https://')
  ? process.env.NEXT_PUBLIC_KOFI_URL : undefined

type Props = {
  cropAName: string
  cropBName: string
  cropAId: string
  cropBId: string
}

export function ResearchFundButton({ cropAName, cropBName, cropAId, cropBId }: Props) {
  if (!KOFI_BASE) {
    return (
      <Button variant="outline" size="sm" disabled title="Payment provider not yet configured">
        Fund research
      </Button>
    )
  }

  const pairKey = cropAId < cropBId ? `${cropAId}-${cropBId}` : `${cropBId}-${cropAId}`
  const url = `${KOFI_BASE}?utm_campaign=research&utm_content=${pairKey}`

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Fund research for ${cropAName} & ${cropBName}`}
      className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow hover:bg-primary/90"
    >
      Fund research
      <ExternalLink className="w-3 h-3" />
    </a>
  )
}
